export const AUTH_CONFIG = Symbol('AUTH_CONFIG');
export interface AuthConfig {
  enabled: boolean;
  origin: string;
  secure: boolean;
}

export function authConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const mode = env.AUTH_MODE || 'none';
  if (!['none', 'local'].includes(mode)) throw new Error('Invalid AUTH_MODE');
  const config: AuthConfig = {
    enabled: mode === 'local',
    origin: '',
    secure: true,
  };
  if (!config.enabled) return config;
  let origin: URL;
  try {
    origin = new URL(env.APP_ORIGIN || '');
  } catch {
    throw new Error('AUTH_MODE=local requires APP_ORIGIN');
  }
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path');
  if (
    env.AUTH_COOKIE_SECURE &&
    !['true', 'false'].includes(env.AUTH_COOKIE_SECURE)
  )
    throw new Error('Invalid AUTH_COOKIE_SECURE');
  const secure = env.AUTH_COOKIE_SECURE !== 'false';
  if (secure && origin.protocol !== 'https:')
    throw new Error('Secure cookies require HTTPS APP_ORIGIN');
  return {
    enabled: true,
    origin: origin.origin,
    secure,
  };
}
