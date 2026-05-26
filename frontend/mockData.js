// mockData.js
// -----------------------------------------------------------------------------
// Mock fixtures for the verification platform frontend.
//
// Shape mirrors what a FastAPI + MongoDB backend will return — nested
// documents, not joined tables. A verification is ONE document containing the
// verdict, every uploaded document, every check inside each document, and the
// human-readable reason inside each check.
//
// Stage placement (since today's spec has no top-level `checks` array):
//   - DOCUMENT_PROCESSING  → on the document the check was run against
//   - CROSS_DOCUMENT       → on the document that is the natural anchor of the
//                            comparison (e.g. name-match on the resume, EAD-
//                            category-vs-I-797C on the EAD card)
//   - EXTERNAL             → on the document being externally verified (e.g.
//                            USCIS / E-Verify lookups on the EAD card)
//   - RISK_SCORING         → on the EAD card (the primary work-authorisation
//                            document) as the aggregate-of-signals check
//
// The UI just iterates `documents[].checks[]` and groups by `stage` to render
// the four pipeline panels.
//
// Pure ES module — imported by api.js. Do NOT import this file anywhere else;
// every other consumer talks to api.js.
// -----------------------------------------------------------------------------

// ----- Stage display labels --------------------------------------------------
// Single source of truth so the UI can't drift from the enum.

export const STAGES = {
  DOCUMENT_PROCESSING: "Document Processing",
  CROSS_DOCUMENT: "Cross-Document Corroboration",
  EXTERNAL: "External Source Corroboration",
  RISK_SCORING: "Risk-Based Verdicting",
};

// ----- Entra users -----------------------------------------------------------
// accessToken values are fake — shaped like `header.payload.signature` so dev
// tools display them plausibly in the Authorization header. Not real JWTs.

export const entraUsers = [
  {
    email: "admin@rts.com",
    displayName: "Priya Admin",
    role: "ADMIN",
    accessToken:
      "mock.eyJzdWIiOiJhZG1pbkBydHMuY29tIiwicm9sZSI6IkFETUlOIiwibmFtZSI6IlByaXlhIEFkbWluIn0.sig",
  },
  {
    email: "operator@rts.com",
    displayName: "Sam Operator",
    role: "OPERATOR",
    accessToken:
      "mock.eyJzdWIiOiJvcGVyYXRvckBydHMuY29tIiwicm9sZSI6Ik9QRVJBVE9SIiwibmFtZSI6IlNhbSBPcGVyYXRvciJ9.sig",
  },
];

// ----- Country rules ---------------------------------------------------------
// Flat list of validation rules per country. `weight` (1-10) feeds the trust
// score. `severity` (low|medium|high) drives escalation when the rule fails.
// `enabled` lets an admin disable a rule without deleting it (so audit history
// stays intact).

export const countryRules = {
  USA: [
    { ruleId: "USA_PSP_001", documentType: "PASSPORT",         checkName: "OCR confidence above threshold",           weight: 5,  severity: "low",    enabled: true },
    { ruleId: "USA_PSP_002", documentType: "PASSPORT",         checkName: "Required fields extracted",                weight: 6,  severity: "medium", enabled: true },
    { ruleId: "USA_PSP_003", documentType: "PASSPORT",         checkName: "Passport number matches US format",        weight: 6,  severity: "medium", enabled: true },
    { ruleId: "USA_PSP_004", documentType: "PASSPORT",         checkName: "MRZ checksum valid",                       weight: 9,  severity: "high",   enabled: true },
    { ruleId: "USA_PSP_005", documentType: "PASSPORT",         checkName: "Expiry date within validity window",       weight: 8,  severity: "high",   enabled: true },
    { ruleId: "USA_EAD_001", documentType: "EAD_I766",         checkName: "OCR confidence above threshold",           weight: 5,  severity: "low",    enabled: true },
    { ruleId: "USA_EAD_002", documentType: "EAD_I766",         checkName: "Category present and in allow-list",       weight: 6,  severity: "medium", enabled: true },
    { ruleId: "USA_EAD_003", documentType: "EAD_I766",         checkName: "Card validity window covers today",        weight: 7,  severity: "high",   enabled: true },
    { ruleId: "USA_EAD_004", documentType: "EAD_I766",         checkName: "EAD category matches I-797C on file",      weight: 10, severity: "high",   enabled: true },
    { ruleId: "USA_EAD_005", documentType: "EAD_I766",         checkName: "USCIS case status APPROVED",               weight: 9,  severity: "high",   enabled: true },
    { ruleId: "USA_EAD_006", documentType: "EAD_I766",         checkName: "E-Verify employment eligibility",          weight: 8,  severity: "high",   enabled: true },
    { ruleId: "USA_RES_001", documentType: "RESUME",           checkName: "Resume name matches passport name",        weight: 7,  severity: "medium", enabled: true },
    { ruleId: "USA_RES_002", documentType: "RESUME",           checkName: "Contact information present",              weight: 3,  severity: "low",    enabled: true },
    { ruleId: "USA_DL_001",  documentType: "DRIVERS_LICENSE",  checkName: "License number matches state format",      weight: 4,  severity: "medium", enabled: true },
    { ruleId: "USA_DL_002",  documentType: "DRIVERS_LICENSE",  checkName: "License expiry within validity window",    weight: 7,  severity: "high",   enabled: true },
    { ruleId: "USA_DEG_001", documentType: "DEGREE",           checkName: "Institution accreditation lookup (NSC)",   weight: 6,  severity: "medium", enabled: true },
  ],
  India: [
    { ruleId: "IND_PSP_001", documentType: "PASSPORT", checkName: "OCR confidence above threshold",        weight: 5, severity: "low",    enabled: true },
    { ruleId: "IND_PSP_002", documentType: "PASSPORT", checkName: "Passport number matches India format",  weight: 6, severity: "medium", enabled: true },
    { ruleId: "IND_PSP_003", documentType: "PASSPORT", checkName: "MRZ checksum valid",                    weight: 9, severity: "high",   enabled: true },
    { ruleId: "IND_PSP_004", documentType: "PASSPORT", checkName: "Expiry date within validity window",    weight: 8, severity: "high",   enabled: true },
    { ruleId: "IND_RES_001", documentType: "RESUME",   checkName: "Resume name matches passport name",     weight: 7, severity: "medium", enabled: true },
    { ruleId: "IND_DEG_001", documentType: "DEGREE",   checkName: "Institution recognised by UGC/AICTE",   weight: 6, severity: "medium", enabled: true },
    { ruleId: "IND_DEG_002", documentType: "DEGREE",   checkName: "Degree title matches resume claim",     weight: 5, severity: "medium", enabled: true },
  ],
};

// =============================================================================
// Verification fixtures
// =============================================================================

// ----- Record 1: GENUINE -----------------------------------------------------
// Marcus Lee — clean US passport + EAD (C09 matches I-797C) + resume.
// Every check passes. riskScore 12 → GENUINE → auto-approve.

const verificationGenuine = {
  verificationId: "ver_2026_05_25_001",
  submittedBy: "operator@rts.com",
  country: "USA",
  submittedAt: "2026-05-25T09:14:22.000Z",
  documents: [
    {
      documentType: "PASSPORT",
      filename: "marcus_lee_passport.pdf",
      extractedFields: {
        firstName: "Marcus",
        lastName: "Lee",
        passportNumber: "X1234567",
        nationality: "USA",
        dateOfBirth: "1991-04-22",
        sex: "M",
        issueDate: "2021-06-10",
        expiryDate: "2031-06-10",
        issuingCountry: "USA",
        mrzLine1: "P<USALEE<<MARCUS<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        mrzLine2: "X12345672USA9104224M3106106<<<<<<<<<<<<<<00",
      },
      checks: [
        {
          checkName: "OCR confidence above threshold",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.94,
          reason: "OCR ran with average confidence 0.94, above the 0.65 minimum required for passports.",
        },
        {
          checkName: "Required fields extracted",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.97,
          reason: "All required fields extracted: passportNumber, expiryDate, dateOfBirth, firstName, lastName.",
        },
        {
          checkName: "Passport number matches US format",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.99,
          reason: "Passport number 'X1234567' matches the US format /^[A-Z0-9]{6,9}$/.",
        },
        {
          checkName: "MRZ checksum valid",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.96,
          reason: "All MRZ check digits match the document number, date of birth, and expiry date fields.",
        },
        {
          checkName: "Expiry date within validity window",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.98,
          reason: "Passport expires on 2031-06-10, well beyond the 180-day forward window required by USA rules.",
        },
      ],
    },
    {
      documentType: "EAD_I766",
      filename: "marcus_lee_ead.pdf",
      extractedFields: {
        firstName: "Marcus",
        lastName: "Lee",
        cardNumber: "MSC2190000001",
        category: "C09",
        dateOfBirth: "1991-04-22",
        countryOfBirth: "USA",
        validFrom: "2024-12-01",
        validTo: "2026-11-30",
        terms: "Not valid for reentry to U.S.",
      },
      checks: [
        {
          checkName: "OCR confidence above threshold",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.91,
          reason: "OCR ran with average confidence 0.91, above the 0.65 minimum.",
        },
        {
          checkName: "Category present and in allow-list",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.95,
          reason: "Card category 'C09' is on the USA allow-list of EAD categories.",
        },
        {
          checkName: "Card validity window covers today",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.98,
          reason: "Card valid from 2024-12-01 to 2026-11-30. Today (2026-05-25) falls within that window.",
        },
        {
          checkName: "EAD category matches I-797C on file",
          stage: "CROSS_DOCUMENT",
          passed: true,
          confidence: 0.99,
          reason: "EAD card category 'C09' matches the I-797C category on file ('C09').",
        },
        {
          checkName: "USCIS case status APPROVED",
          stage: "EXTERNAL",
          passed: true,
          confidence: 0.97,
          reason: "USCIS case lookup for receipt 'MSC2190000001' returned status APPROVED (last updated 2025-11-20).",
        },
        {
          checkName: "E-Verify employment eligibility",
          stage: "EXTERNAL",
          passed: true,
          confidence: 0.95,
          reason: "E-Verify returned EMPLOYMENT_AUTHORIZED for the submitted identity.",
        },
        {
          checkName: "Aggregate risk score within GENUINE band",
          stage: "RISK_SCORING",
          passed: true,
          confidence: 0.93,
          reason: "Weighted aggregate of all signals produced a risk score of 12/100, well within the GENUINE band (<25).",
        },
      ],
    },
    {
      documentType: "RESUME",
      filename: "marcus_lee_resume.pdf",
      extractedFields: {
        fullName: "Marcus Lee",
        email: "marcus.lee@example.com",
        phone: "+1-415-555-0142",
        education: [
          { degree: "BSc Computer Science", institution: "UC Berkeley", year: 2013 },
        ],
        employment: [
          { title: "Senior Software Engineer", employer: "Acme Inc.", start: "2019-03", end: null },
        ],
      },
      checks: [
        {
          checkName: "OCR confidence above threshold",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.97,
          reason: "OCR ran with average confidence 0.97, above the 0.65 minimum.",
        },
        {
          checkName: "Contact information present",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.99,
          reason: "Full name, email, and phone number all extracted from the resume.",
        },
        {
          checkName: "Resume name matches passport name",
          stage: "CROSS_DOCUMENT",
          passed: true,
          confidence: 0.98,
          reason: "Resume name 'Marcus Lee' matches passport name 'Marcus Lee' (exact match).",
        },
      ],
    },
  ],
  riskScore: 12,
  verdict: "GENUINE",
  escalationAction: "auto-approve",
  auditLog: [
    { timestamp: "2026-05-25T09:14:22.000Z", actor: "operator@rts.com", action: "Submitted verification with 3 documents (PASSPORT, EAD_I766, RESUME)" },
    { timestamp: "2026-05-25T09:14:22.100Z", actor: "system",            action: "Document Processing stage started" },
    { timestamp: "2026-05-25T09:14:27.400Z", actor: "system",            action: "Document Processing stage completed (10/10 checks passed)" },
    { timestamp: "2026-05-25T09:14:27.450Z", actor: "system",            action: "Cross-Document Corroboration stage started" },
    { timestamp: "2026-05-25T09:14:29.100Z", actor: "system",            action: "Cross-Document Corroboration stage completed (2/2 checks passed)" },
    { timestamp: "2026-05-25T09:14:29.150Z", actor: "system",            action: "External Source Corroboration stage started" },
    { timestamp: "2026-05-25T09:14:30.900Z", actor: "system",            action: "External Source Corroboration stage completed (2/2 checks passed)" },
    { timestamp: "2026-05-25T09:14:30.950Z", actor: "system",            action: "Risk-Based Verdicting stage started" },
    { timestamp: "2026-05-25T09:14:31.300Z", actor: "system",            action: "Verdict GENUINE issued with risk score 12 (escalation: auto-approve)" },
  ],
};

// ----- Record 2: REVIEW ------------------------------------------------------
// Passport says NELZ KUMAR; resume says NEIL KUMAR. Same person, almost
// certainly a nickname / transliteration variant — but the system can't
// confirm that on its own, so cross-doc name check fails and the verdict
// drops to REVIEW. Everything else passes; EAD category matches I-797C.

const verificationReview = {
  verificationId: "ver_2026_05_25_002",
  submittedBy: "operator@rts.com",
  country: "USA",
  submittedAt: "2026-05-25T10:02:11.000Z",
  documents: [
    {
      documentType: "PASSPORT",
      filename: "nelz_kumar_passport.pdf",
      extractedFields: {
        firstName: "Nelz",
        lastName: "Kumar",
        passportNumber: "P7890123",
        nationality: "USA",
        dateOfBirth: "1989-08-14",
        sex: "M",
        issueDate: "2022-02-04",
        expiryDate: "2032-02-04",
        issuingCountry: "USA",
        mrzLine1: "P<USAKUMAR<<NELZ<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        mrzLine2: "P78901230USA8908143M3202044<<<<<<<<<<<<<<06",
      },
      checks: [
        {
          checkName: "OCR confidence above threshold",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.92,
          reason: "OCR ran with average confidence 0.92, above the 0.65 minimum.",
        },
        {
          checkName: "Required fields extracted",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.95,
          reason: "All required fields extracted: passportNumber, expiryDate, dateOfBirth, firstName, lastName.",
        },
        {
          checkName: "Passport number matches US format",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.99,
          reason: "Passport number 'P7890123' matches the US format /^[A-Z0-9]{6,9}$/.",
        },
        {
          checkName: "MRZ checksum valid",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.94,
          reason: "All MRZ check digits match the document number, date of birth, and expiry date fields.",
        },
        {
          checkName: "Expiry date within validity window",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.97,
          reason: "Passport expires on 2032-02-04, well beyond the 180-day forward window.",
        },
      ],
    },
    {
      documentType: "EAD_I766",
      filename: "nelz_kumar_ead.pdf",
      extractedFields: {
        firstName: "Nelz",
        lastName: "Kumar",
        cardNumber: "MSC2200000002",
        category: "C09",
        dateOfBirth: "1989-08-14",
        countryOfBirth: "USA",
        validFrom: "2025-01-15",
        validTo: "2027-01-14",
        terms: "Not valid for reentry to U.S.",
      },
      checks: [
        {
          checkName: "OCR confidence above threshold",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.90,
          reason: "OCR ran with average confidence 0.90, above the 0.65 minimum.",
        },
        {
          checkName: "Category present and in allow-list",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.94,
          reason: "Card category 'C09' is on the USA allow-list of EAD categories.",
        },
        {
          checkName: "Card validity window covers today",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.97,
          reason: "Card valid from 2025-01-15 to 2027-01-14. Today (2026-05-25) falls within that window.",
        },
        {
          checkName: "EAD category matches I-797C on file",
          stage: "CROSS_DOCUMENT",
          passed: true,
          confidence: 0.99,
          reason: "EAD card category 'C09' matches the I-797C category on file ('C09').",
        },
        {
          checkName: "USCIS case status APPROVED",
          stage: "EXTERNAL",
          passed: true,
          confidence: 0.96,
          reason: "USCIS case lookup for receipt 'MSC2200000002' returned status APPROVED (last updated 2025-12-04).",
        },
        {
          checkName: "E-Verify employment eligibility",
          stage: "EXTERNAL",
          passed: true,
          confidence: 0.94,
          reason: "E-Verify returned EMPLOYMENT_AUTHORIZED for the submitted identity.",
        },
        {
          checkName: "Aggregate risk score within REVIEW band",
          stage: "RISK_SCORING",
          passed: true,
          confidence: 0.88,
          reason: "Weighted aggregate of all signals produced a risk score of 52/100, which falls in the REVIEW band (25–69). A single CROSS_DOCUMENT failure (name match) drove the score above the GENUINE ceiling.",
        },
      ],
    },
    {
      documentType: "RESUME",
      filename: "neil_kumar_resume.pdf",
      extractedFields: {
        fullName: "Neil Kumar",
        email: "neil.kumar@example.com",
        phone: "+1-415-555-0199",
        education: [
          { degree: "MSc Statistics", institution: "Stanford University", year: 2014 },
        ],
        employment: [
          { title: "Data Scientist", employer: "Globex Corp.", start: "2018-07", end: null },
        ],
      },
      checks: [
        {
          checkName: "OCR confidence above threshold",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.96,
          reason: "OCR ran with average confidence 0.96, above the 0.65 minimum.",
        },
        {
          checkName: "Contact information present",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.99,
          reason: "Full name, email, and phone number all extracted from the resume.",
        },
        {
          // This is the single failing check that drives the REVIEW verdict.
          checkName: "Resume name matches passport name",
          stage: "CROSS_DOCUMENT",
          passed: false,
          confidence: 0.86,
          reason: "Name on resume (Neil Kumar) does not match name on passport (Nelz Kumar). Surname matches exactly but the given name differs by 1 character — likely a nickname or transliteration variant. Operator confirmation required before approval.",
        },
      ],
    },
  ],
  riskScore: 52,
  verdict: "REVIEW",
  escalationAction: "manual review",
  auditLog: [
    { timestamp: "2026-05-25T10:02:11.000Z", actor: "operator@rts.com", action: "Submitted verification with 3 documents (PASSPORT, EAD_I766, RESUME)" },
    { timestamp: "2026-05-25T10:02:11.100Z", actor: "system",            action: "Document Processing stage started" },
    { timestamp: "2026-05-25T10:02:17.500Z", actor: "system",            action: "Document Processing stage completed (10/10 checks passed)" },
    { timestamp: "2026-05-25T10:02:17.550Z", actor: "system",            action: "Cross-Document Corroboration stage started" },
    { timestamp: "2026-05-25T10:02:19.800Z", actor: "system",            action: "Cross-Document Corroboration stage completed (1 failed, 1 passed) — name mismatch on resume" },
    { timestamp: "2026-05-25T10:02:19.850Z", actor: "system",            action: "External Source Corroboration stage started" },
    { timestamp: "2026-05-25T10:02:22.300Z", actor: "system",            action: "External Source Corroboration stage completed (2/2 checks passed)" },
    { timestamp: "2026-05-25T10:02:22.350Z", actor: "system",            action: "Risk-Based Verdicting stage started" },
    { timestamp: "2026-05-25T10:02:22.700Z", actor: "system",            action: "Verdict REVIEW issued with risk score 52 (escalation: manual review)" },
  ],
};

// ----- Record 3: HIGH_RISK ---------------------------------------------------
// Daniel Okafor. EAD card was OCR'd cleanly with category C09. The I-797C on
// file (looked up via USCIS) shows category C36 — a high-weight fraud signal
// per the country rule (weight 10). riskScore 78 → HIGH_RISK → escalate to
// compliance.

const verificationHighRisk = {
  verificationId: "ver_2026_05_25_003",
  submittedBy: "operator@rts.com",
  country: "USA",
  submittedAt: "2026-05-25T10:48:55.000Z",
  documents: [
    {
      documentType: "PASSPORT",
      filename: "daniel_okafor_passport.pdf",
      extractedFields: {
        firstName: "Daniel",
        lastName: "Okafor",
        passportNumber: "K4456712",
        nationality: "USA",
        dateOfBirth: "1993-11-09",
        sex: "M",
        issueDate: "2020-07-22",
        expiryDate: "2030-07-21",
        issuingCountry: "USA",
        mrzLine1: "P<USAOKAFOR<<DANIEL<<<<<<<<<<<<<<<<<<<<<<<<",
        mrzLine2: "K44567129USA9311094M3007212<<<<<<<<<<<<<<04",
      },
      checks: [
        {
          checkName: "OCR confidence above threshold",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.93,
          reason: "OCR ran with average confidence 0.93, above the 0.65 minimum.",
        },
        {
          checkName: "Required fields extracted",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.96,
          reason: "All required fields extracted: passportNumber, expiryDate, dateOfBirth, firstName, lastName.",
        },
        {
          checkName: "Passport number matches US format",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.99,
          reason: "Passport number 'K4456712' matches the US format /^[A-Z0-9]{6,9}$/.",
        },
        {
          checkName: "MRZ checksum valid",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.95,
          reason: "All MRZ check digits match the document number, date of birth, and expiry date fields.",
        },
        {
          checkName: "Expiry date within validity window",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.98,
          reason: "Passport expires on 2030-07-21, well beyond the 180-day forward window.",
        },
      ],
    },
    {
      documentType: "EAD_I766",
      filename: "daniel_okafor_ead.pdf",
      extractedFields: {
        firstName: "Daniel",
        lastName: "Okafor",
        cardNumber: "MSC2230000007",
        // The card itself was OCR'd cleanly with C09. The discrepancy isn't
        // in the OCR — it's between this card and the I-797C the USCIS
        // database has on file. That's why DOCUMENT_PROCESSING passes and
        // the failure is at the CROSS_DOCUMENT stage.
        category: "C09",
        dateOfBirth: "1993-11-09",
        countryOfBirth: "USA",
        validFrom: "2025-03-01",
        validTo: "2027-02-28",
        terms: "Not valid for reentry to U.S.",
      },
      checks: [
        {
          checkName: "OCR confidence above threshold",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.92,
          reason: "OCR ran with average confidence 0.92, above the 0.65 minimum.",
        },
        {
          checkName: "Category present and in allow-list",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.95,
          reason: "Card category 'C09' is on the USA allow-list of EAD categories. (Cross-reference against I-797C runs in the next stage.)",
        },
        {
          checkName: "Card validity window covers today",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.97,
          reason: "Card valid from 2025-03-01 to 2027-02-28. Today (2026-05-25) falls within that window.",
        },
        {
          // This is the high-weight failing check that drives the HIGH_RISK verdict.
          checkName: "EAD category matches I-797C on file",
          stage: "CROSS_DOCUMENT",
          passed: false,
          confidence: 0.99,
          reason: "EAD card shows category C09 but the I-797C on file (receipt 'MSC2230000007') shows category C36. This is a high-weight discrepancy — the card category should always match the underlying petition. Likely fraudulent card or stale petition data; escalate to compliance immediately.",
        },
        {
          checkName: "USCIS case status APPROVED",
          stage: "EXTERNAL",
          passed: true,
          confidence: 0.97,
          reason: "USCIS case lookup for receipt 'MSC2230000007' returned status APPROVED (last updated 2026-02-11). Note: case status alone is insufficient — the category mismatch above takes precedence.",
        },
        {
          checkName: "E-Verify employment eligibility",
          stage: "EXTERNAL",
          passed: true,
          confidence: 0.94,
          reason: "E-Verify returned EMPLOYMENT_AUTHORIZED for the submitted identity.",
        },
        {
          checkName: "Aggregate risk score within HIGH_RISK band",
          stage: "RISK_SCORING",
          passed: false,
          confidence: 0.96,
          reason: "Weighted aggregate of all signals produced a risk score of 78/100, which falls in the HIGH_RISK band (≥70). Dominant negative signal: 'EAD category matches I-797C on file' (weight 10/10).",
        },
      ],
    },
    {
      documentType: "RESUME",
      filename: "daniel_okafor_resume.pdf",
      extractedFields: {
        fullName: "Daniel Okafor",
        email: "daniel.okafor@example.com",
        phone: "+1-415-555-0177",
        education: [
          { degree: "BSc Industrial Engineering", institution: "Georgia Institute of Technology", year: 2016 },
        ],
        employment: [
          { title: "Operations Analyst", employer: "Initech LLC.", start: "2017-09", end: null },
        ],
      },
      checks: [
        {
          checkName: "OCR confidence above threshold",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.95,
          reason: "OCR ran with average confidence 0.95, above the 0.65 minimum.",
        },
        {
          checkName: "Contact information present",
          stage: "DOCUMENT_PROCESSING",
          passed: true,
          confidence: 0.99,
          reason: "Full name, email, and phone number all extracted from the resume.",
        },
        {
          checkName: "Resume name matches passport name",
          stage: "CROSS_DOCUMENT",
          passed: true,
          confidence: 0.98,
          reason: "Resume name 'Daniel Okafor' matches passport name 'Daniel Okafor' (exact match).",
        },
      ],
    },
  ],
  riskScore: 78,
  verdict: "HIGH_RISK",
  escalationAction: "compliance escalation",
  auditLog: [
    { timestamp: "2026-05-25T10:48:55.000Z", actor: "operator@rts.com", action: "Submitted verification with 3 documents (PASSPORT, EAD_I766, RESUME)" },
    { timestamp: "2026-05-25T10:48:55.100Z", actor: "system",            action: "Document Processing stage started" },
    { timestamp: "2026-05-25T10:49:01.900Z", actor: "system",            action: "Document Processing stage completed (10/10 checks passed)" },
    { timestamp: "2026-05-25T10:49:01.950Z", actor: "system",            action: "Cross-Document Corroboration stage started" },
    { timestamp: "2026-05-25T10:49:03.700Z", actor: "system",            action: "Cross-Document Corroboration stage completed (1 failed, 1 passed) — EAD category vs I-797C mismatch" },
    { timestamp: "2026-05-25T10:49:03.750Z", actor: "system",            action: "External Source Corroboration stage started" },
    { timestamp: "2026-05-25T10:49:07.800Z", actor: "system",            action: "External Source Corroboration stage completed (2/2 checks passed)" },
    { timestamp: "2026-05-25T10:49:07.850Z", actor: "system",            action: "Risk-Based Verdicting stage started" },
    { timestamp: "2026-05-25T10:49:08.200Z", actor: "system",            action: "Verdict HIGH_RISK issued with risk score 78 (escalation: compliance escalation)" },
  ],
};

// ----- Export ---------------------------------------------------------------
// `verifications` is the canonical fixture array. api.js looks it up by
// verificationId and clones / randomly picks from it.

export const verifications = [
  verificationGenuine,
  verificationReview,
  verificationHighRisk,
];
