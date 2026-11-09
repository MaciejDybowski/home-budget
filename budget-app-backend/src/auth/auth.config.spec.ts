import { authConfig } from './auth.config';

describe('Authentication configuration', () => {
  let env: NodeJS.ProcessEnv;
  beforeAll(() => {
    env = {
      AUTH_MODE: 'local',
      APP_ORIGIN: 'https://budget.example.org',
    };
  });
  it('preserves legacy installations with no auth settings', () => {
    expect(authConfig({}).enabled).toBe(false);
    expect(authConfig({ AUTH_MODE: 'none' }).enabled).toBe(false);
  });
  it('allows browser setup without predefined credentials', () => {
    expect(authConfig(env)).toMatchObject({
      enabled: true,
      secure: true,
      origin: 'https://budget.example.org',
    });
  });
  it.each([
    { AUTH_MODE: 'typo' },
    { APP_ORIGIN: '' },
    { APP_ORIGIN: 'https://budget.example.org/path' },
    { APP_ORIGIN: 'https://user:password@budget.example.org' },
    { APP_ORIGIN: 'http://localhost:3001' },
    { AUTH_COOKIE_SECURE: 'yes' },
  ])('rejects incomplete/unsafe local configuration: %s', (change) => {
    expect(() => authConfig({ ...env, ...change })).toThrow();
  });
  it('allows explicitly configured HTTP for a trusted LAN', () => {
    expect(
      authConfig({
        ...env,
        APP_ORIGIN: 'http://localhost:3001',
        AUTH_COOKIE_SECURE: 'false',
      }).secure,
    ).toBe(false);
  });
});
