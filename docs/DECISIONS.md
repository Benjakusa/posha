# Decisions

## 2026-10-20 — Canonical spec location

The supplied spec pack was found in `files (2)/` rather than `docs/spec/`. It has been copied to `docs/spec/` to follow the operating manual's required location; the supplied originals are retained.

## 2026-10-20 — Empty monorepo workspace

P0-01 starts from a workspace containing only the spec pack and progress tracker, without an application repo or Git metadata. The workspace skeleton is initialized with empty strict TypeScript package entry points; feature implementation remains governed by `PROGRESS.md` and the backlog.

## 2026-10-20 — Money input precision

Human-entered money is parsed from plain decimal strings into integer minor units. Inputs with more fractional digits than the currency allows are rejected instead of rounded; commission rounding remains governed by the bankers-rounding rule in `06` PAY-05.
