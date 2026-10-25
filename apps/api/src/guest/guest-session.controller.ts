import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { GuestSessionService } from './guest-session.service.js';

const GuestSessionRequestSchema = z
  .object({
    ageDeclaration: z.literal(true),
    locale: z.string().trim().min(2).max(16).optional(),
  })
  .strict();

@Controller('guest/session')
export class GuestSessionController {
  constructor(@Inject(GuestSessionService) private readonly guests: GuestSessionService) {}

  @Post()
  @HttpCode(201)
  async create(
    @Req() request: { ip?: string; headers: { 'user-agent'?: string | string[] } },
    @Body() body: unknown,
  ) {
    const parsed = GuestSessionRequestSchema.safeParse(body);
    return this.guests.create({
      ageDeclaration: parsed.success ? parsed.data.ageDeclaration : false,
      ipAddress: request.ip ?? 'unknown',
      userAgent: Array.isArray(request.headers['user-agent'])
        ? (request.headers['user-agent'][0] ?? '')
        : (request.headers['user-agent'] ?? ''),
    });
  }
}
