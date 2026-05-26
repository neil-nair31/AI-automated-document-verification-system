"""ORM models.

Importing this package registers all model classes against `Base.metadata`,
which is what Alembic's autogenerate scans.
"""

from app.models.user import User  # noqa: F401
from app.models.verification import Verification  # noqa: F401
from app.models.document import Document  # noqa: F401
from app.models.check import CheckResult  # noqa: F401
from app.models.rule import CountryRule  # noqa: F401
from app.models.audit import AuditLog  # noqa: F401

__all__ = [
    "User",
    "Verification",
    "Document",
    "CheckResult",
    "CountryRule",
    "AuditLog",
]
