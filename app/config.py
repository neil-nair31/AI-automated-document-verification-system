"""Application settings, loaded from environment / .env file.

Anything that may change between environments (DB URL, JWT secret, upload
limits, storage path) belongs here. Confidence thresholds and signal weights
do NOT live here — they live in the country rules table so admins can tune
them at runtime without a redeploy.
"""

from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = Field(default="dev")

    postgres_user: str = "docverify"
    postgres_password: str = "docverify"
    postgres_db: str = "docverify"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    api_host: str = "0.0.0.0"
    api_port: int = 8000

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 480

    storage_dir: str = "/data/storage"

    max_upload_bytes: int = 20 * 1024 * 1024
    allowed_mime_types: List[str] = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/tiff",
    ]

    @field_validator("allowed_mime_types", mode="before")
    @classmethod
    def _split_csv(cls, v):
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
