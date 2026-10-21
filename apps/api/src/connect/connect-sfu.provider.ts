import { ServiceUnavailableException } from '@nestjs/common';
import { SignJWT } from 'jose';

export interface SfuTokenRequest {
  roomName: string;
  participantIdentity: string;
  ttlSeconds: number;
  now: Date;
}

export interface SfuTokenResult {
  serverUrl: string;
  token: string;
  expiresAt: Date;
}

export interface SfuProvider {
  issueParticipantToken(request: SfuTokenRequest): Promise<SfuTokenResult>;
}

export const SFU_PROVIDER = Symbol('SFU_PROVIDER');

/** LiveKit participant JWT issuer; API credentials never leave the server. */
export class LiveKitSfuProvider implements SfuProvider {
  constructor(
    private readonly apiKey = process.env.LIVEKIT_API_KEY,
    private readonly apiSecret = process.env.LIVEKIT_API_SECRET,
    private readonly serverUrl = process.env.LIVEKIT_URL,
  ) {}

  async issueParticipantToken(request: SfuTokenRequest): Promise<SfuTokenResult> {
    if (!this.apiKey || !this.apiSecret || this.apiSecret.length < 32 || !this.serverUrl)
      throw new ServiceUnavailableException('LiveKit is not configured.');
    const issuedAt = Math.floor(request.now.getTime() / 1000);
    const expiresAt = new Date(request.now.getTime() + request.ttlSeconds * 1000);
    const token = await new SignJWT({
      video: {
        roomJoin: true,
        room: request.roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      },
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.apiKey)
      .setSubject(request.participantIdentity)
      .setIssuedAt(issuedAt)
      .setNotBefore(issuedAt)
      .setExpirationTime(issuedAt + request.ttlSeconds)
      .sign(new TextEncoder().encode(this.apiSecret));
    return { serverUrl: this.serverUrl, token, expiresAt };
  }
}

/** Test/development provider; its token cannot authenticate against a LiveKit server. */
export class FakeSfuProvider implements SfuProvider {
  readonly issued: SfuTokenRequest[] = [];

  constructor(private readonly serverUrl = 'ws://fake-sfu.invalid') {}

  async issueParticipantToken(request: SfuTokenRequest): Promise<SfuTokenResult> {
    this.issued.push(request);
    return {
      serverUrl: this.serverUrl,
      token: `fake.${request.participantIdentity}.${request.roomName}`,
      expiresAt: new Date(request.now.getTime() + request.ttlSeconds * 1000),
    };
  }
}
