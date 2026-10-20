import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { API_CONFIG, validateApiConfig } from './api-config.js';
import { HealthController } from './health/health.controller.js';
import { HealthProbeGuard } from './health/health-probe.guard.js';
import { createPinoHttpOptions } from './logging.js';

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: createPinoHttpOptions() })],
  controllers: [HealthController],
  providers: [
    HealthProbeGuard,
    {
      provide: API_CONFIG,
      useFactory: () => validateApiConfig(),
    },
  ],
})
export class AppModule {}
