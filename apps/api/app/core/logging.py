from __future__ import annotations

"""Basic logging configuration."""

import logging


def setup_logging(level: str = "INFO") -> None:
    """Configure root logging for the app."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
