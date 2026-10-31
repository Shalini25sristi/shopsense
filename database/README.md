# ShopSense — Python Supabase Database Layer

This folder contains the complete **Python** implementation connecting ShopSense to **Supabase (PostgreSQL)**, structured directly from the **Entity Relationship (ER) Diagram**.

---

## 📁 Folder Structure

```
database/
├── __init__.py           # Package exports
├── config.py             # Loads .env configuration (SUPABASE_URL, SUPABASE_KEY)
├── client.py             # Supabase Client singleton
├── models.py             # Python dataclasses for all 10 ER entities
├── repository.py         # Complete Supabase CRUD repositories
├── schema.sql            # Full PostgreSQL DDL (tables, FKs, indexes, RLS)
├── seed.py               # Seeds catalog, users & interactions to Supabase
├── test_connection.py    # Diagnostic tool to verify live Supabase connection
├── requirements.txt      # Python dependencies (supabase, python-dotenv)
└── README.md             # This guide
```

---

## 🗄️ ER Diagram Entities Mapped in Python

| Entity | Model Class (`models.py`) | Repository (`repository.py`) | Supabase Table |
|---|---|---|---|
| **USERS** | `User` | `UserRepository` | `public.users` |
| **PRODUCTS** | `Product` | `ProductRepository` | `public.products` |
| **ORDERS** | `Order` | `OrderRepository` | `public.orders` |
| **ORDER_ITEMS** | `OrderItem` | `OrderRepository` | `public.order_items` |
| **CART_ITEMS** | `CartItem` | `CartRepository` | `public.cart_items` |
| **WISHLIST_ITEMS** | `WishlistItem` | `WishlistRepository` | `public.wishlist_items` |
| **INTERACTIONS** | `Interaction` | `InteractionRepository` | `public.interactions` |
| **EVENTS** | `Event` | `EventRepository` | `public.events` |
| **SEARCH_HISTORY** | `SearchHistory` | `SearchRepository` | `public.search_history` |
| **SEARCH_LOGS** | `SearchLog` | `SearchRepository` | `public.search_logs` |

---

## 🚀 Quick Setup with Your New Supabase Project

### 1. Create Tables in Supabase
1. Open your new Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** → **New query**.
3. Copy the contents of `database/schema.sql` and click **Run**.

### 2. Configure `.env`
In the root directory, open `.env` and fill in:
```env
SUPABASE_URL=https://your-new-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
```

### 3. Verify Connection
Run the diagnostic script:
```bash
python database/test_connection.py
```

### 4. Seed the Database
Populate your Supabase tables with the complete product catalogue, users, and interaction data:
```bash
python database/seed.py
```
