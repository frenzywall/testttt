FROM python:3.13-alpine AS builder
RUN apk add --no-cache \
    gcc \
    musl-dev \
    python3-dev \
    libffi-dev \
    openssl-dev \
    cargo
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip wheel setuptools && \
    pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

FROM python:3.13-alpine
ENV PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    FLASK_APP=app.py \
    FLASK_DEBUG=0 \
    TEMP_DIR=/app/temp
RUN addgroup -g 1000 appuser && adduser -D -s /bin/sh -u 1000 -G appuser appuser && \
    mkdir -p /app/static/css /app/static/js /app/temp && \
    chown -R appuser:appuser /app && \
    chmod -R 755 /app/static && \
    chmod 1777 /app/temp
WORKDIR /app
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir --disable-pip-version-check /wheels/* && rm -rf /wheels
    
COPY --chown=appuser:appuser static/ ./static/
COPY --chown=appuser:appuser templates/ ./templates/
COPY --chown=appuser:appuser *.py .

USER appuser
EXPOSE 5000
CMD ["gunicorn", "-k", "gevent", "-w", "2", "-b", "0.0.0.0:5000", "app:app"]
