FROM python:3.13-slim

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

# Prefer the modular package entrypoint (server:app remains as a compat shim).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
