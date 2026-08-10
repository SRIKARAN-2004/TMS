from slowapi import Limiter
from slowapi.util import get_remote_address

# Previously there was no rate limiting or lockout on /auth/login at all -
# an attacker could throw unlimited password guesses at any known
# company_mail with no slowdown. Keyed by remote address rather than by
# username, since limiting by username alone would let an attacker still
# hammer many different accounts from one IP, and keying by IP is what
# slows down a single attacker's brute-force loop regardless of which
# account(s) they're targeting.
limiter = Limiter(key_func=get_remote_address)
