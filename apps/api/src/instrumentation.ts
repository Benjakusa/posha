import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { validateApiConfig } from './api-config.js';

const config = validateApiConfig();
const traceExporter = config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  ? new OTLPTraceExporter({ url: config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT })
  : undefined;

export const telemetrySdk = new NodeSDK({
  ...(traceExporter ? { traceExporter } : {}),
  resource: resourceFromAttributes({ 'service.name': config.OTEL_SERVICE_NAME }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

export const telemetryReady = Promise.resolve(telemetrySdk.start());
