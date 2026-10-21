# Connect matchmaking load scenario

`k6/connect-matching.js` runs 200 or 1,000 unique, already-verified adult test accounts through
the real Socket.IO `/connect` queue. It records time from `queue.join` to `match.found`, checks
that all accounts matched, and leaves each session so accounts can be reused. Default thresholds
are p95 match wait under 10 seconds and at least 99% successful matches.

Use a dedicated staging or local environment with Redis, PostgreSQL, and the Connect matcher
worker running. Never point this scenario at production. Provision a JSON file outside the repo
containing one current access token per unique L2 test account; a JSON array of strings or objects
with `accessToken` fields is accepted. Access tokens expire, so prepare the file just before the
run and keep it out of version control.

Example:

```sh
API_URL=https://staging.example.test \
CONNECT_USERS=200 \
CONNECT_TOKENS_FILE=/secure/test-users.json \
k6 run infra/load/k6/connect-matching.js
```

Repeat with `CONNECT_USERS=1000` and at least 1,000 tokens. Inspect the `connect_match_wait_ms`
percentiles and the P2-08 Connect dashboard while the run is active. If thresholds fail, use the
queue-depth and wait-latency panels to determine whether the matcher tick interval, Redis queue
operations, or session persistence is the bottleneck. k6 is not installed in the current
development environment, and a live test requires dedicated test-account tokens and backing
services; the scenario must be run in that environment before publishing a performance result.
