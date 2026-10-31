"""
Configuration loader for Supabase connection.
Reads variables from .env located at the project root.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Locate root directory and load .env
ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"

if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)
else:
    load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Prefer service_role key for backend operations; fallback to anon key
SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY


def validate_config() -> bool:
    """Checks if Supabase credentials are configured."""
    return bool(SUPABASE_URL and SUPABASE_KEY and not SUPABASE_URL.startswith("https://your-project-id"))
