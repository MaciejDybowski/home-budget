import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { configureFrontend } from './frontend';
import { HealthController } from './health.controller';

describe('External frontend hosting', () => {
  let app: NestExpressApplication;
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'homebudget-frontend-'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<html>HomeBudget test</html>');
    writeFileSync(join(root, 'assets', 'app-hash.js'), '/* test */');
    writeFileSync(join(root, 'sw.js'), '/* service worker */');
    const module = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureFrontend(app, root);
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(root, { recursive: true, force: true });
  });

  it.each(['/', '/transactions', '/analytics'])(
    'serves SPA at %s',
    async (path) => {
      await request(app.getHttpServer())
        .get(path)
        .expect(200)
        .expect('Cache-Control', 'no-cache')
        .expect('X-Robots-Tag', 'noindex, nofollow')
        .expect(/HomeBudget test/);
    },
  );

  it('serves liveness independently of the database', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect({ status: 'ok' });
  });

  it.each([
    '/api',
    '/api/v1/missing',
    '/API/v1/missing',
    '/assets/missing.js',
    '/assets/missing',
    '/missing.css',
    '/.env',
  ])(
    'does not mask missing API routes, assets or hidden files at %s',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(404);
    },
  );

  it('does not serve the SPA for writes or JSON requests', async () => {
    await request(app.getHttpServer()).post('/transactions').expect(404);
    await request(app.getHttpServer())
      .get('/transactions')
      .set('Accept', 'application/json')
      .expect(404);
  });

  it('caches fingerprinted assets, but revalidates the service worker', async () => {
    await request(app.getHttpServer())
      .get('/assets/app-hash.js')
      .expect(200)
      .expect('Cache-Control', 'public, max-age=31536000, immutable');
    await request(app.getHttpServer())
      .get('/sw.js')
      .expect(200)
      .expect('Cache-Control', 'no-cache');
  });

  it('fails when the frontend build is missing', () => {
    expect(() => configureFrontend(app, join(root, 'missing'))).toThrow();
  });
});
