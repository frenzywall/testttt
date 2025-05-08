ARG VERSION_TAG=3.13.3-alpine3.21
FROM python:${VERSION_TAG} AS builder
RUN apk add --no-cache \
    gcc \
    musl-dev \
    libffi-dev \
    python3-dev \
    cargo

WORKDIR /build
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip wheel "setuptools==77.0.3" && \
    pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

FROM python:3.13.3-alpine3.21

LABEL maintainer="sreeram.jvp@ericsson.com" \
      description="Full-fledged dockerized change weekend web server with advanced caching and nginx proxy" \
      version="1.0"

RUN apk add --no-cache curl

RUN addgroup -S appuser && adduser -S appuser -G appuser

ENV PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    FLASK_APP=app.py \
    FLASK_DEBUG=0 \
    TEMP_DIR=/app/temp \
    WORKERS=2 \
    WORKER_THREADS=2 \
    WORKER_TIMEOUT=300 \
    WORKER_CONNECTIONS=1000 \
    HISTORY_LIMIT=1000

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir --disable-pip-version-check /wheels/* && rm -rf /wheels

RUN mkdir -p /app/static/css /app/static/js /app/temp && \
    chown -R appuser:appuser /app && \
    chmod -R 755 /app/static && \
    chmod 1777 /app/temp

COPY --chown=appuser:appuser static/ ./static/
COPY --chown=appuser:appuser templates/ ./templates/
COPY --chown=appuser:appuser *.py .

USER appuser

EXPOSE 5000

CMD ["sh", "-c", "gunicorn --preload --workers ${WORKERS} --threads ${WORKER_THREADS} --worker-connections ${WORKER_CONNECTIONS} --timeout ${WORKER_TIMEOUT} --worker-class=gevent --keep-alive 5 --max-requests 1000 --max-requests-jitter 50 --log-level warning --access-logfile /dev/null --error-logfile - -b 0.0.0.0:5000 app:app"]
