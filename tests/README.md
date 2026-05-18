# Tests

Populated in the tests phase. Will cover:

- Pipeline stages (each module unit-tested with fixture documents)
- End-to-end happy-path: upload → verdict
- RBAC: OPERATOR blocked from `PUT /rules/{country}`, etc.
- Rule-driven thresholds: same docs, different rule config → different verdict
- Audit immutability
