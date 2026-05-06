import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const RUNTIME_ENV_ASSIGNMENT =
  'globalThis.__DIFFICULTY_ENGINE_ENV__ = {};';

const ENV_KEY_MAP = {
  DIFFICULTY_ENGINE_AI_API_KEY: ['ai', 'apiKey'],
  DIFFICULTY_ENGINE_AI_PROVIDER: ['ai', 'provider'],
  DIFFICULTY_ENGINE_AI_MODEL: ['ai', 'model'],
  DIFFICULTY_ENGINE_AI_ENDPOINT_URL: ['ai', 'endpointUrl'],
};

function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return undefined;
  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex <= 0) return undefined;
  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

export async function readDotEnv(rootDir) {
  try {
    const text = await readFile(resolve(rootDir, '.env'), 'utf8');
    return Object.fromEntries(
      text.split(/\r?\n/u).map(parseDotEnvLine).filter(Boolean),
    );
  } catch {
    return {};
  }
}

export function buildRuntimeEnv(dotEnv, processEnv = process.env) {
  const config = {};
  for (const [envKey, [section, key]] of Object.entries(ENV_KEY_MAP)) {
    const value = processEnv[envKey] ?? dotEnv[envKey];
    if (!value) continue;
    config[section] = {
      ...(config[section] ?? {}),
      [key]: value,
    };
  }
  if (config.ai?.apiKey) {
    config.ai.enabled = true;
  }
  return config;
}

export function redactRuntimeEnvSecrets(config) {
  const redacted = { ...config };
  if (redacted.ai && typeof redacted.ai === 'object') {
    const safeAi = { ...redacted.ai };
    delete safeAi.apiKey;
    delete safeAi.enabled;
    if (Object.keys(safeAi).length) {
      redacted.ai = safeAi;
    } else {
      delete redacted.ai;
    }
  }
  return redacted;
}

export async function readRuntimeEnv(rootDir, processEnv = process.env) {
  return buildRuntimeEnv(await readDotEnv(rootDir), processEnv);
}

export function runtimeEnvAssignment(config) {
  return `globalThis.__DIFFICULTY_ENGINE_ENV__ = ${JSON.stringify(config)};`;
}

export function publicRuntimeEnvAssignment(config) {
  return runtimeEnvAssignment(redactRuntimeEnvSecrets(config));
}
