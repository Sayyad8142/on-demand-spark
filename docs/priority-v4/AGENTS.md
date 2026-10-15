# Draft architecture rules
- Keep all V4 draft material inside this directory; never import it from application or deployed function code. Why: draft review must not activate V4.
- Use pure rational arithmetic with fixed caller-supplied timestamps; persistence is a separate server transaction. Why: replay must be deterministic and rounding consistent.
- Execute only synthetic engine tests with a scrubbed environment and denied service transports. Why: no production credentials or services may enter testing.
- Keep migration guards in each transaction and avoid legacy table dependencies. Why: a connected production project is not a test target.
- This directory has its own roadmap; root files remain untouched under the explicit draft-only restriction. Why: scope isolation takes precedence over integrating drafts into application architecture.
- Represent corrections as complete append-only per-parent revision chains and order projections by (as_of, calculation_revision). Why: deterministic replay must preserve decisions and reject stale publishing.
- Require external protected control-plane target attestation before any future SQL transaction. Why: session settings and database names cannot prove nonproduction identity.
- Keep synthetic canonical anchors separate from legacy tables and require verified source manifests at ingestion. Why: internal foreign keys enforce consistency, not real-world ownership.
