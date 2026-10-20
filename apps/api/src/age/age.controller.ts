import { Controller, Get, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { AuthAccessClaims } from '../auth/auth.service.js';
import { AccountStatusGuard, AuthGuard, RateLimitGuard } from '../policies/policy.guards.js';
import { RateLimit } from '../policies/policy-metadata.js';
import { AgeAssuranceService } from './age.service.js';

interface AuthenticatedRequest {
  auth: AuthAccessClaims;
}

interface RawAgeWebhookRequest {
  rawBody?: Buffer;
}

@Controller('age')
export class AgeController {
  constructor(private readonly age: AgeAssuranceService) {}

  @Post('start')
  @UseGuards(AuthGuard, AccountStatusGuard, RateLimitGuard)
  @RateLimit({ name: 'age.start', limit: 3, windowMs: 600_000, keyBy: 'principal' })
  start(@Req() request: AuthenticatedRequest) {
    return this.age.start(request.auth.sub);
  }

  @Get('status')
  @UseGuards(AuthGuard, AccountStatusGuard)
  status(@Req() request: AuthenticatedRequest) {
    return this.age.status(request.auth.sub);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() request: RawBodyRequest<RawAgeWebhookRequest>,
    @Headers('x-age-signature') signature?: string,
  ) {
    return {
      received: true,
      result: await this.age.handleWebhook(request.rawBody ?? Buffer.alloc(0), signature),
    };
  }
}
