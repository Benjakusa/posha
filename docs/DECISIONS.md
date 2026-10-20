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

## 2026-10-20 — PostgreSQL migration runner

Use `node-pg-migrate` with reversible SQL migrations. The first migration creates and seeds the compliance gate registry as blocked; the identity and feature-flag schema remains in P1-01. Migration execution requires `DATABASE_URL` and is exposed through the API workspace scripts.

## 2026-10-20 — UUIDv7 generation

The application supplies UUIDv7 primary keys rather than relying on a database default. The local PostgreSQL target is version 16, so the schema does not assume a native UUIDv7 generator. Migration backfills use timestamp-based UUIDv7 values for existing compliance gate rows.

## 2026-10-20 — Authentication delivery and route ordering

OTP delivery uses an injected `OtpDeliveryProvider`; no SMS/email vendor is selected in the spec, so provider credentials and transport remain external. Auth routes are deferred until P1-03 provides the required policy guards. Refresh-token families have a 30-day absolute lifetime; access tokens keep the specified 15-minute lifetime.

## 2026-10-20 — Age re-verification and provider expiry

Starting age re-verification immediately returns the account to L0, and only the newest check may restore L2; late results from earlier checks cannot grant access. A passed provider result without a future expiry is rejected so age access cannot become indefinite. POSHA stores provider references and result metadata only, never raw identity documents.

## 2026-10-20 — Account deletion purge window

The deletion workflow soft-deletes and re-gates immediately, revokes active sessions, then queues PII erasure after a 30-day recovery window. The purge clears account and profile identifiers while retaining the deletion request and age-result metadata for their specified retention periods; future financial records are not modified by this purge.

## 2026-10-20 — Profile avatar ownership

Profile edits do not accept `avatarMediaId` until the media module can verify that the referenced media belongs to the current user. This avoids letting a profile mutation attach another account's media identifier.

## 2026-10-20 — Connect and moderation text at rest

Connect message bodies, report details/snapshots, and moderation reasons are stored as application-encrypted bytea. Report snapshots require explicit reporter consent; the API must cap them at the last 50 messages. Non-reported messages expire after seven days, while any separately preserved report evidence follows the legal-hold schedule.
