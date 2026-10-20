import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { validateApiConfig } from './api-config.js';
import { ProblemDetailsExceptionFilter } from './problem-details.filter.js';
import { telemetryReady, telemetrySdk } from './instrumentation.js';

async function bootstrap(): Promise<void> {
  await telemetryReady;
  const config = validateApiConfig();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new ProblemDetailsExceptionFilter());
  await app.listen(config.PORT);

  const shutdown = async (): Promise<void> => {
    await app.close();
    await telemetrySdk.shutdown();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

void bootstrap();
