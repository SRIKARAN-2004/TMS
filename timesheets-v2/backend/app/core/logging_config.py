"""
Application-wide logging setup.

Configures Python's built-in `logging` module to write to two places at
once:
  1. The console (so you still see logs live while `uvicorn --reload` runs)
  2. A rotating file on disk (backend/logs/app.log), so there's a
     persistent record after the terminal is closed - useful for
     debugging issues that happened earlier, or reviewing what happened
     in a demo/presentation after the fact.

"Rotating" means once the file hits 5MB it starts a new one and keeps the
last 3 old ones (app.log.1, app.log.2, app.log.3), so it can never grow
forever and eat disk space.

Usage in any file:
    import logging
    logger = logging.getLogger(__name__)
    logger.info("User %s logged in", user.userid)
    logger.warning("Failed login attempt for username=%s", username)
    logger.error("Something went wrong", exc_info=True)
"""
import logging
import os
from logging.handlers import RotatingFileHandler

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "logs")
LOG_FILE = os.path.join(LOG_DIR, "app.log")

LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"


def setup_logging() -> None:
    os.makedirs(LOG_DIR, exist_ok=True)

    formatter = logging.Formatter(LOG_FORMAT)

    # Console handler - what you already see in the uvicorn terminal
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    # File handler - persists to disk, rotates at 5MB, keeps 3 backups
    file_handler = RotatingFileHandler(
        LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    # Quiet down noisy third-party loggers so app.log stays readable
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("watchfiles").setLevel(logging.WARNING)
