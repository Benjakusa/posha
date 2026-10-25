import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  Inject,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthError, AuthService } from './auth.service.js';

const RequestOtpSchema = z.object({ identity: z.string().trim().min(3).max(254) }).strict();
const VerifyOtpSchema = z
  .object({
    identity: z.string().trim().min(3).max(254),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

@Controller('auth/otp')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('request')
  @HttpCode(202)
  async request(@Body() body: unknown): Promise<{ status: 'accepted' }> {
    const parsed = RequestOtpSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR' });
    try {
      await this.auth.requestOtp(parsed.data.identity);
      return { status: 'accepted' };
    } catch (error) {
      if (error instanceof AuthError && ['OTP_LOCKED', 'OTP_RATE_LIMITED'].includes(error.code)) {
        throw new HttpException({ code: error.code }, 429);
      }
      throw error;
    }
  }

  @Post('verify')
  @HttpCode(200)
  async verify(@Body() body: unknown): Promise<{ verified: true }> {
    const parsed = VerifyOtpSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR' });
    try {
      await this.auth.verifyOtp(parsed.data.identity, parsed.data.code);
      return { verified: true };
    } catch (error) {
      if (error instanceof AuthError) throw new BadRequestException({ code: error.code });
      throw error;
    }
  }
}
