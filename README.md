# ShopSense — E-Commerce Search & Recommendation System

A working full-stack product-discovery platform with **hybrid search** (BM25 + vector + RRF) and a **hybrid recommender** (popularity, content-based, item-item collaborative filtering, matrix factorization), plus a persistent backend (auth, cart, orders, admin) backed by **SQLite**. Built with **zero runtime dependencies** — only Node.js built-ins (`node:http`, `node:sqlite`, `node:crypto`) — so it runs anywhere with `node src/server.js` and no `npm install`.

Inspired by the curation philosophy of [flash.co](https://flash.co): surface the best few, and explain why.

---

## Features

**Search**
- Keyword relevance ranking with **BM25** (length-normalized TF-IDF)
- **Semantic-ish vector retrieval** via synonym/phrase-aware TF-IDF vectors + cosine similarity
- **Hybrid fusion** of lexical + vector lists with **Reciprocal Rank Fusion (RRF)**
- **Typo tolerance / spell correction** (Levenshtein edit distance)
- **Autocomplete** (Trie / prefix tree)
- **Google-style recall** — every real query returns 100+ results: precise matches are ranked first, then relevant catalogue backfill (flagged `related`), paginated
- Filters and **facets**: category (vertical), brand, price range, availability, rating
- **Search-as-you-type** with autocomplete suggestions
- Sort by relevance, price, rating, popularity

**Recommendations**
- **Trending** with time-decayed popularity
- **Similar products** (content-based)
- **Users also viewed** (item-item collaborative filtering)
- **Personalized feed** (matrix factorization + CF + content + popularity blended)
- **Search-history signals** — a signed-in user's recent queries shape their recommendations
- **Cold-start** handling for new users
- **Explainable** reasons on every recommendation ("Based on your recent searches")

**Product & discovery**
- **Expanded catalogue** — a supplemental set of ~220 well-known branded products (Nike, Adidas, Apple, Samsung, Levi's, Sony, boAt, …) across every vertical, merged in automatically
- **Real product images everywhere** — every product carries a real photo (from the DummyJSON / Open Beauty Facts catalogues); synthetic additions inherit real category photos and the SVG illustration is only an offline fallback
- **Deduplicated catalogue** — duplicate id / brand+title rows are collapsed automatically
- **Clean categorisation** — leaf categories are mapped to correct storefront verticals (Beauty, Electronics, Fashion, Footwear, Watches, Home, Grocery, …)
- **Home merchandising** — a "Top brands" shelf of well-known brands plus per-category product shelves (`/api/home`)
- Curated ranked lists ("Best Running Shoes", "Best Budget …", "Premium …")
- Product detail with **full specifications** (normalised attributes + category-aware spec groups)
- **Ratings & reviews** aggregated across partner stores, with a rating breakdown and source filter
- Similar items, also-viewed and rank-in-list
- Interactive **dashboard** with search/rec analytics

**Accounts, cart & orders (backend)**
- **Guest browsing** — no account needed to search or view products
- **Create-profile / log-in modal** gated on wishlist and other major interactions, with required and optional fields
- **Wishlist heart on every product card** (grids, search, home), plus a home-page wishlist section and a dedicated `/wishlist` page
- Persistent per-user **wishlist** backed by the `wishlist_items` table
- Email/password **registration & login** with scrypt hashing and stateless **JWT** (HS256)
- Per-user **shopping cart** (add / update / remove / clear) exposed over a protected REST API
- **Checkout** that creates orders, records purchase feedback and clears the cart
- **Admin API** for product CRUD, catalogue import, user/order listing and analytics
- **SQLite persistence** so accounts, carts, orders and events survive restarts

---

## Architecture

```
                         +--------------------------------------+
   Browser  ---------->  |  Node HTTP server (src/server.js)    |
   (vanilla JS SPA)      |   /api/*  -> REST API                 |
                         |   /*      -> static frontend          |
                         +----------------+---------------------+
                                          |
              +---------------------------+---------------------------+
              |                                                       |
     +--------v---------+                                   +----------v---------+
     |  SearchService   |                                   | RecommendationSvc  |
     |------------------|                                   |--------------------|
     | InvertedIndex    |                                   | Popularity         |
     | BM25             |                                   | Content-based      |
     | VectorModel(TFIDF)|                                  | Item-item CF       |
     | Trie (autocomplete)|                                 | MatrixFactor (SGD) |
     | Fuzzy (Levenshtein)|                                 | Hybrid + reasons   |
     +------------------+                                   +--------------------+
               \                                                       /
                +-------------------+----------------------------------+
                                    |
                      Store (src/store/store.js)
                      in-memory indexes for search & recs
                                    |
                                    v
                      SQLite (src/db/database.js)
                      products / users / interactions
                      cart_items / orders / events / search_logs / search_history
```

Auth is a small module (`src/auth/auth.js`) built on `node:crypto`; the API adds
auth, cart, order and admin sub-routers on top of the existing search/rec routes.

Offline/batch path (in this build, run at startup):
```
generators -> products.json + interactions.json -> seed SQLite -> build index + train models
```

---

## Algorithms & data structures

| Concept | File | Where it is used | Complexity |
|---|---|---|---|
| Inverted index | `src/search/invertedIndex.js` | term → posting lists | O(1) term lookup |
| BM25 | `src/search/bm25.js` | relevance ranking | O(terms × postings) |
| Trie | `src/search/trie.js` | autocomplete | O(m) prefix |
| Levenshtein DP | `src/search/fuzzy.js` | typo correction | O(n·m) |
| TF-IDF vectors + cosine | `src/search/vectorModel.js` | semantic retrieval | O(nnz) |
| Reciprocal Rank Fusion | `src/search/searchService.js` | hybrid ranking | O(ranked lists) |
| Min-heap Top-K | `src/utils/minheap.js` | top results / recs | O(n log k) |
| LRU cache | `src/utils/lru.js` | hot query cache | O(1) |
| Item-item cosine CF | `src/recommend/itemItemCF.js` | "users also viewed" | O(items² × users) once |
| Matrix factorization (SGD) | `src/recommend/matrixFactor.js` | personalization | O(epochs × interactions) |
| Time-decayed popularity | `src/recommend/popularity.js` | trending | O(interactions) |

---

## Project structure

```
.
├── data/                     # generated seed data + SQLite db (git-ignored)
│   ├── products.json
│   ├── users.json
│   ├── interactions.json
│   └── shopsense.db          # created automatically on first run
├── public/                   # frontend (no build step)
│   ├── index.html  search.html  product.html  list.html  wishlist.html  admin.html
│   ├── app.js
│   └── styles.css
├── scripts/
│   ├── generate-catalog.js       # deterministic catalogue generator
│   ├── generate-interactions.js  # synthetic implicit feedback
│   ├── generate-extra.js         # supplemental well-known-brand catalogue
│   ├── reset-db.js               # drop + reseed the SQLite database
│   └── resolve-product-links.js  # backfill real product URLs (affiliate)
├── src/
│   ├── server.js             # HTTP server (API + static)
│   ├── db/
│   │   ├── database.js       # SQLite open/seed and repositories
│   │   └── schema.sql        # tables: products, users, cart, orders, events…
│   ├── auth/auth.js          # scrypt password hashing + HS256 JWT
│   ├── affiliate/affiliate.js # tracking params + product-link resolver
│   ├── catalog/              # catalogue curation + presentation builders
│   │   ├── categories.js     # leaf category -> storefront vertical
│   │   ├── brands.js         # well-known brand list + matcher
│   │   ├── home.js           # top-brand shelf + category shelves
│   │   ├── productSpecs.js
│   │   └── productReviews.js
│   ├── api/
│   │   ├── routes.js         # REST dispatcher + search/rec/product handlers
│   │   ├── http.js           # sendJSON / readBody helpers
│   │   ├── authRoutes.js     # register / login / me
│   │   ├── cartRoutes.js     # cart CRUD
│   │   ├── orderRoutes.js    # checkout + order history
│   │   ├── adminRoutes.js    # product CRUD, import, analytics
│   │   └── wishlistRoutes.js # saved items (token auth)
│   ├── store/store.js        # in-memory indexes wired to SQLite
│   ├── search/               # tokenizer, index, bm25, vector, trie, fuzzy, service
│   ├── recommend/            # popularity, content, item-item CF, MF, service
│   └── utils/                # minheap, lru, rng
├── tests/                    # node:test unit + API tests
├── package.json
└── README.md
```

---

## Quick start

Requires **Node.js 22.5+** (for the built-in `node:sqlite`) and **no `npm install`**.

```bash
# 1. (optional) generate the seed catalogue + interactions
npm run seed

# 2. run the app — on first run the SQLite DB is created and seeded automatically
npm start
# open http://localhost:3000

# dev mode with auto-reload
npm run dev

# run the test suite
npm test

# drop and rebuild the database from the JSON seed files
npm run db:reset
```

Use a different port with `PORT=4000 npm start`, or a different database file with
`SHOPSENSE_DB=/path/to/shopsense.db npm start`. Set `JWT_SECRET` in production
(otherwise a secret is generated and cached in `data/.jwt-secret`).

---

## Profiles & guest browsing

The site works fully for **guests** — browsing, search and product pages need no
account. The header shows **Log in / Create profile** for visitors and the user's
name + menu (with a wishlist link) once signed in.

**Gated interactions.** Wishlist (and cart/checkout/rating) require a profile.
When a guest tries one, a modal opens to **create a profile** (or log in), and the
original action resumes automatically after sign-up.

**Profile fields:**

| Field | Required |
|---|---|
| Name | ✅ |
| Email | ✅ |
| Password | ✅ |
| Confirm password | ✅ |
| Contact number | optional |
| Profession | optional |

The generator still seeds 40 synthetic users with implicit-feedback history, but
these are **internal training data only** — they are flagged `is_seed` and hidden
from `/api/users` and the header, so visitors never see a list of dummy accounts.

### Admin credentials

The admin account can manage products and view analytics.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@shopsense.dev` | `admin123` |

```bash
# log in and capture a token
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@shopsense.dev","password":"admin123"}'
```

---

## API reference

Base: `http://localhost:3000/api`

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health + product count |
| GET | `/home?limit=&perCategory=` | Top-brand shelf + category shelves |
| GET | `/categories` | Categories with counts and brands |
| GET | `/users` | Registered customers (demo accounts hidden) |
| GET | `/search?q=&vertical=&category=&brand=&priceMin=&priceMax=&minRating=&sort=&page=&pageSize=` | Hybrid search, search-as-you-type (records per-user history when authenticated) |
| GET | `/search/suggest?q=` | Autocomplete |
| GET | `/products/:id` | Detail + specs + reviews + similar + also-viewed + ranked-in |
| GET | `/products/:id/similar` | Content-based similar |
| GET | `/products/:id/recommendations` | Item-item CF |
| GET | `/products/:id/specs` | Grouped product specifications |
| GET | `/products/:id/reviews?limit=&source=&minRating=&sort=` | Aggregated reviews + summary |
| GET | `/recommendations?userId=&limit=` | Personalized (search-history + CF/MF when authenticated; trending otherwise) |
| GET | `/recommendations/trending?category=&limit=` | Trending |
| GET | `/curated-lists` | Curated list index |
| GET | `/curated-lists/:id` | Ranked list |
| GET | `/me/wishlist` 🔒 | Alias of `GET /wishlist` |
| GET | `/stats` | Analytics dashboard data |
| POST | `/events` | Log an interaction `{productId, type, userId}` |
| POST | `/ratings` | Submit a rating `{productId, value}` |

**Auth** (routes marked 🔒 require `Authorization: Bearer <token>`)

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create an account `{name, email, password, phone?, profession?}` → `{token, user}` |
| POST | `/auth/login` | Log in `{email, password}` → `{token, user}` |
| GET | `/auth/me` 🔒 | Current user |

**Wishlist** (🔒)

| Method | Path | Description |
|---|---|---|
| GET | `/wishlist` | Saved products for the current user |
| POST | `/wishlist` | Add `{productId}` |
| DELETE | `/wishlist/:productId` | Remove an item |

**Cart** (🔒)

| Method | Path | Description |
|---|---|---|
| GET | `/cart` | Cart with product documents + totals |
| POST | `/cart` | Add `{productId, quantity}` |
| PATCH | `/cart/:productId` | Set `{quantity}` (0 removes) |
| DELETE | `/cart/:productId` | Remove an item |
| DELETE | `/cart` | Clear the cart |

**Orders** (🔒)

| Method | Path | Description |
|---|---|---|
| POST | `/orders` | Checkout the current cart → creates an order |
| GET | `/orders` | Order history for the current user |
| GET | `/orders/:id` | Order detail (owner or admin) |

**Admin** (🔒, role `admin`)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/products?q=&limit=&offset=` | List / search products |
| POST | `/admin/products` | Create a product |
| PUT | `/admin/products/:id` | Update a product |
| DELETE | `/admin/products/:id` | Delete a product |
| POST | `/admin/catalog/import` | Bulk upsert `{products:[…]}` (or regenerate) |
| GET | `/admin/users` | List users |
| GET | `/admin/orders` | List all orders |
| PATCH | `/admin/orders/:id` | Update order `{status}` |
| GET | `/admin/analytics` | Catalogue, orders, events and search analytics |

### Examples

```bash
# hybrid search
curl "http://localhost:3000/api/search?q=running%20shoes%20for%20flat%20feet"

# typo-tolerant search
curl "http://localhost:3000/api/search?q=sunscren"

# personalized recommendations
curl "http://localhost:3000/api/recommendations?userId=u_2&limit=5"

# log an event
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"productId":"p_1003","type":"purchase","userId":"u_2"}'
```

```bash
# --- authenticated cart + checkout flow ---
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"u_1@shopsense.dev","password":"password123"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

curl -s -X POST http://localhost:3000/api/cart \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productId":"p_1003","quantity":2}'

# checkout the cart
curl -s -X POST http://localhost:3000/api/orders -H "Authorization: Bearer $TOKEN"

# order history
curl -s http://localhost:3000/api/orders -H "Authorization: Bearer $TOKEN"

# --- admin: create a product ---
ADMIN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@shopsense.dev","password":"admin123"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

curl -s -X POST http://localhost:3000/api/admin/products \
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
  -d '{"title":"Trail Runner X","price":4999,"brand":"Stride","category":"Running"}'
```

Sample search response:

```json
{
  "query": "running shoes for flat feet",
  "corrected": [],
  "strategy": "hybrid",
  "total": 12,
  "facets": {
    "brand": { "Vibe": 3, "MoveOn": 2, "Stride": 1 },
    "price": { "1000-5000": 5, "5000-20000": 7 }
  },
  "results": [
    { "id": "p_1003", "title": "Stride Performance Glide Pro",
      "price": 8690, "rating": 4, "score": 1, "reason": "Matches: running, shoes" }
  ],
  "tookMs": 4
}
```

---

## Affiliate product links

`/go` redirects **Buy** clicks to the correct merchant. Link resolution order:

1. an explicit, host-validated `u` deep link,
2. a validated **`offer.productUrl`** (a real product page),
3. the merchant's product search for the exact **brand + title**.

Affiliate tracking parameters are appended to every outbound link. Copy
`.env.example` to `.env` and set the values you have:

```bash
AFFILIATE_AMAZON_TAG=yourtag-21
AFFILIATE_FLIPKART_AFFID=your-affid
# ... Myntra / Nykaa / Croma / Ajio / Tata Cliq / Meesho
```

To populate real product URLs, point the app at a **product-link resolver** — any
HTTP service that maps `{ merchant, brand, title }` to `{ url }` (an Amazon
PA-API wrapper, Rainforest, your own affiliate gateway):

```bash
AFFILIATE_RESOLVER_URL=https://your-resolver.example/lookup
AFFILIATE_RESOLVER_KEY=...        # optional
npm run affiliate:resolve         # backfills offer.productUrl for the catalogue
```

Without credentials the app runs normally and uses the precise search links.

---

## Evaluation

The PRD defines the target metrics; the test suite covers correctness of the building blocks. To evaluate relevance properly, add a labelled query set and compute nDCG/MAP (see `tests/` for the harness style).

- **Search**: relevance strategy, typo correction, facets, price filtering (`tests/search.test.js`)
- **Recommendations**: trending, content similarity, item-item CF, MF scoring, explanation, cold start, seen-item exclusion (`tests/recommend.test.js`)
- **API**: endpoint contracts (`tests/api.test.js`)
- **Backend**: auth, cart, orders and admin endpoints against an isolated in-memory database (`tests/backend.test.js`)

Current test result: **65/65 passing**.

> **Note on reviews/specs:** the catalogue is built from public product APIs, which do not expose review text. Specs are normalised from the catalogue plus deterministic category rules; reviews are **clearly-labelled sample data** aggregated across the partner stores. Swap `src/catalog/productReviews.js` for a real reviews API to go live.

---

## Mapping to the PRD

| PRD requirement | Implementation |
|---|---|
| FR-1/2/3 Catalogue + taxonomy | `scripts/generate-catalog.js`, `store.js`, `/api/categories` |
| FR-5/6/7 Keyword search + filters + autocomplete | `bm25.js`, `searchService.js`, `trie.js` |
| FR-8/9/10 Semantic + hybrid + typo | `vectorModel.js`, RRF in `searchService.js`, `fuzzy.js` |
| FR-13/14 Trending + similar | `popularity.js`, `recService.similar` |
| FR-15/16 CF + personalized | `itemItemCF.js`, `matrixFactor.js`, `recService.forUser` |
| FR-17 Cold start | `recService._coldStart` |
| FR-18 Explainability | reason strings on every recommendation |
| FR-21/22 Curated lists + product page | `buildCuratedLists`, `product.html` |
| FR-24/25/27 Accounts/history/admin | user switcher, `/api/events`, `admin.html` |

---

## Notes & production path

The backend persists to **SQLite** (`node:sqlite`) and still ships **zero runtime
dependencies**; the search and recommendation indexes are held in memory for speed
and rebuilt on demand. To scale it toward the PRD's production design:

- Replace SQLite with **PostgreSQL** (+ `pgvector` for embeddings).
- Replace the hand-rolled index with **OpenSearch/Elasticsearch**.
- Replace TF-IDF vectors with **neural embeddings** + an **ANN index (HNSW)**.
- Move the batch pipeline to a scheduler/queue; train models offline and cache results in **Redis**.
- Add refresh-token rotation / OAuth and real ingestion connectors.
- Wire a real affiliate resolver (see **Affiliate product links**) to store exact product URLs on `offer.productUrl`.

---

## Future scope

LLM-powered query understanding and review summaries; session-based/sequence recommenders; learning-to-rank from clicks; A/B testing; multi-store price comparison.

## License

MIT.
