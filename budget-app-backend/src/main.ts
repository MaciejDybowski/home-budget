import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DatabaseErrorsFilter } from './errors.filter';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { configureFrontend } from './frontend';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  if (process.env.SERVE_FRONTEND === 'true') {
    configureFrontend(app, join(__dirname, '..', 'public'));
  }

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new DatabaseErrorsFilter());
  app.enableShutdownHooks();
  app.enableCors({
    origin: process.env.CORS_ORIGIN || false,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true, // jeśli używasz ciasteczek/sesji
  });

  await app.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0');
}
bootstrap();
