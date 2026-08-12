#!/bin/sh
set -e

# MySQL takes a moment to accept connections after the container starts,
# even once its own healthcheck passes the first time round-trip. Retry
# instead of failing on the first connection attempt.
echo "Waiting for database at ${DB_HOST}:${DB_PORT}..."
python - <<'EOF'
import os
import sys
import time
import pymysql

host = os.getenv("DB_HOST", "db")
port = int(os.getenv("DB_PORT", "3306"))
user = os.getenv("DB_USER", "root")
password = os.getenv("DB_PASSWORD", "")

for attempt in range(30):
    try:
        conn = pymysql.connect(host=host, port=port, user=user, password=password, connect_timeout=3)
        conn.close()
        print("Database is up.")
        sys.exit(0)
    except Exception as exc:
        print(f"  attempt {attempt + 1}/30: {exc}")
        time.sleep(2)

print("Database never became available.")
sys.exit(1)
EOF

echo "Setting up schema..."
python - <<'EOF'
import subprocess
from sqlalchemy import inspect
from app.db.session import Base, engine

inspector = inspect(engine)
existing_tables = set(inspector.get_table_names())

if not existing_tables:
    # Brand new, empty database: let SQLAlchemy create every table from
    # the current models, then tell Alembic it's already up to date -
    # matches MIGRATIONS.md's "brand new database" instructions.
    print("Empty database detected - creating schema via create_all()...")
    Base.metadata.create_all(bind=engine)
    subprocess.run(["alembic", "stamp", "head"], check=True)
elif "alembic_version" not in existing_tables:
    # Tables exist but were created by the old create_all()-only setup,
    # before Alembic existed in this project - matches MIGRATIONS.md's
    # "you already have a database from before this change" instructions.
    print("Pre-Alembic database detected - stamping baseline, then upgrading...")
    subprocess.run(["alembic", "stamp", "0001_baseline"], check=True)
    subprocess.run(["alembic", "upgrade", "head"], check=True)
else:
    # Normal case: already tracked by Alembic, just apply anything new.
    print("Existing Alembic-managed database - upgrading to head...")
    subprocess.run(["alembic", "upgrade", "head"], check=True)
EOF

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
