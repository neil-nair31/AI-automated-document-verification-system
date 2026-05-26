# Seeds

Populated in the seed/config phase. Will include:

- Default ADMIN + OPERATOR users (credentials printed at first boot).
- Country rule configs for two countries (e.g. `US`, `IN`) covering all six
  `DocumentType`s, thresholds, and signal weights.
- Adapter fixtures (USCIS case statuses, E-Verify responses, NSC records) for
  the mocked external corroboration stage.
