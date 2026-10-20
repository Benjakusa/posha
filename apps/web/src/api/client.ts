export interface OtpSession {
  accessToken: string;
}

export interface AgeStatus {
  status: 'not_started' | 'pending' | 'passed' | 'failed' | 'expired' | 'manual_review';
  level: 'L0' | 'L2';
  appealAvailable: boolean;
  reviewPending: boolean;
  expiresAt: string | null;
}

export interface AgeStartResult {
  sessionUrl: string;
  status: 'pending';
}

export interface PoshaApiClient {
  requestOtp(identity: string): Promise<void>;
  verifyOtp(identity: string, code: string): Promise<OtpSession>;
  getAgeStatus(accessToken: string): Promise<AgeStatus>;
  startAgeCheck(accessToken: string): Promise<AgeStartResult>;
  updatePreferences(accessToken: string, preferences: { locale: string }): Promise<void>;
  requestDataExport(accessToken: string): Promise<void>;
  requestDeletion(accessToken: string): Promise<void>;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export class HttpPoshaApiClient implements PoshaApiClient {
  constructor(
    private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? '',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async requestOtp(identity: string): Promise<void> {
    await this.request('/auth/otp/request', { method: 'POST', body: JSON.stringify({ identity }) });
  }

  async verifyOtp(identity: string, code: string): Promise<OtpSession> {
    return this.request<OtpSession>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ identity, code }),
    });
  }

  getAgeStatus(accessToken: string): Promise<AgeStatus> {
    return this.request('/age/status', {}, accessToken);
  }

  startAgeCheck(accessToken: string): Promise<AgeStartResult> {
    return this.request('/age/start', { method: 'POST' }, accessToken);
  }

  async updatePreferences(accessToken: string, preferences: { locale: string }): Promise<void> {
    await this.request(
      '/me/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify(preferences),
      },
      accessToken,
    );
  }

  async requestDataExport(accessToken: string): Promise<void> {
    await this.request('/me/data-export', { method: 'POST' }, accessToken);
  }

  async requestDeletion(accessToken: string): Promise<void> {
    await this.request('/me', { method: 'DELETE' }, accessToken);
  }

  private async request<T = void>(
    path: string,
    init: RequestInit,
    accessToken?: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/api/v1${path}`, {
        ...init,
        headers: {
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new ApiRequestError(
        'The service could not be reached. Check your connection and try again.',
        0,
      );
    }
    if (!response.ok) {
      let message = 'The request could not be completed. Try again.';
      try {
        const problem = (await response.json()) as { code?: string };
        if (problem.code === 'GATE_DISABLED')
          message = 'This verification option is not available yet.';
        if (problem.code === 'AGE_LEVEL_REQUIRED')
          message = 'Complete the age check before continuing.';
        if (problem.code === 'RATE_LIMITED') message = 'Please wait a moment before trying again.';
      } catch {
        // Keep the generic message when the service does not return problem details.
      }
      throw new ApiRequestError(message, response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
