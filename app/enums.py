"""Shared enums used across models, schemas, and the pipeline.

Keeping these in one place avoids drift between the DB layer, the API layer,
and the pipeline modules.
"""

from __future__ import annotations

import enum


class Role(str, enum.Enum):
    """RBAC roles. Only two roles per spec."""

    ADMIN = "ADMIN"
    OPERATOR = "OPERATOR"


class DocumentType(str, enum.Enum):
    """Document categories the platform accepts."""

    PASSPORT = "PASSPORT"
    EAD_I766 = "EAD_I766"
    DRIVERS_LICENSE = "DRIVERS_LICENSE"
    RESUME = "RESUME"
    DEGREE = "DEGREE"
    TRANSCRIPT = "TRANSCRIPT"


class VerificationStatus(str, enum.Enum):
    """Lifecycle state of a verification job."""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Verdict(str, enum.Enum):
    """Final verdict bucket for a completed verification."""

    GENUINE = "GENUINE"
    REVIEW = "REVIEW"
    HIGH_RISK = "HIGH_RISK"
    INSUFFICIENT = "INSUFFICIENT"


class RiskLevel(str, enum.Enum):
    """Escalation tier derived from the verdict / score.

    Mapping (defined in rules config, not hardcoded):
        LOW         -> auto-approve
        MEDIUM      -> manual review
        HIGH        -> compliance escalation
        UNREADABLE  -> request resubmission
    """

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    UNREADABLE = "UNREADABLE"


class PipelineStage(str, enum.Enum):
    """The five pipeline stages. Each check belongs to exactly one stage."""

    EXTRACTION = "EXTRACTION"
    INTERNAL_CONSISTENCY = "INTERNAL_CONSISTENCY"
    CROSS_DOCUMENT = "CROSS_DOCUMENT"
    EXTERNAL = "EXTERNAL"
    RISK_VERDICT = "RISK_VERDICT"


class CheckStatus(str, enum.Enum):
    """Outcome of a single check inside a stage."""

    PASS = "PASS"
    FAIL = "FAIL"
    WARN = "WARN"
    SKIP = "SKIP"


class AuditAction(str, enum.Enum):
    """Coarse-grained audit actions. `details` JSON carries specifics."""

    VERIFICATION_CREATED = "VERIFICATION_CREATED"
    DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED"
    STAGE_STARTED = "STAGE_STARTED"
    STAGE_COMPLETED = "STAGE_COMPLETED"
    CHECK_RECORDED = "CHECK_RECORDED"
    VERDICT_ISSUED = "VERDICT_ISSUED"
    RULES_UPDATED = "RULES_UPDATED"
    LOGIN_SUCCEEDED = "LOGIN_SUCCEEDED"
    LOGIN_FAILED = "LOGIN_FAILED"
