# Build from repository root: docker build -f backend/Dockerfile -t terra-scope-api .
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    WARM_UP=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt && pip check
COPY backend /app/backend
COPY data-pipeline/pipeline /app/data-pipeline/pipeline
COPY data-pipeline/config /app/data-pipeline/config
COPY data-pipeline/processed_data /app/data-pipeline/processed_data
COPY data-pipeline/models /app/data-pipeline/models
COPY scripts/check-deployment.py /app/scripts/check-deployment.py
COPY scripts/forecast_artifacts.py /app/scripts/forecast_artifacts.py
# A full-product image must contain the trusted model artifacts; never silently omit Forecast.
RUN python scripts/check-deployment.py
RUN useradd --create-home app && mkdir -p /app/backend/.cache/grids \
    && chown -R app:app /app/backend/.cache
USER app
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --limit-concurrency 8 --timeout-keep-alive 5"]
