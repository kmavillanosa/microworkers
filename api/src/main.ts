import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const certPath = process.env.SSL_CERT_PATH;
  const keyPath = process.env.SSL_KEY_PATH;
  const httpsOptions =
    certPath && keyPath
      ? {
          cert: readFileSync(certPath),
          key: readFileSync(keyPath),
        }
      : undefined;

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    ...(httpsOptions && { httpsOptions }),
  });

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [
        'http://localhost:5173',
        'http://192.168.0.102:5173',
        'http://localhost:5174',
        'http://192.168.0.102:5174',
      ];
  app.enableCors({ origin: corsOrigins });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
