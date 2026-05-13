import type { AiConnectionSettings } from '../core/types';
import { textInputControl } from './form-controls';

const AI_KEY_USERNAME_PREFIX = 'difficulty-engine-ai';

interface CredentialNavigator {
  credentials?: {
    get(options: {
      password: true;
      mediation?: 'silent' | 'optional' | 'required';
    }): Promise<Credential | null>;
    store(credential: Credential): Promise<void>;
  };
}

interface PasswordCredentialConstructor {
  new (form: HTMLFormElement): Credential;
}

function credentialNavigator(): CredentialNavigator {
  return navigator as unknown as CredentialNavigator;
}

function passwordCredentialConstructor(): PasswordCredentialConstructor | null {
  const candidate = (globalThis as { PasswordCredential?: unknown })
    .PasswordCredential;
  return typeof candidate === 'function'
    ? (candidate as PasswordCredentialConstructor)
    : null;
}

export function browserPasswordManagerAvailable(): boolean {
  return Boolean(credentialNavigator().credentials && passwordCredentialConstructor());
}

function credentialUsername(connection: AiConnectionSettings): string {
  return `${AI_KEY_USERNAME_PREFIX}:${connection.provider}`;
}

export async function rememberAiApiKey(
  connection: AiConnectionSettings,
): Promise<void> {
  if (!connection.apiKey.trim()) {
    throw new Error('Enter an API key before asking the browser to remember it.');
  }
  const credentials = credentialNavigator().credentials;
  const PasswordCredential = passwordCredentialConstructor();
  if (!credentials || !PasswordCredential) {
    throw new Error(
      'This browser does not expose password-manager storage to the app.',
    );
  }
  const form = document.createElement('form');
  form.append(
    textInputControl({
      name: 'username',
      autocomplete: 'username',
      value: '',
      focusKey: 'ai:credentialUsername',
      onInput: () => undefined,
    }),
    textInputControl({
      name: 'password',
      autocomplete: 'current-password',
      type: 'password',
      value: '',
      focusKey: 'ai:credentialPassword',
      onInput: () => undefined,
    }),
  );
  const username = form.elements.namedItem('username');
  const password = form.elements.namedItem('password');
  if (username instanceof HTMLInputElement) {
    username.value = credentialUsername(connection);
  }
  if (password instanceof HTMLInputElement) {
    password.value = connection.apiKey;
  }
  await credentials.store(new PasswordCredential(form));
}

export async function recallAiApiKey(
  connection: AiConnectionSettings,
): Promise<string> {
  const credentials = credentialNavigator().credentials;
  if (!credentials) {
    throw new Error(
      'This browser does not expose password-manager recall to the app.',
    );
  }
  const credential = await credentials.get({
    password: true,
    mediation: 'optional',
  });
  const passwordCredential = credential as Credential & {
    id?: string;
    password?: string;
  };
  if (
    passwordCredential?.id !== credentialUsername(connection) ||
    !passwordCredential.password
  ) {
    throw new Error('No saved API key was returned for this provider.');
  }
  return passwordCredential.password;
}
