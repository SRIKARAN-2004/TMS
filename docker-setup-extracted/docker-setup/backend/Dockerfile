FROM python:3.12-slim

WORKDIR /app

# build-essential + libssl/libffi headers: cryptography/bcrypt sometimes
# need to compile from source depending on platform (e.g. Apple Silicon
# hosts building an amd64 image). Cheap to include, avoids a confusing
# pip failure on some machines.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
