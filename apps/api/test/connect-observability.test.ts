import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { ConnectMetricsGuard } from '../src/connect/connect-metrics.guard.js';
import { ConnectObservabilityService } from '../src/connect/connect-observability.service.js';

afterEach(() => vi.unstubAllEnvs());

describe('Connect Prometheus metrics (P2-08)', () => {
  it('exports queue depth, session/report counters, and a queue-wait histogram without identifiers', () => {
    const metrics = new ConnectObservabilityService();
    metrics.setQueueDepth(12);
    metrics.recordMatch([500, 2_500]);
    metrics.recordReport();
    const output = metrics.renderPrometheus();

    expect(output).toContain('posha_connect_queue_depth 12');
    expect(output).toContain('posha_connect_sessions_started_total 1');
    expect(output).toContain('posha_connect_reports_total 1');
    expect(output).toContain('posha_connect_match_wait_seconds_bucket{le="0.5"} 1');
    expect(output).toContain('posha_connect_match_wait_seconds_count 2');
    expect(output).not.toMatch(/user_id|session_id|report_id|lane=/i);
  });

  it('ignores invalid queue gauges and keeps observations monotonic', () => {
    const metrics = new ConnectObservabilityService();
    metrics.setQueueDepth(4);
    metrics.setQueueDepth(Number.NaN);
    metrics.recordMatch([0, 65_000]);
    const output = metrics.renderPrometheus();

    expect(output).toContain('posha_connect_queue_depth 4');
    expect(output).toContain('posha_connect_match_wait_seconds_bucket{le="+Inf"} 2');
    expect(output).toContain('posha_connect_match_wait_seconds_sum 65');
  });

  it('fails closed until a strong scrape token is configured and compares tokens safely', () => {
    const guard = new ConnectMetricsGuard();
    const context = (authorization?: string) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
      }) as unknown as ExecutionContext;
    vi.stubEnv('METRICS_BEARER_TOKEN', '');
    expect(() => guard.canActivate(context('Bearer secret'))).toThrow(ServiceUnavailableException);

    const token = 'a'.repeat(40);
    vi.stubEnv('METRICS_BEARER_TOKEN', token);
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context('Bearer ' + 'b'.repeat(40)))).toThrow(
      UnauthorizedException,
    );
    expect(guard.canActivate(context('Bearer ' + token))).toBe(true);
  });
});
