# Connect monitoring

The API's `GET /api/v1/metrics` endpoint exports Prometheus text metrics for queue depth,
successful text sessions, accepted reports, and per-participant queue wait latency. The scrape
configuration targets the private deployment service name `api:3000`; keep this endpoint on a
private monitoring network and do not publish it through the public application ingress. Set a
random `METRICS_BEARER_TOKEN` of at least 32 characters for the API and mount the same value at
`/etc/prometheus/secrets/metrics-bearer-token` in Prometheus. The API returns an unavailable
response if scraping authentication has not been configured.

Provision the Prometheus and Grafana files in this directory in the monitoring stack. The
`POSHA Connect` dashboard includes p50/p95 match wait, current queue depth, session/report rate,
and reports per 1,000 sessions over the past hour. Counters are process-local, so Prometheus
should scrape every API instance and apply `rate`/`increase` before aggregation. Queue depth is
shared across API instances, so the dashboard uses `max` rather than summing that gauge.

The dashboard deliberately uses only aggregate metrics. It does not attach user, session, report,
language, country, or interest labels.
