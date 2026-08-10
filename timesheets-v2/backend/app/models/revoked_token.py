from sqlalchemy import Column, String, DateTime

from app.db.session import Base


class RevokedToken(Base):
    """A denylist of JWT ids (jti) that have been explicitly logged out
    before their natural expiry. JWTs are stateless by design, so there is
    no other way to invalidate a single already-issued token - previously
    logout only cleared the browser cookie, meaning a copy of the token
    obtained any other way (XSS, a shared machine, a proxy log) stayed
    valid for its full remaining lifetime regardless of logout.

    Rows are cheap to keep small: expires_at mirrors the token's own `exp`
    claim, so anything past its expiry is already useless as a credential
    and gets opportunistically cleaned up (see auth_routes.logout).
    """

    __tablename__ = "Revoked_Tokens"

    jti = Column(String(32), primary_key=True)
    expires_at = Column(DateTime, nullable=False)
