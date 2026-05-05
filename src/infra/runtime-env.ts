import type { AiConnectionSettings } from '../core/types';

interface RuntimeEnv {
  ai?: Partial<AiConnectionSettings>;
}

declare global {
  var __DIFFICULTY_ENGINE_ENV__: RuntimeEnv | undefined;
}

export function loadRuntimeAiConnectionPatch():
  | Partial<AiConnectionSettings>
  | undefined {
  const ai = globalThis.__DIFFICULTY_ENGINE_ENV__?.ai;
  if (!ai || Object.keys(ai).length === 0) return undefined;
  return {
    ...ai,
    enabled: ai.enabled ?? Boolean(ai.apiKey),
  };
}
