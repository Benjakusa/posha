# Local fixture data

`fixtures.json` contains neutral synthetic profiles for local development. It contains no personal data, credentials, media, or age-assurance results.

The application schema is introduced in P1-01, so these fixtures are validated and kept schema-versioned here until that migration task defines the database seed adapter. `pnpm seed:validate` checks their shape and neutrality. Compose also creates private MinIO buckets for quarantine and private objects.
