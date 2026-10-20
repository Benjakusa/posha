import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { AuthAccessClaims } from '../auth/auth.service.js';
import { AccountStatusGuard, AuthGuard, RateLimitGuard } from '../policies/policy.guards.js';
import { RateLimit } from '../policies/policy-metadata.js';
import { NotificationsService } from './notification.service.js';

interface AuthenticatedRequest {
  auth: AuthAccessClaims;
}

@Controller('me/notification-preferences')
@UseGuards(AuthGuard, AccountStatusGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.notifications.getPreferences(request.auth.sub);
  }

  @Patch()
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'notification.preferences', limit: 20, windowMs: 60_000, keyBy: 'principal' })
  update(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.notifications.updatePreferences(request.auth.sub, body);
  }
}
