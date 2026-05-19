// mockData.js
// -----------------------------------------------------------------------------
// Fixtures used while api.js is in mock mode (USE_MOCK_AUTH = true and the
// backend isn't wired in yet). All data is purely illustrative.
//
// IMPORTANT: this file is loaded as a classic script (no modules, no build
// step). It exposes `window.mockData` so api.js / app.js can consume it.
// -----------------------------------------------------------------------------

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Two fake Entra users — one per role. Shapes match what the real MSAL flow
  // would resolve to (`account.username`, `account.name`, plus a role claim).
  // ---------------------------------------------------------------------------
  const entraUsers = [
    {
      // Maps to MSAL `account.username` in the real flow.
      email: "priya.patel@contoso.onmicrosoft.com",
      // Maps to MSAL `account.name`.
      displayName: "Priya Patel",
      // In real Entra this comes from the `roles` claim on the ID token,
      // populated by App Roles configured on the Azure AD app registration.
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

  // ---------------------------------------------------------------------------
  // Country rule fixtures — shape mirrors what GET /rules will return once the
  // backend route lands. Used by the rules view; ADMIN can mutate, OPERATOR
  // sees them read-only.
  // ---------------------------------------------------------------------------
  const rules = {
    US: {
      country: "US",
      version: 1,
      is_active: true,
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
      country: "IN",
      version: 1,
      is_active: true,
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

  // ---------------------------------------------------------------------------
  // Sample verification result — what GET /verifications/{id} will eventually
  // return. Lets the result view render something realistic in mock mode.
  // ---------------------------------------------------------------------------
  function sampleVerification(id) {
    return {
      id: id,
      country: "US",
      status: "COMPLETED",
      verdict: "REVIEW",
      risk_level: "MEDIUM",
      risk_score: 0.62,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      documents: [
        {
          document_type: "PASSPORT",
          original_filename: "passport.pdf",
          ocr_confidence: 0.91,
          extracted_fields: {
            passport_number: "X1234567",
            given_names: "MARCUS",
            surname: "LEE",
            dob: "1991-04-22",
            expiry_date: "2031-06-10",
          },
        },
        {
          document_type: "EAD_I766",
          original_filename: "ead.pdf",
          ocr_confidence: 0.88,
          extracted_fields: {
            card_number: "MSC2190000000",
            category: "C09",
            valid_to: "2026-11-30",
          },
        },
        {
          document_type: "RESUME",
          original_filename: "resume.pdf",
          ocr_confidence: 0.96,
          extracted_fields: { name: "Marcus L.", email: "marcus.lee@example.com" },
        },
      ],
      checks: [
        {
          stage: "EXTRACTION",
          name: "passport.ocr_confidence",
          status: "PASS",
          score: 0.91,
          weight: 0.6,
          reason: "OCR confidence 0.91 ≥ minimum 0.65",
        },
        {
          stage: "INTERNAL_CONSISTENCY",
          name: "passport.mrz_checksum",
          status: "PASS",
          score: 1.0,
          weight: 0.9,
          reason: "MRZ checksum matches all field digits",
        },
        {
          stage: "INTERNAL_CONSISTENCY",
          name: "passport.expiry_after_issue",
          status: "PASS",
          score: 1.0,
          weight: 0.7,
          reason: "Expiry 2031-06-10 is after issue date",
        },
        {
          stage: "CROSS_DOCUMENT",
          name: "identity.name_match",
          status: "WARN",
          score: 0.6,
          weight: 0.8,
          reason: "Resume name 'Marcus L.' is a partial match for passport 'MARCUS LEE'",
        },
        {
          stage: "EXTERNAL",
          name: "uscis.case_status",
          status: "PASS",
          score: 1.0,
          weight: 1.0,
          reason: "USCIS reports case APPROVED for receipt MSC2190000000",
        },
        {
          stage: "EXTERNAL",
          name: "ead.category_matches_i797c",
          status: "PASS",
          score: 1.0,
          weight: 1.0,
          reason: "EAD category C09 matches I-797C category on file",
        },
        {
          stage: "RISK_VERDICT",
          name: "aggregate",
          status: "WARN",
          score: 0.62,
          weight: null,
          reason: "Weighted score 0.62 falls in REVIEW band [0.55, 0.80)",
        },
      ],
    };
  }

  window.mockData = {
    entraUsers: entraUsers,
    rules: rules,
    sampleVerification: sampleVerification,
  };
})();
