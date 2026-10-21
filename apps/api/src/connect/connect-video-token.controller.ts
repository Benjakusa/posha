import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthAccessClaims } from '../auth/auth.service.js';
import {
  AccountStatusGuard,
  AgeLevelGuard,
  AuthGuard,
  FeatureGateGuard,
  RateLimitGuard,
} from '../policies/policy.guards.js';
import { RateLimit, RequiredAge, RequiredFeatureGate } from '../policies/policy-metadata.js';
import { ConnectVideoTokenService } from './connect-video-token.service.js';

interface AuthenticatedRequest {
  auth: AuthAccessClaims;
}

@Controller()
@UseGuards(AuthGuard, AccountStatusGuard, AgeLevelGuard, FeatureGateGuard, RateLimitGuard)
@RequiredAge('L2')
@RequiredFeatureGate('GATE:RANDOM_VIDEO')
export class ConnectVideoTokenController {
  constructor(private readonly videoTokens: ConnectVideoTokenService) {}

  @Post('connect/sessions/:sessionId/video-token')
  @RateLimit({ name: 'connect.video.token', limit: 4, windowMs: 60_000, keyBy: 'principal' })
  issue(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.videoTokens.issueForParticipant(request.auth.sub, sessionId);
  }
}
