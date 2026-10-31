"""
Supabase Client Singleton for Python.
"""

from supabase import create_client, Client
from .config import SUPABASE_URL, SUPABASE_KEY, validate_config

_client: Client | None = None


def get_supabase_client() -> Client:
    """
    Returns an initialized Supabase Client instance.
    Raises ValueError if credentials are not configured.
    """
    global _client
    if _client is not None:
        return _client

    if not validate_config():
        raise ValueError(
            "Supabase credentials are not set. "
            "Please update the .env file with your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )

    _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client
