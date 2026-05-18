FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps:
#   - libgl1 / libglib2.0-0: needed once PaddleOCR/OpenCV come in
#   - poppler-utils: PDF rasterization fallback
#   - build-essential / libpq-dev: psycopg2 build (psycopg2-binary avoids this but
#     keep it light here in case we swap to psycopg2 source build)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 poppler-utils curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install -r requirements.txt

COPY . /app

EXPOSE 8000

# Default command — overridden by docker-compose for dev (with --reload).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
