import type { OwnershipResolver } from './policy.guards.js';
import type { GuardRequest } from './policy.guards.js';
import type { OwnershipPolicyOptions } from './policy-metadata.js';

/** Minimal ownership resolver for dev/test: treats the authenticated principal as the owner. */
export class InMemoryOwnershipResolver implements OwnershipResolver {
  async resolveOwnerId(
    _policy: OwnershipPolicyOptions,
    request: GuardRequest,
  ): Promise<string | null> {
    const auth = request.auth ?? request.headers?.authorization;
    if (typeof auth === 'string') {
      const token = auth.match(/^Bearer\s+([^\s]+)$/i);
      if (token?.[1]) return token[1];
    }
    return null;
  }
}
