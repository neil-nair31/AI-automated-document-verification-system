// mockData.js
// -----------------------------------------------------------------------------
// Fixtures used while USE_MOCK_AUTH is true and the real backend isn't wired
// in yet. Shapes mirror what a MongoDB-backed FastAPI service will actually
// return — nested documents, no joins. Anything the UI renders can be read
// straight off the verification doc with property access; no client-side
// stitching of separate collections.
//
// Document shape (one verification = one MongoDB doc):
//
//   {
//     _id:           "65a1...c8f9"          // 24-char ObjectId string
//     country:       "US"                   // ISO 3166-1 alpha-2
//     operator:      { email, displayName, role, objectId }
//     status:        "COMPLETED"            // PENDING | PROCESSING | COMPLETED | FAILED
//     verdict:       "GENUINE"              // GENUINE | REVIEW | HIGH_RISK | INSUFFICIENT
//     risk_level:    "LOW"                  // LOW | MEDIUM | HIGH | UNREADABLE
//     risk_score:    0.92                   // 0..1 aggregated
//     escalation:    { action, label, description }
//     created_at, completed_at              // ISO-8601 UTC strings
//
//     pipeline: {
//       stages: [                           // ALWAYS 4 (post team-review decision)
//         { name: "DOCUMENT_PROCESSING",     label, status, started_at, completed_at, summary }
//         { name: "CROSS_DOCUMENT",          label, status, started_at, completed_at, summary }
//         { name: "EXTERNAL",                label, status, started_at, completed_at, summary }
//         { name: "RISK_VERDICT",            label, status, started_at, completed_at, summary }
//       ]
//     }
//
//     documents: [                          // one entry per uploaded file
//       {
//         _id, document_type, original_filename, mime_type, size_bytes,
//         ocr_confidence,
//         extracted_fields:   { ... }       // shape varies by document_type
//         field_confidences:  { ... }       // mirrors extracted_fields keys
//         checks: [                         // ALL per-document checks live here
//           {                               // (Document Processing stage only;
//             _id, stage: "DOCUMENT_PROCESSING",
//             name, label, status, score, weight,
//             reasons: [                    // every check carries 1+ reasons
//               { code, text, passed }
//             ]
//           }
//         ]
//       }
//     ]
//
//     cross_document_checks: [...]          // Cross-Document Corroboration stage
//                                           // (verification-scoped — span multiple
//                                           //  docs, so not nested under any one)
//
//     external_checks: [...]                // External Source Corroboration stage
//                                           // (one entry per vendor probe, with
//                                           //  a `source` field: USCIS | E_VERIFY | NSC)
//
//     verdict_factors: [...]                // Risk-Based Verdicting stage —
//                                           // the weighted signals that drove
//                                           // the final score, with contributions
//
//     audit: [...]                          // immutable event log; returned by
//                                           //  GET /verifications/:id/audit
//   }
//
// IMPORTANT: the four pipeline stages are FIXED post team-review. Per-document
// checks (OCR confidence, required fields, format regex, MRZ checksum, expiry
// validity, internal consistency) all collapse into Document Processing.
// Cross-document corroboration is its own stage because it cannot start until
// every document has finished processing.
//
// Loaded as a classic script. Exposes `window.mockData`.
// -----------------------------------------------------------------------------

(function () {
  "use strict";

  // ===========================================================================
  // Entra users — unchanged from the previous step. Shapes match what MSAL
  // returns once the real Entra flow is wired up.
  // ===========================================================================

  const entraUsers = [
    {
      email: "priya.patel@contoso.onmicrosoft.com",
      displayName: "Priya Patel",
      role: "ADMIN",
      tenantId: "00000000-0000-0000-0000-000000000000",
      objectId: "11111111-1111-1111-1111-111111111111",
    },
    {
      email: "marcus.lee@contoso.onmicrosoft.com",
      displayName: "Marcus Lee",
      role: "OPERATOR",
      tenantId: "00000000-0000-0000-0000-000000000000",
      objectId: "22222222-2222-2222-2222-222222222222",
    },
  ];

  // ===========================================================================
  // Country rules — one document per country in the `country_rules` collection.
  // ===========================================================================

  const rules = {
    US: {
      _id: "65a1b2c3d4e5f6a7b8c90001",
      country: "US",
      version: 1,
      is_active: true,
      updated_by: "priya.patel@contoso.onmicrosoft.com",
      updated_at: "2026-05-15T14:22:10.000Z",
      config: {
        thresholds: {
          genuine_min: 0.8,
          review_min: 0.55,
          unreadable_ocr_min: 0.3,
        },
        signal_weights: {
          uscis: 1.0,
          e_verify: 0.9,
          nsc: 0.8,
          mrz_checksum: 0.9,
          internal_consistency: 0.7,
          cross_doc_identity: 0.8,
          ead_category_match: 1.0,
          ocr_confidence: 0.6,
          public_profile: 0.2,
        },
        documents: {
          PASSPORT: {
            required_fields: ["passport_number", "expiry_date", "dob", "given_names", "surname"],
            min_field_confidence: 0.7,
            min_doc_confidence: 0.65,
            passport_number_regex: "^[A-Z0-9]{6,9}$",
            min_validity_days: 180,
          },
          EAD_I766: {
            required_fields: ["card_number", "category", "valid_to"],
            high_weight_categories: ["C09", "C36"],
            valid_categories: ["A03", "A05", "C08", "C09", "C26", "C36"],
          },
        },
      },
    },
    IN: {
      _id: "65a1b2c3d4e5f6a7b8c90002",
      country: "IN",
      version: 1,
      is_active: true,
      updated_by: "priya.patel@contoso.onmicrosoft.com",
      updated_at: "2026-05-15T14:22:10.000Z",
      config: {
        thresholds: { genuine_min: 0.75, review_min: 0.5, unreadable_ocr_min: 0.3 },
        signal_weights: {
          mrz_checksum: 0.9,
          internal_consistency: 0.7,
          cross_doc_identity: 0.8,
          ocr_confidence: 0.6,
          public_profile: 0.2,
        },
        documents: {
          PASSPORT: {
            required_fields: ["passport_number", "expiry_date", "dob"],
            min_field_confidence: 0.7,
            passport_number_regex: "^[A-Z][0-9]{7}$",
            min_validity_days: 180,
          },
        },
      },
    },
  };

  // ===========================================================================
  // Stage label lookup — single source of truth so the UI can't drift.
  // ===========================================================================

  const STAGE_LABELS = {
    DOCUMENT_PROCESSING: "Document Processing",
    CROSS_DOCUMENT: "Cross-Document Corroboration",
    EXTERNAL: "External Source Corroboration",
    RISK_VERDICT: "Risk-Based Verdicting",
  };

  // ===========================================================================
  // VERIFICATION 1 — GENUINE
  //
  //   Subject:  Marcus Lee (US passport + EAD C09 + resume)
  //   Outcome:  every check passes; weighted score 0.92 → GENUINE → LOW → AUTO_APPROVE.
  // ===========================================================================

  const verificationGenuine = {
    _id: "65a3f1e2b9c8d4a7e2f10001",
    country: "US",
    operator: {
      email: "marcus.lee@contoso.onmicrosoft.com",
      displayName: "Marcus Lee",
      role: "OPERATOR",
      objectId: "22222222-2222-2222-2222-222222222222",
    },
    status: "COMPLETED",
    verdict: "GENUINE",
    risk_level: "LOW",
    risk_score: 0.92,
    escalation: {
      action: "AUTO_APPROVE",
      label: "Auto-approved",
      description:
        "Aggregate score 0.92 lies in the GENUINE band (≥ 0.80). No human review required.",
    },
    created_at: "2026-05-20T09:14:22.000Z",
    completed_at: "2026-05-20T09:14:31.300Z",

    pipeline: {
      stages: [
        {
          name: "DOCUMENT_PROCESSING",
          label: STAGE_LABELS.DOCUMENT_PROCESSING,
          status: "COMPLETED",
          started_at: "2026-05-20T09:14:22.100Z",
          completed_at: "2026-05-20T09:14:27.400Z",
          summary: "OCR, extraction, and per-document validation across 3 files. 15/15 checks passed.",
        },
        {
          name: "CROSS_DOCUMENT",
          label: STAGE_LABELS.CROSS_DOCUMENT,
          status: "COMPLETED",
          started_at: "2026-05-20T09:14:27.450Z",
          completed_at: "2026-05-20T09:14:29.100Z",
          summary: "Identity, DOB, and address consistency confirmed across passport, EAD, and resume.",
        },
        {
          name: "EXTERNAL",
          label: STAGE_LABELS.EXTERNAL,
          status: "COMPLETED",
          started_at: "2026-05-20T09:14:29.150Z",
          completed_at: "2026-05-20T09:14:30.900Z",
          summary: "USCIS, E-Verify, and I-797C category cross-reference all confirm.",
        },
        {
          name: "RISK_VERDICT",
          label: STAGE_LABELS.RISK_VERDICT,
          status: "COMPLETED",
          started_at: "2026-05-20T09:14:30.950Z",
          completed_at: "2026-05-20T09:14:31.300Z",
          summary: "Weighted aggregate 0.92 → GENUINE → auto-approve.",
        },
      ],
    },

    documents: [
      {
        _id: "65a3f1e2b9c8d4a7e2f10101",
        document_type: "PASSPORT",
        original_filename: "passport.pdf",
        mime_type: "application/pdf",
        size_bytes: 145782,
        ocr_confidence: 0.94,
        extracted_fields: {
          passport_number: "X1234567",
          surname: "LEE",
          given_names: "MARCUS",
          dob: "1991-04-22",
          sex: "M",
          nationality: "USA",
          issue_date: "2021-06-10",
          expiry_date: "2031-06-10",
          issuing_country: "USA",
          mrz_line1: "P<USALEE<<MARCUS<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
          mrz_line2: "X12345672USA9104224M3106106<<<<<<<<<<<<<<00",
        },
        field_confidences: {
          passport_number: 0.97,
          surname: 0.96,
          given_names: 0.95,
          dob: 0.93,
          expiry_date: 0.92,
          mrz_line1: 0.88,
          mrz_line2: 0.87,
        },
        checks: [
          {
            _id: "65a3f1e2b9c8d4a7e2f10201",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.ocr_confidence",
            label: "OCR confidence",
            status: "PASS",
            score: 0.94,
            weight: 0.6,
            reasons: [
              { code: "ocr_above_threshold", text: "OCR confidence 0.94 ≥ minimum 0.65", passed: true },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f10202",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.required_fields",
            label: "Required fields present",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [
              {
                code: "all_required_present",
                text: "All 5 required fields present: passport_number, expiry_date, dob, given_names, surname.",
                passed: true,
              },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f10203",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.number_format",
            label: "Passport number format",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [
              {
                code: "regex_match",
                text: "Passport number 'X1234567' matches US format /^[A-Z0-9]{6,9}$/.",
                passed: true,
              },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f10204",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.mrz_checksum",
            label: "MRZ checksum",
            status: "PASS",
            score: 1.0,
            weight: 0.9,
            reasons: [
              {
                code: "mrz_checksum_valid",
                text: "MRZ check digits match the document, DOB, and expiry-date fields.",
                passed: true,
              },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f10205",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.expiry_validity",
            label: "Expiry within validity window",
            status: "PASS",
            score: 1.0,
            weight: 0.7,
            reasons: [
              {
                code: "expiry_beyond_window",
                text: "Expires 2031-06-10 — well beyond the required 180-day forward window.",
                passed: true,
              },
              {
                code: "expiry_after_issue",
                text: "Expiry date is after issue date 2021-06-10.",
                passed: true,
              },
            ],
          },
        ],
      },

      {
        _id: "65a3f1e2b9c8d4a7e2f10102",
        document_type: "EAD_I766",
        original_filename: "ead.pdf",
        mime_type: "application/pdf",
        size_bytes: 98114,
        ocr_confidence: 0.91,
        extracted_fields: {
          card_number: "MSC2190000001",
          category: "C09",
          surname: "LEE",
          given_names: "MARCUS",
          dob: "1991-04-22",
          country_of_birth: "USA",
          valid_from: "2024-12-01",
          valid_to: "2026-11-30",
          terms: "Not valid for reentry to U.S.",
        },
        field_confidences: {
          card_number: 0.96,
          category: 0.94,
          valid_to: 0.93,
        },
        checks: [
          {
            _id: "65a3f1e2b9c8d4a7e2f10211",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.ocr_confidence",
            label: "OCR confidence",
            status: "PASS",
            score: 0.91,
            weight: 0.6,
            reasons: [
              { code: "ocr_above_threshold", text: "OCR confidence 0.91 ≥ minimum 0.65", passed: true },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f10212",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.required_fields",
            label: "Required fields present",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [
              {
                code: "all_required_present",
                text: "card_number, category, and valid_to all present and OCR'd above per-field threshold.",
                passed: true,
              },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f10213",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.category_valid",
            label: "Category in allow-list",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [
              {
                code: "category_known",
                text: "Category C09 is on the country's allowed list (A03, A05, C08, C09, C26, C36).",
                passed: true,
              },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f10214",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.validity_window",
            label: "Card validity window",
            status: "PASS",
            score: 1.0,
            weight: 0.7,
            reasons: [
              {
                code: "valid_to_future",
                text: "Card valid through 2026-11-30 — 6 months 10 days beyond today.",
                passed: true,
              },
            ],
          },
        ],
      },

      {
        _id: "65a3f1e2b9c8d4a7e2f10103",
        document_type: "RESUME",
        original_filename: "resume.pdf",
        mime_type: "application/pdf",
        size_bytes: 64210,
        ocr_confidence: 0.97,
        extracted_fields: {
          name: "Marcus Lee",
          email: "marcus.lee@example.com",
          phone: "+1-415-555-0142",
          education: [
            { degree: "BSc Computer Science", institution: "UC Berkeley", year: 2013 },
          ],
          employment: [
            { title: "Senior SWE", employer: "Acme Inc.", start: "2019-03", end: null },
          ],
        },
        field_confidences: { name: 0.98, email: 0.99 },
        checks: [
          {
            _id: "65a3f1e2b9c8d4a7e2f10221",
            stage: "DOCUMENT_PROCESSING",
            name: "resume.ocr_confidence",
            label: "OCR confidence",
            status: "PASS",
            score: 0.97,
            weight: 0.4,
            reasons: [
              { code: "ocr_above_threshold", text: "OCR confidence 0.97 ≥ minimum 0.65", passed: true },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f10222",
            stage: "DOCUMENT_PROCESSING",
            name: "resume.contact_present",
            label: "Contact fields present",
            status: "PASS",
            score: 1.0,
            weight: 0.2,
            reasons: [{ code: "contact_present", text: "name + email + phone all extracted.", passed: true }],
          },
        ],
      },
    ],

    cross_document_checks: [
      {
        _id: "65a3f1e2b9c8d4a7e2f10301",
        stage: "CROSS_DOCUMENT",
        name: "identity.name_match",
        label: "Name match across documents",
        status: "PASS",
        score: 1.0,
        weight: 0.8,
        documents_involved: ["passport.pdf", "ead.pdf", "resume.pdf"],
        reasons: [
          {
            code: "name_exact_match",
            text: "All three documents report 'MARCUS LEE' (case-insensitive exact match).",
            passed: true,
          },
        ],
      },
      {
        _id: "65a3f1e2b9c8d4a7e2f10302",
        stage: "CROSS_DOCUMENT",
        name: "identity.dob_match",
        label: "Date-of-birth match",
        status: "PASS",
        score: 1.0,
        weight: 0.8,
        documents_involved: ["passport.pdf", "ead.pdf"],
        reasons: [
          { code: "dob_exact_match", text: "Passport and EAD both report 1991-04-22.", passed: true },
        ],
      },
    ],

    external_checks: [
      {
        _id: "65a3f1e2b9c8d4a7e2f10401",
        stage: "EXTERNAL",
        source: "USCIS",
        name: "uscis.case_status",
        label: "USCIS case status",
        status: "PASS",
        score: 1.0,
        weight: 1.0,
        reasons: [
          {
            code: "case_approved",
            text: "USCIS case search for receipt 'MSC2190000001' returned status APPROVED, last updated 2025-11-20.",
            passed: true,
          },
        ],
        raw_response: {
          receipt: "MSC2190000001",
          status: "APPROVED",
          last_updated: "2025-11-20",
        },
      },
      {
        _id: "65a3f1e2b9c8d4a7e2f10402",
        stage: "EXTERNAL",
        source: "USCIS",
        name: "ead.category_matches_i797c",
        label: "EAD category vs I-797C on file",
        status: "PASS",
        score: 1.0,
        weight: 1.0,
        reasons: [
          {
            code: "category_match",
            text: "EAD card category C09 matches the I-797C category on file (C09).",
            passed: true,
          },
        ],
        raw_response: { card_category: "C09", i797c_category: "C09" },
      },
      {
        _id: "65a3f1e2b9c8d4a7e2f10403",
        stage: "EXTERNAL",
        source: "E_VERIFY",
        name: "everify.employment_eligibility",
        label: "E-Verify employment eligibility",
        status: "PASS",
        score: 1.0,
        weight: 0.9,
        reasons: [
          {
            code: "employment_authorized",
            text: "E-Verify case returned EMPLOYMENT_AUTHORIZED.",
            passed: true,
          },
        ],
        raw_response: { case_status: "EMPLOYMENT_AUTHORIZED" },
      },
    ],

    verdict_factors: [
      { name: "uscis.case_status", weight: 1.0, score: 1.0, contribution: 1.0 },
      { name: "ead.category_matches_i797c", weight: 1.0, score: 1.0, contribution: 1.0 },
      { name: "everify.employment_eligibility", weight: 0.9, score: 1.0, contribution: 0.9 },
      { name: "passport.mrz_checksum", weight: 0.9, score: 1.0, contribution: 0.9 },
      { name: "identity.name_match", weight: 0.8, score: 1.0, contribution: 0.8 },
      { name: "identity.dob_match", weight: 0.8, score: 1.0, contribution: 0.8 },
    ],

    audit: [
      {
        _id: "65a3f1e2b9c8d4a7e2f10501",
        at: "2026-05-20T09:14:22.000Z",
        actor: "marcus.lee@contoso.onmicrosoft.com",
        action: "VERIFICATION_CREATED",
        message: "Verification submitted with 3 documents.",
        details: { country: "US", document_count: 3 },
      },
      {
        at: "2026-05-20T09:14:27.400Z",
        actor: "system",
        action: "STAGE_COMPLETED",
        stage: "DOCUMENT_PROCESSING",
        message: "Document Processing completed — 15/15 checks passed.",
      },
      {
        at: "2026-05-20T09:14:29.100Z",
        actor: "system",
        action: "STAGE_COMPLETED",
        stage: "CROSS_DOCUMENT",
        message: "Cross-Document Corroboration completed — 2/2 checks passed.",
      },
      {
        at: "2026-05-20T09:14:30.900Z",
        actor: "system",
        action: "STAGE_COMPLETED",
        stage: "EXTERNAL",
        message: "External Source Corroboration completed — 3/3 checks passed.",
      },
      {
        at: "2026-05-20T09:14:31.300Z",
        actor: "system",
        action: "VERDICT_ISSUED",
        stage: "RISK_VERDICT",
        message: "Verdict GENUINE issued (score 0.92, escalation AUTO_APPROVE).",
        details: { verdict: "GENUINE", risk_score: 0.92, escalation: "AUTO_APPROVE" },
      },
    ],
  };

  // ===========================================================================
  // VERIFICATION 2 — REVIEW
  //
  //   Subject:  Priya Patel-Sharma (US passport + EAD C09 + resume).
  //   Outcome:  every per-doc check passes; cross-doc name match is a partial
  //             match (passport "PRIYA SHARMA" vs resume "Priya Patel-Sharma");
  //             external checks all green. Weighted score 0.64 → REVIEW →
  //             MEDIUM → MANUAL_REVIEW.
  // ===========================================================================

  const verificationReview = {
    _id: "65a3f1e2b9c8d4a7e2f20001",
    country: "US",
    operator: {
      email: "marcus.lee@contoso.onmicrosoft.com",
      displayName: "Marcus Lee",
      role: "OPERATOR",
      objectId: "22222222-2222-2222-2222-222222222222",
    },
    status: "COMPLETED",
    verdict: "REVIEW",
    risk_level: "MEDIUM",
    risk_score: 0.64,
    escalation: {
      action: "MANUAL_REVIEW",
      label: "Manual review",
      description:
        "Aggregate score 0.64 lies in the REVIEW band [0.55, 0.80). Operator should resolve cross-document name discrepancy before approval.",
    },
    created_at: "2026-05-20T10:02:11.000Z",
    completed_at: "2026-05-20T10:02:22.700Z",

    pipeline: {
      stages: [
        {
          name: "DOCUMENT_PROCESSING",
          label: STAGE_LABELS.DOCUMENT_PROCESSING,
          status: "COMPLETED",
          started_at: "2026-05-20T10:02:11.100Z",
          completed_at: "2026-05-20T10:02:17.500Z",
          summary: "OCR, extraction, and per-document validation across 3 files. 14/14 checks passed.",
        },
        {
          name: "CROSS_DOCUMENT",
          label: STAGE_LABELS.CROSS_DOCUMENT,
          status: "COMPLETED",
          started_at: "2026-05-20T10:02:17.550Z",
          completed_at: "2026-05-20T10:02:19.800Z",
          summary: "Identity name match flagged (partial). DOB and address consistent.",
        },
        {
          name: "EXTERNAL",
          label: STAGE_LABELS.EXTERNAL,
          status: "COMPLETED",
          started_at: "2026-05-20T10:02:19.850Z",
          completed_at: "2026-05-20T10:02:22.300Z",
          summary: "USCIS, E-Verify, and I-797C category cross-reference all confirm.",
        },
        {
          name: "RISK_VERDICT",
          label: STAGE_LABELS.RISK_VERDICT,
          status: "COMPLETED",
          started_at: "2026-05-20T10:02:22.350Z",
          completed_at: "2026-05-20T10:02:22.700Z",
          summary: "Weighted aggregate 0.64 → REVIEW → manual review by operator.",
        },
      ],
    },

    documents: [
      {
        _id: "65a3f1e2b9c8d4a7e2f20101",
        document_type: "PASSPORT",
        original_filename: "passport.pdf",
        mime_type: "application/pdf",
        size_bytes: 152411,
        ocr_confidence: 0.92,
        extracted_fields: {
          passport_number: "P7890123",
          surname: "SHARMA",
          given_names: "PRIYA",
          dob: "1989-08-14",
          sex: "F",
          nationality: "USA",
          issue_date: "2022-02-04",
          expiry_date: "2032-02-04",
          issuing_country: "USA",
          mrz_line1: "P<USASHARMA<<PRIYA<<<<<<<<<<<<<<<<<<<<<<<<<",
          mrz_line2: "P78901230USA8908143F3202044<<<<<<<<<<<<<<06",
        },
        field_confidences: {
          passport_number: 0.95,
          surname: 0.97,
          given_names: 0.96,
          dob: 0.94,
          expiry_date: 0.93,
        },
        checks: [
          {
            _id: "65a3f1e2b9c8d4a7e2f20201",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.ocr_confidence",
            label: "OCR confidence",
            status: "PASS",
            score: 0.92,
            weight: 0.6,
            reasons: [
              { code: "ocr_above_threshold", text: "OCR confidence 0.92 ≥ minimum 0.65", passed: true },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f20202",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.required_fields",
            label: "Required fields present",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [{ code: "all_required_present", text: "All 5 required fields present.", passed: true }],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f20203",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.number_format",
            label: "Passport number format",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [
              {
                code: "regex_match",
                text: "Passport number 'P7890123' matches US format /^[A-Z0-9]{6,9}$/.",
                passed: true,
              },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f20204",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.mrz_checksum",
            label: "MRZ checksum",
            status: "PASS",
            score: 1.0,
            weight: 0.9,
            reasons: [
              { code: "mrz_checksum_valid", text: "MRZ check digits all match.", passed: true },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f20205",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.expiry_validity",
            label: "Expiry within validity window",
            status: "PASS",
            score: 1.0,
            weight: 0.7,
            reasons: [
              {
                code: "expiry_beyond_window",
                text: "Expires 2032-02-04 — well beyond the required 180-day forward window.",
                passed: true,
              },
            ],
          },
        ],
      },

      {
        _id: "65a3f1e2b9c8d4a7e2f20102",
        document_type: "EAD_I766",
        original_filename: "ead.pdf",
        mime_type: "application/pdf",
        size_bytes: 96108,
        ocr_confidence: 0.9,
        extracted_fields: {
          card_number: "MSC2200000002",
          category: "C09",
          surname: "SHARMA",
          given_names: "PRIYA",
          dob: "1989-08-14",
          country_of_birth: "USA",
          valid_from: "2025-01-15",
          valid_to: "2027-01-14",
          terms: "Not valid for reentry to U.S.",
        },
        field_confidences: { card_number: 0.95, category: 0.93, valid_to: 0.93 },
        checks: [
          {
            _id: "65a3f1e2b9c8d4a7e2f20211",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.ocr_confidence",
            label: "OCR confidence",
            status: "PASS",
            score: 0.9,
            weight: 0.6,
            reasons: [
              { code: "ocr_above_threshold", text: "OCR confidence 0.90 ≥ minimum 0.65", passed: true },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f20212",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.required_fields",
            label: "Required fields present",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [{ code: "all_required_present", text: "All required EAD fields extracted.", passed: true }],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f20213",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.category_valid",
            label: "Category in allow-list",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [
              { code: "category_known", text: "Category C09 is on the country allow-list.", passed: true },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f20214",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.validity_window",
            label: "Card validity window",
            status: "PASS",
            score: 1.0,
            weight: 0.7,
            reasons: [
              {
                code: "valid_to_future",
                text: "Card valid through 2027-01-14 — 1 year 7 months beyond today.",
                passed: true,
              },
            ],
          },
        ],
      },

      {
        _id: "65a3f1e2b9c8d4a7e2f20103",
        document_type: "RESUME",
        original_filename: "resume.pdf",
        mime_type: "application/pdf",
        size_bytes: 71042,
        ocr_confidence: 0.96,
        extracted_fields: {
          // Note the hyphenated surname here — this is what triggers the
          // cross-document name-match WARN downstream.
          name: "Priya Patel-Sharma",
          email: "priya.ps@example.com",
          phone: "+1-415-555-0199",
          education: [
            { degree: "MSc Statistics", institution: "Stanford University", year: 2014 },
          ],
        },
        field_confidences: { name: 0.97, email: 0.98 },
        checks: [
          {
            _id: "65a3f1e2b9c8d4a7e2f20221",
            stage: "DOCUMENT_PROCESSING",
            name: "resume.ocr_confidence",
            label: "OCR confidence",
            status: "PASS",
            score: 0.96,
            weight: 0.4,
            reasons: [
              { code: "ocr_above_threshold", text: "OCR confidence 0.96 ≥ minimum 0.65", passed: true },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f20222",
            stage: "DOCUMENT_PROCESSING",
            name: "resume.contact_present",
            label: "Contact fields present",
            status: "PASS",
            score: 1.0,
            weight: 0.2,
            reasons: [{ code: "contact_present", text: "name + email + phone all extracted.", passed: true }],
          },
        ],
      },
    ],

    cross_document_checks: [
      {
        _id: "65a3f1e2b9c8d4a7e2f20301",
        stage: "CROSS_DOCUMENT",
        name: "identity.name_match",
        label: "Name match across documents",
        // This is the central reason the verdict is REVIEW.
        status: "WARN",
        score: 0.55,
        weight: 0.8,
        documents_involved: ["passport.pdf", "ead.pdf", "resume.pdf"],
        reasons: [
          {
            code: "name_partial_match",
            text:
              "Resume name 'Priya Patel-Sharma' is a partial match for passport / EAD name 'PRIYA SHARMA'. " +
              "Maiden / hyphenated-surname discrepancy — operator confirmation required.",
            passed: false,
          },
          {
            code: "given_name_exact",
            text: "Given name 'PRIYA' matches exactly across all three documents.",
            passed: true,
          },
        ],
      },
      {
        _id: "65a3f1e2b9c8d4a7e2f20302",
        stage: "CROSS_DOCUMENT",
        name: "identity.dob_match",
        label: "Date-of-birth match",
        status: "PASS",
        score: 1.0,
        weight: 0.8,
        documents_involved: ["passport.pdf", "ead.pdf"],
        reasons: [
          { code: "dob_exact_match", text: "Passport and EAD both report 1989-08-14.", passed: true },
        ],
      },
    ],

    external_checks: [
      {
        _id: "65a3f1e2b9c8d4a7e2f20401",
        stage: "EXTERNAL",
        source: "USCIS",
        name: "uscis.case_status",
        label: "USCIS case status",
        status: "PASS",
        score: 1.0,
        weight: 1.0,
        reasons: [
          {
            code: "case_approved",
            text: "USCIS case search for receipt 'MSC2200000002' returned status APPROVED.",
            passed: true,
          },
        ],
        raw_response: { receipt: "MSC2200000002", status: "APPROVED", last_updated: "2025-12-04" },
      },
      {
        _id: "65a3f1e2b9c8d4a7e2f20402",
        stage: "EXTERNAL",
        source: "USCIS",
        name: "ead.category_matches_i797c",
        label: "EAD category vs I-797C on file",
        status: "PASS",
        score: 1.0,
        weight: 1.0,
        reasons: [
          {
            code: "category_match",
            text: "EAD card category C09 matches the I-797C category on file (C09).",
            passed: true,
          },
        ],
        raw_response: { card_category: "C09", i797c_category: "C09" },
      },
      {
        _id: "65a3f1e2b9c8d4a7e2f20403",
        stage: "EXTERNAL",
        source: "E_VERIFY",
        name: "everify.employment_eligibility",
        label: "E-Verify employment eligibility",
        status: "PASS",
        score: 1.0,
        weight: 0.9,
        reasons: [
          {
            code: "employment_authorized",
            text: "E-Verify case returned EMPLOYMENT_AUTHORIZED.",
            passed: true,
          },
        ],
        raw_response: { case_status: "EMPLOYMENT_AUTHORIZED" },
      },
    ],

    verdict_factors: [
      { name: "uscis.case_status", weight: 1.0, score: 1.0, contribution: 1.0 },
      { name: "ead.category_matches_i797c", weight: 1.0, score: 1.0, contribution: 1.0 },
      { name: "everify.employment_eligibility", weight: 0.9, score: 1.0, contribution: 0.9 },
      { name: "passport.mrz_checksum", weight: 0.9, score: 1.0, contribution: 0.9 },
      // The single negative-contribution signal that pulled the score into REVIEW.
      { name: "identity.name_match", weight: 0.8, score: 0.55, contribution: 0.44 },
      { name: "identity.dob_match", weight: 0.8, score: 1.0, contribution: 0.8 },
    ],

    audit: [
      {
        at: "2026-05-20T10:02:11.000Z",
        actor: "marcus.lee@contoso.onmicrosoft.com",
        action: "VERIFICATION_CREATED",
        message: "Verification submitted with 3 documents.",
        details: { country: "US", document_count: 3 },
      },
      {
        at: "2026-05-20T10:02:17.500Z",
        actor: "system",
        action: "STAGE_COMPLETED",
        stage: "DOCUMENT_PROCESSING",
        message: "Document Processing completed — 14/14 checks passed.",
      },
      {
        at: "2026-05-20T10:02:19.800Z",
        actor: "system",
        action: "STAGE_COMPLETED",
        stage: "CROSS_DOCUMENT",
        message:
          "Cross-Document Corroboration completed — 1 WARN (identity.name_match), 1 PASS.",
      },
      {
        at: "2026-05-20T10:02:22.300Z",
        actor: "system",
        action: "STAGE_COMPLETED",
        stage: "EXTERNAL",
        message: "External Source Corroboration completed — 3/3 checks passed.",
      },
      {
        at: "2026-05-20T10:02:22.700Z",
        actor: "system",
        action: "VERDICT_ISSUED",
        stage: "RISK_VERDICT",
        message: "Verdict REVIEW issued (score 0.64, escalation MANUAL_REVIEW).",
        details: { verdict: "REVIEW", risk_score: 0.64, escalation: "MANUAL_REVIEW" },
      },
    ],
  };

  // ===========================================================================
  // VERIFICATION 3 — HIGH_RISK
  //
  //   Subject:  Daniel Okafor (US passport + EAD C36 + transcript).
  //   Outcome:  per-document checks all pass (the EAD card category C36 is
  //             correctly extracted from the card itself). The external check
  //             against the I-797C on file is the failure: the I-797C says C09
  //             but the card shows C36. Per spec, EAD category mismatch is a
  //             high-weight fraud signal. Weighted score 0.32 → HIGH_RISK →
  //             HIGH → COMPLIANCE_ESCALATION.
  // ===========================================================================

  const verificationHighRisk = {
    _id: "65a3f1e2b9c8d4a7e2f30001",
    country: "US",
    operator: {
      email: "marcus.lee@contoso.onmicrosoft.com",
      displayName: "Marcus Lee",
      role: "OPERATOR",
      objectId: "22222222-2222-2222-2222-222222222222",
    },
    status: "COMPLETED",
    verdict: "HIGH_RISK",
    risk_level: "HIGH",
    risk_score: 0.32,
    escalation: {
      action: "COMPLIANCE_ESCALATION",
      label: "Escalate for compliance review",
      description:
        "EAD card category does not match the I-797C category on file — a high-weight fraud signal. " +
        "Route to compliance immediately; do not approve without manual investigation.",
    },
    created_at: "2026-05-20T10:48:55.000Z",
    completed_at: "2026-05-20T10:49:08.200Z",

    pipeline: {
      stages: [
        {
          name: "DOCUMENT_PROCESSING",
          label: STAGE_LABELS.DOCUMENT_PROCESSING,
          status: "COMPLETED",
          started_at: "2026-05-20T10:48:55.100Z",
          completed_at: "2026-05-20T10:49:01.900Z",
          summary: "OCR, extraction, and per-document validation across 3 files. 14/14 checks passed.",
        },
        {
          name: "CROSS_DOCUMENT",
          label: STAGE_LABELS.CROSS_DOCUMENT,
          status: "COMPLETED",
          started_at: "2026-05-20T10:49:01.950Z",
          completed_at: "2026-05-20T10:49:03.700Z",
          summary: "Identity, DOB, and address consistency confirmed across passport, EAD, and transcript.",
        },
        {
          name: "EXTERNAL",
          label: STAGE_LABELS.EXTERNAL,
          status: "COMPLETED",
          started_at: "2026-05-20T10:49:03.750Z",
          completed_at: "2026-05-20T10:49:07.800Z",
          summary:
            "USCIS case APPROVED, E-Verify AUTHORIZED, but EAD card category (C36) does not match the I-797C on file (C09).",
        },
        {
          name: "RISK_VERDICT",
          label: STAGE_LABELS.RISK_VERDICT,
          status: "COMPLETED",
          started_at: "2026-05-20T10:49:07.850Z",
          completed_at: "2026-05-20T10:49:08.200Z",
          summary:
            "Weighted aggregate 0.32 → HIGH_RISK → escalate for compliance review. Driver: EAD category mismatch (weight 1.0).",
        },
      ],
    },

    documents: [
      {
        _id: "65a3f1e2b9c8d4a7e2f30101",
        document_type: "PASSPORT",
        original_filename: "passport.pdf",
        mime_type: "application/pdf",
        size_bytes: 138229,
        ocr_confidence: 0.93,
        extracted_fields: {
          passport_number: "K4456712",
          surname: "OKAFOR",
          given_names: "DANIEL",
          dob: "1993-11-09",
          sex: "M",
          nationality: "USA",
          issue_date: "2020-07-22",
          expiry_date: "2030-07-21",
          issuing_country: "USA",
          mrz_line1: "P<USAOKAFOR<<DANIEL<<<<<<<<<<<<<<<<<<<<<<<<",
          mrz_line2: "K44567129USA9311094M3007212<<<<<<<<<<<<<<04",
        },
        field_confidences: { passport_number: 0.96, surname: 0.97, given_names: 0.96 },
        checks: [
          {
            _id: "65a3f1e2b9c8d4a7e2f30201",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.ocr_confidence",
            label: "OCR confidence",
            status: "PASS",
            score: 0.93,
            weight: 0.6,
            reasons: [
              { code: "ocr_above_threshold", text: "OCR confidence 0.93 ≥ minimum 0.65", passed: true },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f30202",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.required_fields",
            label: "Required fields present",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [{ code: "all_required_present", text: "All 5 required fields present.", passed: true }],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f30203",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.number_format",
            label: "Passport number format",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [
              {
                code: "regex_match",
                text: "Passport number 'K4456712' matches US format /^[A-Z0-9]{6,9}$/.",
                passed: true,
              },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f30204",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.mrz_checksum",
            label: "MRZ checksum",
            status: "PASS",
            score: 1.0,
            weight: 0.9,
            reasons: [{ code: "mrz_checksum_valid", text: "MRZ check digits all match.", passed: true }],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f30205",
            stage: "DOCUMENT_PROCESSING",
            name: "passport.expiry_validity",
            label: "Expiry within validity window",
            status: "PASS",
            score: 1.0,
            weight: 0.7,
            reasons: [
              {
                code: "expiry_beyond_window",
                text: "Expires 2030-07-21 — well beyond the required 180-day forward window.",
                passed: true,
              },
            ],
          },
        ],
      },

      {
        _id: "65a3f1e2b9c8d4a7e2f30102",
        document_type: "EAD_I766",
        original_filename: "ead.pdf",
        mime_type: "application/pdf",
        size_bytes: 102983,
        ocr_confidence: 0.92,
        extracted_fields: {
          card_number: "MSC2230000007",
          // The card itself extracts cleanly with category C36. The fraud
          // signal is the MISMATCH against the I-797C on file (C09) — caught
          // in the EXTERNAL stage, not here.
          category: "C36",
          surname: "OKAFOR",
          given_names: "DANIEL",
          dob: "1993-11-09",
          country_of_birth: "USA",
          valid_from: "2025-03-01",
          valid_to: "2027-02-28",
          terms: "Not valid for reentry to U.S.",
        },
        field_confidences: { card_number: 0.96, category: 0.95, valid_to: 0.94 },
        checks: [
          {
            _id: "65a3f1e2b9c8d4a7e2f30211",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.ocr_confidence",
            label: "OCR confidence",
            status: "PASS",
            score: 0.92,
            weight: 0.6,
            reasons: [
              { code: "ocr_above_threshold", text: "OCR confidence 0.92 ≥ minimum 0.65", passed: true },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f30212",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.required_fields",
            label: "Required fields present",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [{ code: "all_required_present", text: "All required EAD fields extracted.", passed: true }],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f30213",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.category_valid",
            label: "Category in allow-list",
            status: "PASS",
            score: 1.0,
            weight: 0.5,
            reasons: [
              {
                code: "category_known",
                text:
                  "Category C36 is on the country allow-list. (NOTE: cross-reference against I-797C runs in the External stage.)",
                passed: true,
              },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f30214",
            stage: "DOCUMENT_PROCESSING",
            name: "ead.validity_window",
            label: "Card validity window",
            status: "PASS",
            score: 1.0,
            weight: 0.7,
            reasons: [
              {
                code: "valid_to_future",
                text: "Card valid through 2027-02-28.",
                passed: true,
              },
            ],
          },
        ],
      },

      {
        _id: "65a3f1e2b9c8d4a7e2f30103",
        document_type: "TRANSCRIPT",
        original_filename: "transcript.pdf",
        mime_type: "application/pdf",
        size_bytes: 188340,
        ocr_confidence: 0.89,
        extracted_fields: {
          candidate_name: "Daniel Okafor",
          institution: "Georgia Institute of Technology",
          degree: "BSc Industrial Engineering",
          gpa: 3.71,
          start_year: 2012,
          graduation_year: 2016,
        },
        field_confidences: { candidate_name: 0.94, institution: 0.91, graduation_year: 0.96 },
        checks: [
          {
            _id: "65a3f1e2b9c8d4a7e2f30221",
            stage: "DOCUMENT_PROCESSING",
            name: "transcript.ocr_confidence",
            label: "OCR confidence",
            status: "PASS",
            score: 0.89,
            weight: 0.4,
            reasons: [
              { code: "ocr_above_threshold", text: "OCR confidence 0.89 ≥ minimum 0.65", passed: true },
            ],
          },
          {
            _id: "65a3f1e2b9c8d4a7e2f30222",
            stage: "DOCUMENT_PROCESSING",
            name: "transcript.required_fields",
            label: "Required fields present",
            status: "PASS",
            score: 1.0,
            weight: 0.2,
            reasons: [
              {
                code: "all_required_present",
                text: "candidate_name, institution, and graduation_year all extracted.",
                passed: true,
              },
            ],
          },
        ],
      },
    ],

    cross_document_checks: [
      {
        _id: "65a3f1e2b9c8d4a7e2f30301",
        stage: "CROSS_DOCUMENT",
        name: "identity.name_match",
        label: "Name match across documents",
        status: "PASS",
        score: 1.0,
        weight: 0.8,
        documents_involved: ["passport.pdf", "ead.pdf", "transcript.pdf"],
        reasons: [
          {
            code: "name_exact_match",
            text: "All three documents report 'DANIEL OKAFOR' (case-insensitive exact match).",
            passed: true,
          },
        ],
      },
      {
        _id: "65a3f1e2b9c8d4a7e2f30302",
        stage: "CROSS_DOCUMENT",
        name: "identity.dob_match",
        label: "Date-of-birth match",
        status: "PASS",
        score: 1.0,
        weight: 0.8,
        documents_involved: ["passport.pdf", "ead.pdf"],
        reasons: [
          { code: "dob_exact_match", text: "Passport and EAD both report 1993-11-09.", passed: true },
        ],
      },
    ],

    external_checks: [
      {
        _id: "65a3f1e2b9c8d4a7e2f30401",
        stage: "EXTERNAL",
        source: "USCIS",
        name: "uscis.case_status",
        label: "USCIS case status",
        status: "PASS",
        score: 1.0,
        weight: 1.0,
        reasons: [
          {
            code: "case_approved",
            text: "USCIS case search for receipt 'MSC2230000007' returned status APPROVED.",
            passed: true,
          },
        ],
        raw_response: { receipt: "MSC2230000007", status: "APPROVED", last_updated: "2026-02-11" },
      },
      {
        _id: "65a3f1e2b9c8d4a7e2f30402",
        stage: "EXTERNAL",
        source: "USCIS",
        name: "ead.category_matches_i797c",
        label: "EAD category vs I-797C on file",
        // This is the central reason the verdict is HIGH_RISK.
        status: "FAIL",
        score: 0.0,
        weight: 1.0,
        reasons: [
          {
            code: "category_mismatch",
            text:
              "EAD card category C36 does NOT match the I-797C category on file (C09). " +
              "Per country rule, this is a high-weight fraud signal — escalate immediately.",
            passed: false,
          },
        ],
        raw_response: {
          card_category: "C36",
          i797c_category: "C09",
          i797c_receipt: "MSC2230000007",
        },
      },
      {
        _id: "65a3f1e2b9c8d4a7e2f30403",
        stage: "EXTERNAL",
        source: "E_VERIFY",
        name: "everify.employment_eligibility",
        label: "E-Verify employment eligibility",
        status: "PASS",
        score: 1.0,
        weight: 0.9,
        reasons: [
          {
            code: "employment_authorized",
            text: "E-Verify case returned EMPLOYMENT_AUTHORIZED.",
            passed: true,
          },
        ],
        raw_response: { case_status: "EMPLOYMENT_AUTHORIZED" },
      },
    ],

    verdict_factors: [
      // The single dominant negative signal.
      { name: "ead.category_matches_i797c", weight: 1.0, score: 0.0, contribution: 0.0 },
      { name: "uscis.case_status", weight: 1.0, score: 1.0, contribution: 1.0 },
      { name: "everify.employment_eligibility", weight: 0.9, score: 1.0, contribution: 0.9 },
      { name: "passport.mrz_checksum", weight: 0.9, score: 1.0, contribution: 0.9 },
      { name: "identity.name_match", weight: 0.8, score: 1.0, contribution: 0.8 },
      { name: "identity.dob_match", weight: 0.8, score: 1.0, contribution: 0.8 },
    ],

    audit: [
      {
        at: "2026-05-20T10:48:55.000Z",
        actor: "marcus.lee@contoso.onmicrosoft.com",
        action: "VERIFICATION_CREATED",
        message: "Verification submitted with 3 documents.",
        details: { country: "US", document_count: 3 },
      },
      {
        at: "2026-05-20T10:49:01.900Z",
        actor: "system",
        action: "STAGE_COMPLETED",
        stage: "DOCUMENT_PROCESSING",
        message: "Document Processing completed — 14/14 checks passed.",
      },
      {
        at: "2026-05-20T10:49:03.700Z",
        actor: "system",
        action: "STAGE_COMPLETED",
        stage: "CROSS_DOCUMENT",
        message: "Cross-Document Corroboration completed — 2/2 checks passed.",
      },
      {
        at: "2026-05-20T10:49:07.800Z",
        actor: "system",
        action: "STAGE_COMPLETED",
        stage: "EXTERNAL",
        message:
          "External Source Corroboration completed — 1 FAIL (ead.category_matches_i797c), 2 PASS.",
      },
      {
        at: "2026-05-20T10:49:08.200Z",
        actor: "system",
        action: "VERDICT_ISSUED",
        stage: "RISK_VERDICT",
        message: "Verdict HIGH_RISK issued (score 0.32, escalation COMPLIANCE_ESCALATION).",
        details: {
          verdict: "HIGH_RISK",
          risk_score: 0.32,
          escalation: "COMPLIANCE_ESCALATION",
          dominant_signal: "ead.category_matches_i797c",
        },
      },
    ],
  };

  // ===========================================================================
  // Public surface
  //
  // The UI never reaches into this object directly — api.js (step 2) wraps
  // these into shapes that match the real REST responses:
  //
  //   listVerifications()           → GET /verifications        (summaries)
  //   getVerification(id)           → GET /verifications/:id    (full doc)
  //   getVerificationAudit(id)      → GET /verifications/:id/audit
  //   listRules() / updateRules()   → GET / PUT /rules[/...]
  // ===========================================================================

  const verifications = [verificationGenuine, verificationReview, verificationHighRisk];

  // ---------------------------------------------------------------------------
  // Step-1 backward-compat shim.
  //
  // The previous mockData exposed `sampleVerification(id)`. api.js still calls
  // it. Step 2 of this work reworks api.js to use the new
  // listVerifications / getVerification / getVerificationAudit surface, at
  // which point this shim is deleted.
  // TODO(step-2): remove `sampleVerification` once api.js is updated.
  // ---------------------------------------------------------------------------
  function sampleVerification(id) {
    return (
      verifications.find(function (v) {
        return v._id === id;
      }) || verifications[0]
    );
  }

  window.mockData = {
    STAGE_LABELS: STAGE_LABELS,
    entraUsers: entraUsers,
    rules: rules,
    verifications: verifications,
    sampleVerification: sampleVerification,
  };
})();
