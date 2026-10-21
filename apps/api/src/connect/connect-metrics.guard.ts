import { timingSafeEqual } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

interface MetricsRequest {
  headers: { authorization?: string };
}

@Injectable()
export class ConnectMetricsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const token = process.env.METRICS_BEARER_TOKEN;
    if (!token || token.length < 32)
      throw new ServiceUnavailableException('Metrics scrape authentication is not configured.');
    const request = context.switchToHttp().getRequest<MetricsRequest>();
    const authorization = request.headers.authorization;
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expectedBytes = Buffer.from(token);
    const suppliedBytes = Buffer.from(supplied);
    if (
      expectedBytes.length !== suppliedBytes.length ||
      !timingSafeEqual(expectedBytes, suppliedBytes)
    )
      throw new UnauthorizedException();
    return true;
  }
}
