"""
Python Seeding Script for ShopSense Supabase Database.
Loads data files and seeds all tables according to the ER diagram.

Run:
    python -m database.seed
    or
    python database/seed.py
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from database.client import get_supabase_client
from database.config import validate_config

DATA_DIR = ROOT_DIR / "data"


def read_json(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def chunk_upsert(supabase, table: str, items: List[Dict[str, Any]], chunk_size: int = 100):
    total = 0
    for i in range(0, len(items), chunk_size):
        chunk = items[i : i + chunk_size]
        res = supabase.table(table).upsert(chunk).execute()
        total += len(chunk)
        print(f"  [{table}] Uploaded {total}/{len(items)} records...", end="\r")
    print(f"\n  [OK] [{table}] Finished {total} records.")
    return total


def main():
    print("=" * 60)
    print("ShopSense Supabase Database Seeder (Python)")
    print("=" * 60)

    if not validate_config():
        print("\n[!] Error: Supabase credentials are missing or still placeholder values.")
        print("Please edit `.env` in the root folder with your new Supabase Project URL and Key:")
        print("    SUPABASE_URL=https://your-project.supabase.co")
        print("    SUPABASE_SERVICE_ROLE_KEY=eyJh...")
        sys.exit(1)

    supabase = get_supabase_client()

    # 1. Seed USERS
    print("\n1. Seeding USERS...")
    users_data = read_json(DATA_DIR / "users.json")
    user_records = [
        {
            "id": u.get("id"),
            "name": u.get("name"),
            "email": u.get("email") or f"{u.get('id')}@example.com",
            "role": u.get("role", "user"),
            "cold_start": bool(u.get("coldStart", False)),
            "phone": u.get("phone"),
            "profession": u.get("profession"),
            "preferences": u.get("preferences") or {},
            "is_seed": True,
        }
        for u in users_data
    ]
    # Admin account
    user_records.insert(
        0,
        {
            "id": "u_admin",
            "name": "ShopSense Admin",
            "email": "admin@shopsense.dev",
            "role": "admin",
            "cold_start": False,
            "phone": "+91 99999 00000",
            "profession": "Platform Lead",
            "preferences": {"interests": ["admin", "analytics"]},
            "is_seed": True,
        },
    )
    chunk_upsert(supabase, "users", user_records, 100)

    # 2. Seed PRODUCTS
    print("\n2. Seeding PRODUCTS...")
    products_data = read_json(DATA_DIR / "products.json")
    extra_data = read_json(DATA_DIR / "extra-products.json")
    combined = products_data + extra_data

    # Deduplicate by ID
    seen_ids = set()
    product_records = []
    for p in combined:
        pid = p.get("id")
        if not pid or pid in seen_ids:
            continue
        seen_ids.add(pid)
        product_records.append(
            {
                "id": pid,
                "title": p.get("title", ""),
                "brand": p.get("brand"),
                "category": p.get("category"),
                "price": float(p["price"]) if p.get("price") is not None else None,
                "mrp": float(p["mrp"]) if p.get("mrp") is not None else None,
                "currency": p.get("currency", "INR"),
                "rating": float(p["rating"]) if p.get("rating") is not None else None,
                "rating_count": int(p.get("ratingCount") or 0),
                "data": p,
            }
        )
    chunk_upsert(supabase, "products", product_records, 100)

    # 3. Seed INTERACTIONS
    print("\n3. Seeding INTERACTIONS...")
    interactions_data = read_json(DATA_DIR / "interactions.json")
    interaction_records = [
        {
            "id": i.get("id") or f"i_{idx}",
            "user_id": i.get("userId"),
            "product_id": i.get("productId"),
            "type": i.get("type", "view"),
            "ts": i.get("ts"),
            "session_id": i.get("sessionId"),
        }
        for idx, i in enumerate(interactions_data)
        if i.get("productId") in seen_ids  # Ensure foreign key exists
    ]
    chunk_upsert(supabase, "interactions", interaction_records, 200)

    print("\n[OK] Seeding complete! All tables populated according to ER Diagram.")


if __name__ == "__main__":
    main()
