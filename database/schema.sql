-- ==============================================================================
-- ShopSense - PostgreSQL Schema for Supabase
-- Exactly matches the Entity Relationship Diagram (ERD):
-- USERS, PRODUCTS, ORDERS, WISHLIST_ITEMS, CART_ITEMS, ORDER_ITEMS,
-- INTERACTIONS, EVENTS, SEARCH_HISTORY, SEARCH_LOGS
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS
CREATE TABLE IF NOT EXISTS public.users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  cold_start    BOOLEAN NOT NULL DEFAULT FALSE,
  phone         TEXT,
  profession    TEXT,
  preferences   JSONB DEFAULT '{}'::jsonb,
  is_seed       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

-- 2. PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  brand         TEXT,
  category      TEXT,
  price         NUMERIC(10, 2),
  mrp           NUMERIC(10, 2),
  currency      TEXT DEFAULT 'INR',
  rating        NUMERIC(3, 2),
  rating_count  INTEGER DEFAULT 0,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  updated_at    TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category);
CREATE INDEX IF NOT EXISTS idx_products_brand    ON public.products (brand);
CREATE INDEX IF NOT EXISTS idx_products_price    ON public.products (price);

-- 3. ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',
  total       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'INR',
  item_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders (user_id);

-- 4. WISHLIST_ITEMS (Composite Primary Key: user_id + product_id)
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  user_id    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  PRIMARY KEY (user_id, product_id)
);

-- 5. CART_ITEMS (Composite Primary Key: user_id + product_id)
CREATE TABLE IF NOT EXISTS public.cart_items (
  user_id    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_at   TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  PRIMARY KEY (user_id, product_id)
);

-- 6. ORDER_ITEMS (Composite Primary Key: order_id + product_id)
CREATE TABLE IF NOT EXISTS public.order_items (
  order_id   TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  title      TEXT,
  price      NUMERIC(10, 2) NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (order_id, product_id)
);

-- 7. INTERACTIONS (Implicit feedback for recommendations)
CREATE TABLE IF NOT EXISTS public.interactions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  ts         TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_interactions_user    ON public.interactions (user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_product ON public.interactions (product_id);

-- 8. EVENTS
CREATE TABLE IF NOT EXISTS public.events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  session_id TEXT,
  ts         TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_events_user    ON public.events (user_id);
CREATE INDEX IF NOT EXISTS idx_events_product ON public.events (product_id);

-- 9. SEARCH_HISTORY
CREATE TABLE IF NOT EXISTS public.search_history (
  id      BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  query   TEXT NOT NULL,
  total   INTEGER,
  ts      TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_search_history_user ON public.search_history (user_id);

-- 10. SEARCH_LOGS
CREATE TABLE IF NOT EXISTS public.search_logs (
  id                 BIGSERIAL PRIMARY KEY,
  query              TEXT,
  total              INTEGER,
  clicked_product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
  ts                 TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- ==============================================================================
-- Row Level Security (RLS)
-- ==============================================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read products" ON public.products FOR SELECT USING (true);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own cart" ON public.cart_items
  FOR ALL USING (auth.uid()::text = user_id);

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own wishlist" ON public.wishlist_items
  FOR ALL USING (auth.uid()::text = user_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own orders" ON public.orders
  FOR SELECT USING (auth.uid()::text = user_id);
