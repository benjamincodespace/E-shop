# E-shop — Production Monorepo (Next.js + Golang + MongoDB + Cloudinary + Cloudflare)

**E-shop** is a minimalist monochrome T-shirt e-commerce platform built with a **Next.js App Router** frontend (configured for **Cloudflare Workers** via **OpenNext**), a **Golang (Go 1.23)** REST API using Clean Architecture, **MongoDB Atlas** with ACID transactions, and **Cloudinary** signed image uploads.

---

## Architecture Overview

```text
Customer / Admin Browser
        │
        ├── https://eshopall.example.com ──▶ Cloudflare Workers (Next.js 15 App Router via @opennextjs/cloudflare)
        │                                      └─ Server Components SSR / ISR (products, SEO metadata, JSON-LD, sitemap.xml)
        │
        ├── https://api.eshopall.example.com ─▶ Cloudflare DNS/Proxy + SSL (Full Strict)
        │                                         └─ Container Compute (Google Cloud Run / Fly.io) running Go 1.23 API
        │                                               ├─ MongoDB Atlas (ACID multi-doc transactions + indexes)
        │                                               └─ Cloudinary Admin/Upload API (SHA-1 signed uploads & cleanup)
        │
        └── Direct Client Upload ───────────▶ Cloudinary (`POST /v1_1/<cloud_name>/image/upload`) using Go-signed params
```

### Runtime Notes
- A conventional stateful Go REST server using `mongo-driver/v2` TCP/TLS sockets cannot run inside a standard Cloudflare Worker isolate. Therefore, Next.js runs on **Cloudflare Workers** (`@opennextjs/cloudflare`), while the **Go API** deploys to container compute (**Google Cloud Run** or **Fly.io**) behind **Cloudflare DNS + SSL**.
- All private secrets (`MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_PASSCODE`, `CLOUDINARY_API_SECRET`) remain strictly on the Go backend.

---

## Project Structure

```text
teestore/
├── backend/                     # Go 1.23 REST API (Clean Architecture + MongoDB + Cloudinary)
│   ├── cmd/
│   │   ├── api/main.go          # HTTP server + graceful shutdown + MongoDB seed/index
│   │   └── seed/main.go         # Standalone index & sample catalog seeder
│   ├── internal/
│   │   ├── config/              # Typed env configuration
│   │   ├── handlers/            # Auth, Catalog, Orders, Reviews, Admin HTTP handlers
│   │   ├── middleware/          # CORS, security headers, JWT auth, RBAC, rate limiter
│   │   ├── models/              # Domain models & BSON/JSON serialization
│   │   ├── repositories/        # MongoDB repositories, indexes, & ACID transactions
│   │   ├── routes/              # Go 1.22+ ServeMux route bindings (/api/*)
│   │   ├── security/            # bcrypt, JWT access/refresh tokens, CSRF verification
│   │   └── services/            # Pure domain logic + Cloudinary SHA-1 signing & deletion
│   ├── Dockerfile               # Multi-stage Alpine container image for Cloud Run / Fly.io
│   └── .env.example
│
└── frontend/                    # Next.js 15 App Router + TypeScript + Tailwind CSS v4 + OpenNext
    ├── public/images/           # Monochrome studio product assets
    ├── src/
    │   ├── app/
    │   │   ├── (store)/         # Customer storefront routes (Home, Catalog, Product SSR, Cart, Checkout, Account)
    │   │   ├── admin/           # Monochrome Admin Dashboard routes
    │   │   ├── robots.ts        # Dynamic robots.txt
    │   │   └── sitemap.ts       # Dynamic sitemap.xml from Go API
    │   ├── components/          # Client UI modules (3-col storefront, ProductDetailView, AdminDashboard, etc.)
    │   ├── context/             # StoreContext (Next.js App Router navigation, cart, wishlist, auth)
    │   ├── lib/                 # Pure pricing/filtering helpers, Cloudinary responsive loader, SSR fetchers
    │   ├── services/            # Typed Go API client with automatic refresh token rotation & CSRF header
    │   └── types/               # TypeScript domain contracts
    ├── next.config.ts
    ├── open-next.config.ts
    ├── wrangler.jsonc
    └── .env.example
```

---

## Local Development Setup

### 1. Prerequisites
- **Go 1.23+** (`https://go.dev/dl/`)
- **MongoDB Atlas** cluster (M0+ replica set required for multi-document ACID checkout/cancellation transactions)
- **Node.js 20+** and **npm**
- **Cloudinary** account (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)

### 2. Configure & Run the Go Backend

```bash
cd teestore/backend
cp .env.example .env
# Edit .env with MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, CLOUDINARY_* credentials

go mod tidy

# Optional: initialize indexes and seed sample catalog explicitly
go run ./cmd/seed

# Start the Go API on :8080
go run ./cmd/api
```

Run Go unit tests:
```bash
cd teestore/backend
go test ./...
```

### 3. Configure & Run the Next.js Frontend

```bash
cd teestore/frontend
cp .env.example .env.local
# Default .env.local targets http://localhost:8080 for the Go API and http://localhost:3000 for canonical URLs

npm install
npm test
npm run typecheck
npm run dev
```

Visit `http://localhost:3000` for the storefront and `http://localhost:3000/admin` for the admin console.

---

## MongoDB Indexes & ACID Transactions

- **Indexes (`internal/repositories/mongo.go`)**:
  - `users`: unique `email`
  - `categories`: unique `slug`
  - `products`: unique `slug`, compound `{ published: 1, featured: 1, popular: 1 }`, `{ category_id: 1, rating_avg: -1 }`, `{ created_at: -1 }`
  - `orders`: unique `order_number`, `{ user_id: 1, created_at: -1 }`, `{ status: 1 }`
  - `reviews`: compound unique `{ product_id: 1, user_id: 1 }`, `{ product_id: 1, created_at: -1 }`
  - `inventory_logs`: `{ product_id: 1, created_at: -1 }`
- **Transactions (`internal/repositories/order_repo.go`)**:
  - **Checkout (`CreateOrderTx`)**: Atomically checks and decrements stock with `$gte` guards, inserts the order document, writes audit `inventory_logs`, and clears the authenticated user's cart inside one MongoDB session transaction.
  - **Cancellation (`UpdateStatusTx`)**: Restores stock across all order items and logs restock entries inside an ACID transaction when transitioning an order to `Cancelled`.

---

## Production Deployment

### 1. Deploy the Go API (Google Cloud Run / Fly.io)
Build and push the multi-stage container image in `teestore/backend/Dockerfile`:

```bash
cd teestore/backend
docker build -t gcr.io/YOUR_PROJECT/eshopall-api:latest .
docker push gcr.io/YOUR_PROJECT/eshopall-api:latest
```

Deploy to Cloud Run (or Fly.io) with environment variables configured in Secret Manager:
- `APP_ENV=production`
- `APP_URL=https://eshopall.example.com`
- `FRONTEND_ORIGIN=https://eshopall.example.com`
- `MONGODB_URI=mongodb+srv://...`
- `JWT_SECRET=<strong-random-64-hex>`
- `JWT_REFRESH_SECRET=<strong-random-64-hex>`
- `ADMIN_PASSCODE=<strong-admin-passcode>` (optional; omit to use one-time first-run admin claim)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

Point `api.eshopall.example.com` to your Cloud Run / Fly.io origin in **Cloudflare DNS** (Proxied, SSL/TLS mode **Full (Strict)**).

### 2. Deploy Next.js to Cloudflare Workers (OpenNext)

```bash
cd teestore/frontend
# Ensure NEXT_PUBLIC_API_URL=https://api.eshopall.example.com
# Ensure API_INTERNAL_URL=https://api.eshopall.example.com
# Ensure NEXT_PUBLIC_APP_URL=https://eshopall.example.com

npm run cf:build
npm run cf:deploy
```

Bind your custom domain `eshopall.example.com` to the `teestore-frontend` Cloudflare Worker in the Cloudflare dashboard.

### 3. Deploy the storefront on Vercel

The frontend is a standard Next.js 15 App Router app, so it deploys to Vercel without any extra adapter.

1. Import the repository into Vercel and set **Root Directory** to `frontend` (framework preset: Next.js).
2. Add the environment variables below for the Production (and Preview) environments:
   - `NEXT_PUBLIC_APP_URL=https://your-production-domain` — used for canonical URLs, OpenGraph, `sitemap.xml` and `robots.txt`. If omitted, deployment builds fall back to `VERCEL_URL`.
   - `NEXT_PUBLIC_API_URL` and `API_INTERNAL_URL` — the public Go API origin.
   - `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (optional) — Search Console HTML-tag token.
3. Deploy, then submit `https://your-production-domain/sitemap.xml` in Google Search Console.

SEO is configured in code: per-page metadata and canonicals, dynamic `robots.txt` (blocks admin/cart/checkout/account routes), dynamic `sitemap.xml` (home, catalogue, categories and every published product), OpenGraph/Twitter cards, and JSON-LD for Organization, WebSite, Product and BreadcrumbList. Admin, cart, checkout, favourites, orders, settings and sign-up pages are marked `noindex`.
