import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ConnectMetricsGuard } from './connect-metrics.guard.js';
import { ConnectObservabilityService } from './connect-observability.service.js';

@Controller()
@UseGuards(ConnectMetricsGuard)
export class ConnectMetricsController {
  constructor(private readonly metrics: ConnectObservabilityService) {}

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  render() {
    return this.metrics.renderPrometheus();
  }
}
