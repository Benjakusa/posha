Task complete: 2-minute guest / 30-minute subscriber video chat session limits enforced via ConnectModule.register() with VIDEO_RATE_LIMIT_STORE in AppModule.

Files modified:
1. /home/benjakusa/Posha/apps/api/src/policies/video-rate-limit.store.ts - Created with VideoRateLimitStore that determines user type (guest vs subscriber) from identity prefix and selects appropriate fixed-window rate limit policy
2. /home/benjakusa/Posha/apps/api/src/app.module.ts - Added VIDEO_RATE_LIMIT_STORE import and passed it as rateLimitStore in ConnectModule.register() options