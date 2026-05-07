import type {
  AcquiredDocument,
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import { isLawfulDocumentCandidate } from './document-acquisition';
import type { QBittorrentClient } from './qbittorrent-client';
import {
  documentRefId,
  documentStatus,
  fileMatchScore,
  rankedTorrentFiles,
  selectedTorrentFileIsTrusted,
  torrentAvailability,
} from './qbittorrent-selection';
import type { TorrentFile, TorrentInfo } from './qbittorrent-types';
import {
  basename,
  contentTypeFromPath,
  joinStoragePath,
  PDF_MIME,
  sourceContentKindFromPath,
  TEXT_MIME,
} from './qbittorrent-file-kinds';
import { isoTimestamp } from './cache-time';

async function selectedTorrentFile(
  client: QBittorrentClient,
  info: TorrentInfo,
  candidate: DocumentCandidate,
  request: DocumentAcquisitionRequest,
): Promise<TorrentFile | null> {
  if (!info.hash) return null;
  const files = await client.torrentFiles(info.hash).catch(() => []);
  const selected =
    rankedTorrentFiles(files, request).find((file) =>
      selectedTorrentFileIsTrusted(file, candidate, request),
    ) ?? null;
  const selectedIndex = selected?.index;
  if (!selected) {
    const allIndexes = files
      .map((file) => file.index)
      .filter((index): index is number => index != null);
    await client.setFilePriority(info.hash, allIndexes, 0);
    return null;
  }
  if (selectedIndex != null) {
    const otherIndexes = files
      .map((file) => file.index)
      .filter(
        (index): index is number => index != null && index !== selectedIndex,
      );
    await client.setFilePriority(info.hash, otherIndexes, 0);
    await client.setFilePriority(info.hash, [selectedIndex], 7);
  }
  return selected;
}

async function readCompletedDocument(
  client: QBittorrentClient,
  storagePath: string,
  contentType: string,
  status: string,
): Promise<{ text?: string; bytes?: Uint8Array }> {
  if (status !== 'complete') return {};
  if (contentType === TEXT_MIME) {
    return {
      text: await client.readTextDocument(storagePath).catch(() => undefined),
    };
  }
  if (contentType !== PDF_MIME) return {};
  const text = await client
    .readTextDocument(storagePath)
    .catch(() => undefined);
  if (text) return { text };
  return {
    bytes: await client.readByteDocument(storagePath).catch(() => undefined),
  };
}

export async function acquireTorrentDocument(
  client: QBittorrentClient,
  candidate: DocumentCandidate,
  request: DocumentAcquisitionRequest,
): Promise<AcquiredDocument | null> {
  if (!isLawfulDocumentCandidate(candidate, request.policy)) return null;
  await client.login();
  let info = await client.torrentInfo(candidate);
  if (!info) {
    await client.addTorrent(candidate);
    info = await client.torrentInfo(candidate);
  }
  const savePath = await client.effectiveSavePath();
  let storagePath =
    info?.content_path ?? info?.save_path ?? savePath ?? candidate.title;
  let selected: TorrentFile | null = null;
  if (info?.hash) {
    selected = await selectedTorrentFile(client, info, candidate, request);
    if (!selected) return null;
    if (selected?.index != null) {
      storagePath = joinStoragePath(
        info.save_path ?? savePath,
        selected.name ?? storagePath,
      );
    }
    await client.resumeTorrent(info.hash);
  }

  const contentType = contentTypeFromPath(storagePath ?? candidate.sourceUrl);
  const status = documentStatus(info, selected);
  const { text, bytes } = await readCompletedDocument(
    client,
    storagePath,
    contentType,
    status,
  );
  const completedFileExists =
    status === 'complete'
      ? await client.documentExists(storagePath).catch(() => false)
      : false;
  const now = isoTimestamp();
  const fileName = basename(storagePath);
  const progress = selected?.progress ?? info?.progress ?? 0;
  const availability = torrentAvailability(info);
  const contentKind = sourceContentKindFromPath(
    storagePath,
    candidate.contentKind,
  );
  const refStatus =
    status === 'complete' && !completedFileExists
      ? 'failed'
      : text || bytes
        ? 'complete'
        : status === 'complete' &&
            (contentKind === 'text' || contentKind === 'ocr_text')
          ? 'unreadable'
          : status;

  return {
    candidateId: candidate.id,
    provider: 'qbittorrent',
    sourceUrl: candidate.sourceUrl,
    storagePath,
    contentType,
    accessBasis: candidate.accessBasis ?? 'user_provided',
    confidence: candidate.confidence,
    text,
    bytes,
    acquiredAt: now,
    documentRef: {
      id: documentRefId(info?.hash, selected?.index, storagePath),
      provider: 'qbittorrent',
      sourceUrl: candidate.sourceUrl,
      torrentHash: info?.hash,
      fileIndex: selected?.index,
      fileName,
      storagePath,
      contentKind,
      contentType,
      accessBasis: candidate.accessBasis ?? 'user_provided',
      status: refStatus,
      matchScore: selected
        ? fileMatchScore(selected, request)
        : (candidate.matchScore ?? candidate.confidence),
      availability: {
        ...availability,
        seeders: candidate.seeders ?? availability.seeders,
        peers: candidate.peers ?? availability.peers,
        progress,
        state: availability.state,
        reason:
          refStatus === 'failed'
            ? 'Completed torrent file is missing from the configured data folder.'
            : status === 'stalled'
            ? 'Torrent is stalled or has no active download progress.'
            : undefined,
      },
      provenance: {
        provider: 'qbittorrent',
        sourceUrl: candidate.sourceUrl,
        fetchedAt: now,
        confidence: candidate.confidence,
        strategy: 'background_acquisition',
      },
      createdAt: now,
      updatedAt: now,
    },
  };
}
