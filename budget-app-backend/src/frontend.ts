import { NestExpressApplication } from '@nestjs/platform-express';
import { Request, Response, NextFunction } from 'express';
import { accessSync } from 'node:fs';
import { ServerResponse } from 'node:http';
import { extname, join } from 'node:path';

export function configureFrontend(app: NestExpressApplication, root: string) {
  // Fail startup instead of silently deploying an API without the UI.
  const index = join(root, 'index.html');
  accessSync(index);

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (/^\/api(?:\/|$)/i.test(req.path)) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });
  app.useStaticAssets(root, {
    index: false,
    setHeaders(res: ServerResponse, file: string) {
      res.setHeader(
        'Cache-Control',
        file.startsWith(join(root, 'assets') + '/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      );
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Never turn missing API routes or missing assets into a successful SPA page.
    if (
      !['GET', 'HEAD'].includes(req.method) ||
      /^\/api(?:\/|$)/i.test(req.path) ||
      /^\/assets(?:\/|$)/.test(req.path) ||
      req.path.startsWith('/.') ||
      extname(req.path) ||
      !req.accepts('html')
    ) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
