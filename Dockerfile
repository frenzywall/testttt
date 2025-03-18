
FROM python:3.14.0a5-slim-bullseye AS builder
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    libc6-dev \
    python3-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .
RUN pip install --upgrade pip wheel setuptools && \
    pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

FROM python:3.14.0a5-slim-bullseye

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --upgrade pip && \
    pip install --no-cache-dir /wheels/* && \
    rm -rf /wheels

COPY --chown=appuser:appuser templates/ ./templates/
COPY --chown=appuser:appuser *.py .
COPY --chown=appuser:appuser scripts/ ./scripts/


COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

RUN mkdir -p /app/temp && \
    chown -R appuser:appuser /app/temp && \
    chmod 1777 /app/temp


ENV PYTHONUNBUFFERED=1 \
    FLASK_APP=app.py \
    FLASK_DEBUG=0 \
    TEMP_DIR=/app/temp
RUN touch /app/temp.msg && chown appuser:appuser /app/temp.msg && chmod 777 /app/temp.msg

USER appuser
EXPOSE 5000
CMD ["python3","app.py"]