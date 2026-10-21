import { Body, Controller, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthAccessClaims } from '../auth/auth.service.js';
import {
  AccountStatusGuard,
  AgeLevelGuard,
  AuthGuard,
  RateLimitGuard,
} from '../policies/policy.guards.js';
import { RateLimit, RequiredAge } from '../policies/policy-metadata.js';
import { ConnectSafetyService } from './connect-safety.service.js';

interface AuthenticatedRequest {
  auth: AuthAccessClaims;
}

@Controller()
@UseGuards(AuthGuard, AccountStatusGuard, AgeLevelGuard, RateLimitGuard)
@RequiredAge('L2')
export class ConnectSafetyController {
  constructor(private readonly safety: ConnectSafetyService) {}

  @Post('reports')
  @RateLimit({ name: 'connect.report', limit: 10, windowMs: 3_600_000, keyBy: 'principal' })
  report(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.safety.report(request.auth.sub, body, idempotencyKey);
  }

  @Post('connect/sessions/:sessionId/block')
  @RateLimit({ name: 'connect.block', limit: 30, windowMs: 60_000, keyBy: 'principal' })
  blockSession(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.safety.blockSession(request.auth.sub, sessionId);
  }
}
