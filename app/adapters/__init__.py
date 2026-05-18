"""External corroboration adapters.

These will be defined behind a `VerificationSource` protocol so a fake
implementation can be swapped for a real one without touching the pipeline.

Planned modules (next phase):

    base.py      - VerificationSource Protocol + result dataclass
    uscis.py     - USCIS case-status lookup (mock fixture for MVP)
    e_verify.py  - E-Verify employment eligibility (mock fixture for MVP)
    nsc.py       - National Student Clearinghouse education verification (mock)

Each real integration will be marked with a `# TODO: real integration boundary`
comment so they're easy to grep for when wiring vendors in.
"""
