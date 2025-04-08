FROM python:3.11-slim-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libc6-dev python3-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip wheel "setuptools<77.0.3" && \
    pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*
ENV PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    FLASK_APP=app.py \
    FLASK_DEBUG=0 \
    TEMP_DIR=/app/temp
RUN groupadd -r appuser && useradd -r -g appuser appuser
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
CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0:5000", "app:app"]
