"""
Applies database/schema.sql directly to Supabase PostgreSQL.
"""

import sys
from pathlib import Path
import psycopg2

ROOT_DIR = Path(__file__).resolve().parent.parent
SQL_FILE = ROOT_DIR / "database" / "schema.sql"

CONN_STR = "postgresql://postgres:kittumax%40123@db.nzccgolsbffelzdxtkom.supabase.co:5432/postgres"


def main():
    print("[*] Connecting to Supabase PostgreSQL...")
    conn = psycopg2.connect(CONN_STR, connect_timeout=15)
    conn.autocommit = True
    cur = conn.cursor()

    print("[*] Reading schema.sql...")
    sql = SQL_FILE.read_text(encoding="utf-8")

    print("[*] Executing schema DDL...")
    cur.execute(sql)
    print("[+] Schema successfully applied!")

    # Verify tables
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;")
    tables = [r[0] for r in cur.fetchall()]
    print(f"\n[+] Verified {len(tables)} tables in Supabase public schema:")
    for t in tables:
        print(f"  • {t}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
