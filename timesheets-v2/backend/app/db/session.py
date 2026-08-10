from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

engine = create_engine(settings.SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)


@event.listens_for(engine, "connect")
def _set_utc_session_timezone(dbapi_connection, connection_record):
    """MySQL's TIMESTAMP columns convert values based on the connection's
    session time_zone setting, which defaults to the server's own local
    timezone unless told otherwise. Since every timestamp this app writes
    and reads is intended to be UTC (the frontend always sends/expects UTC
    ISO strings), every new connection is pinned to UTC explicitly here -
    otherwise storage/retrieval could silently shift by the MySQL server's
    local UTC offset depending on how it happens to be configured."""
    if engine.dialect.name != "mysql":
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("SET time_zone = '+00:00'")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
