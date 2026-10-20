import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class HealthProbeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method?: string }>();
    return request.method === 'GET';
  }
}
