# Code Fixture

Decision: runtime refresh must be aggregated, not fired per promoted chunk.

Problem: duplicate chunk promotion increases ingest cost without adding recall value.
