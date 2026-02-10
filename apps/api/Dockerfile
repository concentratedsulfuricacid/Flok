FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml /app/pyproject.toml
RUN python - <<'PY'\nimport tomllib\nfrom pathlib import Path\nwith open('/app/pyproject.toml','rb') as f:\n    data = tomllib.load(f)\nreqs = '\\n'.join(data['project']['dependencies'])\nPath('/app/requirements.txt').write_text(reqs)\nPY\nRUN pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
