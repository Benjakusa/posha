# Decisions

## 2026-10-20 — Canonical spec location

The supplied spec pack was found in `files (2)/` rather than `docs/spec/`. It has been copied to `docs/spec/` to follow the operating manual's required location; the supplied originals are retained.

## 2026-10-20 — Empty monorepo workspace

P0-01 starts from a workspace containing only the spec pack and progress tracker, without an application repo or Git metadata. The workspace skeleton is initialized with empty strict TypeScript package entry points; feature implementation remains governed by `PROGRESS.md` and the backlog.

## 2026-10-20 — Money input precision

Human-entered money is parsed from plain decimal strings into integer minor units. Inputs with more fractional digits than the currency allows are rejected instead of rounded; commission rounding remains governed by the bankers-rounding rule in `06` PAY-05.

## 2026-10-20 — Infrastructure seed timing

P0-04 adds schema-versioned neutral profile fixtures and validates them, but does not create a parallel application table: the users/profiles schema belongs to P1-01. The Compose stack seeds only private local object-storage buckets until the database migrations define the corresponding seed adapter.

## 2026-10-20 — Local object storage image

The local Compose stack uses MinIO's Quay-hosted community image because its Docker Hub image repository is archived. It remains a development-only S3-compatible service; production storage selection is outside P0-04.

## 2026-10-20 — Generic HTTP problem codes

The API contract lists four domain error codes but also requires stable problem codes for generic HTTP failures. The shared package keeps all four listed codes unchanged and adds generic validation, authorization, not-found, conflict, HTTP, and server-error codes for the exception filter.
