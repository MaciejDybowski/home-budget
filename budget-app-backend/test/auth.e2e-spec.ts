import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import {
  AUTH_CONFIG,
  authConfig,
  type AuthConfig,
} from '../src/auth/auth.config';

const url = process.env.TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;
const origin = 'https://budget.example.org';
const password = 'test-only-long-password';

integration('Optional authentication against isolated PostgreSQL', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let config: AuthConfig;
  let passwordHash: string;
  const csrfToken = (response: request.Response) =>
    (response.body as { csrfToken: string }).csrfToken;
  const cookies = (response: request.Response) =>
    (response.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
  const start = async (settings: AuthConfig) => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG)
      .useValue(settings)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    db = app.get(PrismaService);
  };
  beforeAll(async () => {
    if (!url || !/\/(budget_integration|budget_test)(\?|$)/.test(url))
      throw new Error('Use an explicitly isolated test database.');
    process.env.DATABASE_URL = url;
    passwordHash = await argon2.hash(password, {
      memoryCost: 32768,
      timeCost: 3,
      parallelism: 1,
    });
    config = authConfig({
      AUTH_MODE: 'local',
      APP_ORIGIN: origin,
    });
    await start(config);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await db.authSession.deleteMany();
    await db.authAttempt.deleteMany();
    await db.authAccount.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        username: 'family',
        passwordHash,
        version: 'test-version',
      },
      update: { username: 'family', passwordHash, version: 'test-version' },
    });
  });
  const status = () =>
    request(app.getHttpServer()).get('/api/v1/auth/status').expect(200);
  const login = async () => {
    const csrf = await status();
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', cookies(csrf))
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken(csrf))
      .send({ username: 'family', password })
      .expect(201);
  };
  it.each([
    '/api/v1/household',
    '/api/v1/categories',
    '/api/v1/sources',
    '/api/v1/expenses',
    '/api/v1/incomes',
    '/api/v1/meters/types',
    '/api/v1/meters/readings',
  ])('protects both current and legacy API: %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
  });
  it('protects mutations and uploads before parsing/writing', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/household/categories')
      .send({ name: 'must not exist' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/household/csv/inspect')
      .attach('file', Buffer.from('test'), 'test.csv')
      .expect(401);
  });
  it('keeps health public and status free of configuration secrets', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
    const response = await status();
    expect(response.body).toMatchObject({
      enabled: true,
      authenticated: false,
    });
    expect(JSON.stringify(response.body)).not.toContain(passwordHash);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rejects missing CSRF and foreign origins even for login', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'family', password })
      .expect(403);
    const csrf = await status();
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', cookies(csrf))
      .set('Origin', 'https://attacker.example')
      .set('X-CSRF-Token', csrfToken(csrf))
      .send({ username: 'family', password })
      .expect(403);
  });
  it('uses a generic credential error and durable attempt limits', async () => {
    const csrf = await status();
    for (let i = 0; i < 10; i++) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', cookies(csrf))
        .set('Origin', origin)
        .set('X-Forwarded-For', `203.0.113.${i + 1}`)
        .set('X-CSRF-Token', csrfToken(csrf))
        .send({
          username: i % 2 ? 'family' : 'missing',
          password: 'wrong-password',
        })
        .expect(401);
      expect((response.body as { message: string }).message).toBe(
        'Nieprawidłowy login lub hasło.',
      );
    }
    await app.close();
    await start(config);
    const renewed = await status();
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', cookies(renewed))
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken(renewed))
      .send({ username: 'family', password })
      .expect(429);
  });
  it('stores only a token hash, enforces cookie flags, persists through restart and revokes logout', async () => {
    const response = await login();
    const cookie = cookies(response);
    const headers = response.headers['set-cookie'] as unknown as string[];
    expect(
      headers.some(
        (c) =>
          c.startsWith('__Host-hb_session=') &&
          /HttpOnly/.test(c) &&
          /Secure/.test(c) &&
          /SameSite=Lax/.test(c) &&
          /Path=\//.test(c),
      ),
    ).toBe(true);
    const saved = await db.authSession.findFirstOrThrow();
    expect(cookie).not.toContain(saved.tokenHash);
    await app.close();
    await start(config);
    await request(app.getHttpServer())
      .get('/api/v1/household?month=2026-11')
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/household/categories')
      .set('Cookie', cookie)
      .send({ name: 'csrf blocked' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/household/csv/inspect')
      .set('Cookie', cookie)
      .attach('file', Buffer.from('test'), 'test.csv')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken(response))
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/household')
      .set('Cookie', cookie)
      .expect(401);
  });
  it('rejects expired sessions and sessions from previous credentials', async () => {
    const response = await login();
    await db.authSession.updateMany({ data: { expiresAt: new Date(0) } });
    await request(app.getHttpServer())
      .get('/api/v1/household')
      .set('Cookie', cookies(response))
      .expect(401);
    const renewed = await login();
    await app.close();
    await start(config);
    await db.authAccount.update({
      where: { id: 1 },
      data: { version: 'changed' },
    });
    await request(app.getHttpServer())
      .get('/api/v1/household')
      .set('Cookie', cookies(renewed))
      .expect(401);
    await app.close();
    await start(config);
  });
  it('supports legacy none mode and invalidates sessions before re-enabling auth', async () => {
    const response = await login();
    await app.close();
    await start(authConfig({}));
    await request(app.getHttpServer())
      .get('/api/v1/household?month=2026-11')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/status')
      .expect({ enabled: false, authenticated: false });
    expect(await db.authSession.count()).toBe(0);
    await app.close();
    await start(config);
    await request(app.getHttpServer())
      .get('/api/v1/household')
      .set('Cookie', cookies(response))
      .expect(401);
  });
  it('allows the first browser visitor to create exactly one account, including concurrent setup', async () => {
    await db.authAccount.deleteMany();
    const initial = await status();
    expect((initial.body as { setupRequired: boolean }).setupRequired).toBe(
      true,
    );
    const setup = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/setup')
        .set('Cookie', cookies(initial))
        .set('Origin', origin)
        .set('X-CSRF-Token', csrfToken(initial))
        .send({ username: 'first-family', password });
    const responses = await Promise.all([setup(), setup()]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.authAccount.count()).toBe(1);
    const account = await db.authAccount.findUniqueOrThrow({
      where: { id: 1 },
    });
    expect(account.username).toBe('first-family');
    expect(account.passwordHash).not.toBe(password);
    expect(await argon2.verify(account.passwordHash, password)).toBe(true);
    await setup().expect(409);
    const winner = responses.find((r) => r.status === 201)!;
    await request(app.getHttpServer())
      .get('/api/v1/household?month=2026-11')
      .set('Cookie', cookies(winner))
      .expect(200);
  });
  it('changes username and password only after current-password verification, keeps the current session and revokes others', async () => {
    const first = await login();
    const second = await login();
    const changedPassword = 'new-test-password-long';
    const csrf = csrfToken(first);
    const updated = await request(app.getHttpServer())
      .patch('/api/v1/auth/profile')
      .set('Cookie', cookies(first))
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({
        username: 'new-family',
        currentPassword: password,
        newPassword: changedPassword,
      })
      .expect(200);
    expect((updated.body as { username: string }).username).toBe('new-family');
    expect(await db.authSession.count()).toBe(1);
    await request(app.getHttpServer())
      .get('/api/v1/auth/profile')
      .set('Cookie', cookies(updated))
      .expect({ username: 'new-family' });
    await request(app.getHttpServer())
      .get('/api/v1/household?month=2026-11')
      .set('Cookie', cookies(updated))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/household?month=2026-11')
      .set('Cookie', cookies(second))
      .expect(401);
    const renewed = await status();
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', cookies(renewed))
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken(renewed))
      .send({ username: 'new-family', password: changedPassword })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/auth/profile')
      .set('Cookie', `${cookies(updated)}; __Host-hb_csrf=${csrfToken(first)}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken(first))
      .send({ username: 'attacker', currentPassword: 'incorrect-password' })
      .expect(401);
    expect(
      (await db.authAccount.findUniqueOrThrow({ where: { id: 1 } })).username,
    ).toBe('new-family');
  });
  it('requires CSRF protection for profile changes', async () => {
    const session = await login();
    await request(app.getHttpServer())
      .patch('/api/v1/auth/profile')
      .set('Cookie', cookies(session))
      .set('Origin', origin)
      .send({ username: 'forged', currentPassword: password })
      .expect(403);
  });
});
