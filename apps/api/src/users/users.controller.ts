import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthAccessClaims } from '../auth/auth.service.js';
import { AccountStatusGuard, AuthGuard, RateLimitGuard } from '../policies/policy.guards.js';
import { RateLimit } from '../policies/policy-metadata.js';
import { UsersService } from './users.service.js';

interface AuthenticatedRequest {
  auth: AuthAccessClaims;
}

@Controller()
@UseGuards(AuthGuard, AccountStatusGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.users.me(request.auth.sub);
  }

  @Patch('me')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'profile.update', limit: 20, windowMs: 60_000, keyBy: 'principal' })
  updateProfile(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.users.updateProfile(request.auth.sub, body);
  }

  @Patch('me/preferences')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'profile.preferences', limit: 20, windowMs: 60_000, keyBy: 'principal' })
  updatePreferences(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.users.updatePreferences(request.auth.sub, body);
  }

  @Post('me/data-export')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'data.export', limit: 3, windowMs: 86_400_000, keyBy: 'principal' })
  requestExport(@Req() request: AuthenticatedRequest) {
    return this.users.requestExport(request.auth.sub);
  }

  @Delete('me')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'account.delete', limit: 1, windowMs: 86_400_000, keyBy: 'principal' })
  requestDeletion(@Req() request: AuthenticatedRequest) {
    return this.users.requestDeletion(request.auth.sub);
  }

  @Get('blocks')
  listBlocks(@Req() request: AuthenticatedRequest) {
    return this.users.listBlocks(request.auth.sub);
  }

  @Post('blocks')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'blocks.create', limit: 30, windowMs: 60_000, keyBy: 'principal' })
  block(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.users.block(request.auth.sub, body);
  }

  @Delete('blocks/:userId')
  unblock(@Req() request: AuthenticatedRequest, @Param('userId') targetUserId: string) {
    return this.users.unblock(request.auth.sub, targetUserId);
  }
}
