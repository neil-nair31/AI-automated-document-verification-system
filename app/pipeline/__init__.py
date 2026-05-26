"""5-stage verification pipeline.

Stage modules (one per file, to be added in the pipeline phase):

    extraction.py            - OCR + field parsing + format validation
    internal_consistency.py  - within-doc checks (dates, names, MRZ checksum)
    cross_document.py        - identity/address consistency across docs
    external.py              - mocked adapter calls (USCIS, E-Verify, NSC)
    risk_verdict.py          - weighted aggregation + verdict + risk level

Each stage writes `CheckResult` rows and an `AuditLog` entry for STAGE_STARTED
and STAGE_COMPLETED. Stages must be pure functions of (verification, rules,
documents, prior checks) — no hidden globals — so they're easy to unit test.
"""
