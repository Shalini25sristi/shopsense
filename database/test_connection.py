"""
Quick diagnostic script to test your Supabase connection and verify ER diagram tables.

Run:
    python database/test_connection.py
"""

import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from database.config import validate_config, SUPABASE_URL
from database.client import get_supabase_client


def main():
    print("[*] Testing Supabase Connection...")
    print(f"Target URL: {SUPABASE_URL or '(not set)'}\n")

    if not validate_config():
        print("[!] Supabase credentials are not configured yet.")
        print("Please open the `.env` file and replace the placeholders with your Supabase Project URL and Key.")
        return

    try:
        supabase = get_supabase_client()
        # Query products
        res = supabase.table("products").select("count", count="exact").limit(1).execute()
        print("[+] Successfully connected to Supabase!")
        print(f"Product count: {res.count if hasattr(res, 'count') else 'Connected'}")

        # Check tables from ER Diagram
        tables = [
            "users",
            "products",
            "orders",
            "cart_items",
            "wishlist_items",
            "order_items",
            "interactions",
            "events",
            "search_history",
            "search_logs",
        ]
        print("\nChecking ER Diagram tables in Supabase:")
        for t in tables:
            try:
                t_res = supabase.table(t).select("*", count="exact").limit(0).execute()
                print(f"  • {t.ljust(16)}: EXISTS [OK]")
            except Exception as e:
                print(f"  • {t.ljust(16)}: NOT FOUND [FAIL] ({e})")

    except Exception as e:
        print(f"[-] Connection test failed: {e}")


if __name__ == "__main__":
    main()
