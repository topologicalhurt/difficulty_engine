import type { AiRecommendationContext, AppState } from '../core/types';
import {
  buildAiRecommendationContext,
  contextDigest,
} from './ai-recommendation-context';

export interface AiRequestContextSnapshot {
  digest: string;
  settingsRevision: number;
  provider: string;
  model: string;
  prompt?: string;
  clarificationsJson?: string;
}

interface AiRequestContextOptions {
  includePrompt?: boolean;
  includeClarifications?: boolean;
}

export function captureAiRequestContext(
  state: AppState,
  options: AiRequestContextOptions = {},
): {
  context: AiRecommendationContext;
  snapshot: AiRequestContextSnapshot;
} {
  const context = buildAiRecommendationContext(state);
  return {
    context,
    snapshot: {
      digest: contextDigest(context),
      settingsRevision: state.ui.aiSettingsRevision,
      provider: state.ui.aiConnection.provider,
      model: state.ui.aiConnection.model,
      prompt: options.includePrompt ? state.ui.aiPrompt : undefined,
      clarificationsJson: options.includeClarifications
        ? JSON.stringify(state.ui.aiClarificationMessages)
        : undefined,
    },
  };
}

export function aiRequestContextChanged(
  state: AppState,
  snapshot: AiRequestContextSnapshot,
): boolean {
  const current = captureAiRequestContext(state, {
    includePrompt: snapshot.prompt != null,
    includeClarifications: snapshot.clarificationsJson != null,
  }).snapshot;
  return (
    current.digest !== snapshot.digest ||
    current.settingsRevision !== snapshot.settingsRevision ||
    current.provider !== snapshot.provider ||
    current.model !== snapshot.model ||
    current.prompt !== snapshot.prompt ||
    current.clarificationsJson !== snapshot.clarificationsJson
  );
}
