import { Controller, Get, Header, Headers, Inject, Param } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { GuestSessionService } from '../guest/guest-session.service.js';
import { CatalogService } from './catalog.service.js';

@Controller('catalog')
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GuestSessionService) private readonly guests: GuestSessionService,
  ) {}

  @Get('home')
  async home(@Headers('authorization') header?: string) {
    if (!header?.startsWith('Bearer ')) return this.catalog.home();
    try {
      const claims = await this.auth.verifyAccessToken(header.slice(7));
      if (claims.roles.includes('guest')) {
        if (!(await this.guests.isActive(claims.sub))) return this.catalog.home();
      }
      return this.catalog.home(claims.sub);
    } catch {
      return this.catalog.home();
    }
  }

  @Get('media/:id/black-placeholder')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  blackPlaceholder(@Param('id') id: string) {
    const safeId = /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : 'video';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" role="img" aria-label="Locked video ${safeId}"><rect width="600" height="800" fill="#000000"/></svg>`;
  }
}
