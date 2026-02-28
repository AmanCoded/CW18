# Caleb Williams Rookie Card Portfolio Tracker

## Application Overview

A full-stack web application for tracking and managing a Caleb Williams rookie card collection. Built with a React/TypeScript frontend and FastAPI/Python backend, it provides portfolio valuation, market comparisons, want list management, and mobile-responsive card organization with drag-and-drop reordering.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| Backend | FastAPI, Python 3.12, Uvicorn |
| Database | SQLite (local development), PostgreSQL (production) |
| State Management | TanStack React Query v5 |
| Charts | Recharts |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| HTTP Client | Axios (frontend), httpx (backend) |
| Icons | Lucide React |
| Excel Parsing | Pandas + openpyxl |

---

## Database Schema

### `cards` (Primary Table)
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment primary key |
| year | INTEGER | Card year (e.g. 2024) |
| set_name | TEXT | Set name (e.g. "Donruss Optic - Rated Rookie 201") |
| parallel_rarity | TEXT | Parallel type (e.g. "Holo", "Gold /10", "Black 1/1") |
| serial_number | TEXT | Serial number if numbered |
| population | INTEGER | Known population count |
| date_acquired | TEXT | Acquisition date (NULL for want list) |
| is_graded | BOOLEAN | Whether card is graded |
| grading_company | TEXT | PSA, SGC, BGS, or CGC |
| grade | REAL | Numeric grade (1-10, supports 0.5 increments) |
| cost_basis | REAL | Purchase price |
| authenticity_guaranteed | BOOLEAN | eBay authenticity guarantee |
| is_owned | BOOLEAN | TRUE = collection, FALSE = want list |
| sort_order | INTEGER | Custom sort position for drag-and-drop (default 0) |
| last_sale_price | REAL | Most recent eBay sold price |
| last_sale_date | TEXT | Date of most recent sale |
| avg_30_day_price | REAL | Average sold price over 30 days |
| num_sales_30_day | INTEGER | Number of sales in 30 days |
| price_trend | TEXT | "up", "down", or "stable" |
| lowest_active_price | REAL | Cheapest current eBay listing |
| lowest_active_url | TEXT | URL to cheapest listing |
| estimated_value | REAL | Calculated estimated value |
| last_price_update | TEXT | Timestamp of last price refresh |
| created_at | TIMESTAMP | Record creation time |
| updated_at | TIMESTAMP | Last modification time |

**Unique Constraint:** `(year, set_name, parallel_rarity, grading_company, grade)`

### `price_history`
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| card_id | INTEGER FK | References cards.id |
| price | REAL | Sale price |
| sale_date | TEXT | Date of sale |
| source | TEXT | Data source (e.g. "ebay") |
| url | TEXT | Listing URL |
| created_at | TIMESTAMP | Record creation time |

### `portfolio_snapshots`
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| total_cost_basis | REAL | Sum of all cost bases |
| total_estimated_value | REAL | Sum of all estimated values |
| snapshot_date | TEXT | Date of snapshot |
| created_at | TIMESTAMP | Record creation time |

### `notable_sales`
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| card_description | TEXT | Description of the card sold |
| price | REAL | Sale price |
| sale_date | TEXT | Date of sale |
| platform | TEXT | Platform (e.g. "eBay") |
| url | TEXT | Listing URL |
| set_name | TEXT | Set name for categorization |
| parallel_type | TEXT | Parallel type |
| created_at | TIMESTAMP | Record creation time |

---

## Backend API Endpoints

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check returning `{"status": "healthy"}` |

### Portfolio
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/portfolio/summary` | Portfolio totals: cost basis, estimated value, appreciation ($/%), owned count, want list count |
| GET | `/api/portfolio/history?days=90` | Array of portfolio snapshots for charting |

### Cards
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cards` | All cards with computed eBay search URLs |
| GET | `/api/cards/owned` | Owned collection only (is_owned=true) |
| GET | `/api/cards/wantlist` | Want list only (is_owned=false) |
| POST | `/api/cards` | Create a new card |
| PUT | `/api/cards/{card_id}` | Update an existing card |
| DELETE | `/api/cards/{card_id}` | Delete a card |
| PUT | `/api/cards/reorder` | Reorder cards via drag-and-drop |
| POST | `/api/cards/{card_id}/acquire` | Move a want list card to owned collection |

### Pricing
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/prices/status` | Refresh job status: running, progress, total, current_card |
| POST | `/api/prices/refresh` | Start background price refresh for all cards |
| POST | `/api/prices/refresh/{card_id}` | Refresh price for a single card |

### Notable Sales
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notable-sales?limit=50` | Recent notable card sales for market context |

### Data Import/Export
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/export/csv` | Download collection as CSV file |
| POST | `/api/import/excel` | Import cards from Excel spreadsheet (replaces existing data) |

---

## Pricing Engine

### Price Estimation (`backend/scrapers/ebay_scraper.py`)

The pricing system uses a tiered approach:

1. **Market Estimates Database** — Hardcoded price estimates based on January 2026 eBay market data for ~50 known Caleb Williams parallels
2. **Grading Multipliers** — Adjusts base price based on grade:
   - PSA 10: 100% (base price)
   - PSA 9.5: 60%
   - PSA 9: 40%
   - PSA 8: 25%
   - Below PSA 8: 15%
   - Raw (ungraded): 30%
3. **24-Hour Cache** — Prices cached to `backend/data/price_cache.json` with TTL
4. **eBay URL Generation** — Generates direct eBay search URLs for manual price verification (sold listings and active listings)

> **Note:** The `fetch_ebay_sold_listings()` and `fetch_ebay_active_listings()` functions are placeholder stubs. Live eBay API integration requires an eBay developer account (Phase 1 of the enhancement plan).

### Comp Engine (`backend/scrapers/comp_engine.py`)

For rare cards (population ≤ 25), a multi-tier valuation system provides estimates:

| Tier | Source | Weight | Description |
|------|--------|--------|-------------|
| Tier 1 | Exact Match | 60% | Historical sales of the same card |
| Tier 2 | Draft Class Comps | 30% | Same parallel from 2024 QB class (Daniels, Maye, Nix, McCarthy, Penix) |
| Tier 3 | Scarcity Reference | 10% | Caleb Williams cards at similar population ranges |
| Tier 4 | Market Context | Display only | Other CW 1/1s from different sets (not used in valuation) |

**Special handling for 1/1 cards:** Tier 2 (draft class comps) receives 100% weight when no Tier 1 data exists.

**Outlier removal:** Prices > 2 standard deviations from mean are excluded.

---

## Frontend Architecture

### Application Layout

```
┌─────────────────────────────────────────────┐
│ Header (Logo, Title, Action Buttons)        │
├─────────────────────────────────────────────┤
│ KPI Cards (Cost Basis | Value | P/L $ | %)  │
├─────────────────────────────────────────────┤
│ Portfolio Value Chart (Area Chart)          │
├─────────────────────────────────────────────┤
│ Tab Navigation (Collection | Want List | …) │
├─────────────────────────────────────────────┤
│ Filter Bar (Search, Set, Grade filters)     │
├─────────────────────────────────────────────┤
│ Main Content (Table / Card View)            │
├─────────────────────────────────────────────┤
│ Footer                                      │
└─────────────────────────────────────────────┘
```

### Components

#### `App.tsx` — Main Application Shell
- Orchestrates all components and state
- Manages modal visibility (add, edit, acquire, delete, import)
- Passes filtered card data to table components
- Handles card reorder via `useReorderCards` mutation
- Provides mobile bottom navigation

#### `KPICard.tsx` — Summary Metric Display
- Displays: Total Cost Basis, Current Value, Net P/L ($), Net P/L (%)
- Trend indicator with colored arrows (green up, red down)
- Mobile: horizontal scroll strip with snap points
- Desktop: 4-column responsive grid

#### `PortfolioChart.tsx` — Portfolio Value Chart
- Recharts `AreaChart` with gradient fill
- Time range selector: 7D, 30D, 90D, ALL
- Custom tooltip with currency formatting
- Responsive height: 200px mobile, 280px desktop
- Bears color theme (navy fill, orange accents)

#### `CardTable.tsx` — Owned Collection Display
- **Desktop View:** Sortable table with columns for Set, Parallel, Grade, Cost, Value, P/L, 30D Avg, Trend
- **Mobile View:** Card-based vertical layout with tap-to-expand details
- **Expanded Row Details:** Serial number, population, acquisition date, last sale price, last sale return ($/%), lowest active price, eBay links
- **Sorting:** Click column headers (desktop) or use sort dropdown (mobile)
- **Drag-and-Drop Reorder:** Toggle reorder mode to rearrange cards with grip handles
- **Actions:** View on eBay, refresh price, edit card, delete card

#### `WantListTable.tsx` — Want List Display
- **Buying Opportunity Detection:** Highlights cards where lowest active price is ≥10% below 30-day average (yellow "Deal" badge)
- **Desktop View:** Table with columns for Set, Parallel, Target Grade, 30D Avg, Lowest Active, vs Avg discount
- **Mobile View:** Card-based layout with 3-column price grid
- **Actions:** Buy Now link, eBay search, mark as acquired, edit, delete

#### `FilterBar.tsx` — Search & Filter Interface
- **Text Search:** Matches against set_name, parallel_rarity, grading_company (case-insensitive)
- **Set Filter:** Dropdown populated from unique set names in collection
- **Grade Filter:** Toggle buttons — All / Graded / Raw
- **Active Filter Badge:** Shows count of active filters
- **Clear All:** Reset all filters with one click
- All filtering is client-side (dataset < 100 cards)

#### `AddCardModal.tsx` — Add/Edit Card Form
- **Dual Mode:** Add new card or edit existing card
- **Card Type Toggle:** Collection vs Want List (hidden in edit mode)
- **Fields:**
  - Year (2020-2030 range)
  - Set Name (dropdown with 8 common sets + "Other" custom input)
  - Parallel/Rarity (text input, required)
  - Graded toggle → Grading Company (PSA/SGC/BGS/CGC) + Grade (1-10)
  - Collection-only: Date Acquired, Cost Basis, Authenticity Guaranteed
- **Common Sets:** Donruss Optic, Prizm, Select, National Treasures, Topps Finest, Panini Absolute, Immaculate, Bowman Chrome

#### `AcquireCardModal.tsx` — Move Want List → Collection
- Pre-fills cost basis with lowest active price or 30-day average
- Required fields: Date Acquired, Purchase Price
- Transitions card from want list to owned collection

#### `NotableSales.tsx` — Market Context Display
- Shows recent 1/1 and rare card sales
- Displays card description, price, date, platform
- Links to eBay listings when available

#### `ConfirmModal.tsx` — Delete Confirmation Dialog

#### `ImportModal.tsx` — Excel File Import
- Upload `.xlsx` file to replace all card data
- Clears existing database before import

### React Query Hooks (`hooks/useApi.ts`)

#### Query Hooks (GET requests with caching)
| Hook | Endpoint | Refresh |
|------|----------|---------|
| `usePortfolioSummary()` | `/portfolio/summary` | Every 30 seconds |
| `usePortfolioHistory(days)` | `/portfolio/history` | On mount |
| `useCards()` | `/cards` | On mount |
| `useOwnedCards()` | `/cards/owned` | On mount |
| `useWantList()` | `/cards/wantlist` | On mount |
| `useRefreshStatus()` | `/prices/status` | Every 2 seconds |
| `useNotableSales(limit)` | `/notable-sales` | On mount |

#### Mutation Hooks (POST/PUT/DELETE with cache invalidation)
| Hook | Endpoint | Invalidates |
|------|----------|-------------|
| `useCreateCard()` | `POST /cards` | cards, portfolio |
| `useUpdateCard()` | `PUT /cards/{id}` | cards, portfolio |
| `useDeleteCard()` | `DELETE /cards/{id}` | cards, portfolio |
| `useReorderCards()` | `PUT /cards/reorder` | cards |
| `useRefreshPrices()` | `POST /prices/refresh` | prices status |
| `useRefreshSingleCard()` | `POST /prices/refresh/{id}` | cards, portfolio |
| `useAcquireCard()` | `POST /cards/{id}/acquire` | cards, portfolio |
| `useExportCSV()` | `GET /export/csv` | — (downloads file) |

---

## Mobile Responsive Design

### Breakpoints
- **Mobile:** < 640px (default Tailwind)
- **Small (sm:):** ≥ 640px
- **Medium (md:):** ≥ 768px

### Mobile-Specific Features

| Feature | Mobile | Desktop |
|---------|--------|---------|
| Header | Stacked layout, icon-only buttons | Horizontal, full button text |
| KPI Cards | Horizontal scroll with snap | 4-column grid |
| Chart | 200px height | 280px height |
| Navigation | Fixed bottom tab bar | Inline tabs |
| Card Table | Vertical card layout | Full table |
| Want List | Card layout with price grid | Full table |
| Sorting | Dropdown selector | Clickable column headers |
| Add Card | Floating button above content | In header |
| Footer | Hidden | Visible |

### Mobile Bottom Navigation
- Fixed position at screen bottom
- 4 tabs: Collection, Want List, Notable, Chart
- Active tab highlighted in Bears orange
- Count badges on Collection and Want List tabs

---

## Drag-and-Drop Card Reordering

### Implementation
- **Library:** @dnd-kit/core + @dnd-kit/sortable
- **Activation:** 5px pointer movement threshold (prevents accidental drags)
- **Keyboard Support:** Arrow keys for accessibility

### User Flow
1. Click/tap "Reorder" button to enter reorder mode
2. Grab the grip handle (⠿ icon) on any card
3. Drag to new position
4. Release to drop — new order saved to database automatically
5. Click "Done Reordering" to exit reorder mode

### Visual Modes
- **Desktop Reorder:** Simplified card list with grip handles, showing key info (set, grade, cost, value, P/L)
- **Mobile Reorder:** Card view with grip handles on left side
- **Normal Mode:** Full table (desktop) or card view (mobile) without handles

### Backend
- `sort_order` column on cards table (INTEGER, default 0)
- `PUT /api/cards/reorder` accepts array of `{card_id, sort_order}` pairs
- Cards ordered by: `is_owned DESC, sort_order ASC, set_name, parallel_rarity`

---

## Configuration

### Frontend Environment
| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api` | Backend API base URL |

### Backend Environment
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | (none — uses SQLite) | PostgreSQL connection string for production |

### Development Proxy
Vite dev server proxies `/api` requests to `http://localhost:8000` (FastAPI backend).

### Production
- Frontend: Static build served separately
- Backend: Deployed to Render at `https://caleb-cards-api.onrender.com`
- Database: PostgreSQL via Render

---

## Design Theme

Chicago Bears color palette:
- **Navy:** `#0B162A` (backgrounds, headers)
- **Orange:** `#C83803` (accents, active states, buttons)
- **Gray:** `#A5ACAF` (secondary text, borders)
- **White:** Card backgrounds, text on dark
- **Green:** `#22c55e` (positive P/L, upward trends)
- **Red:** `#ef4444` (negative P/L, downward trends)
- **Yellow:** `#f59e0b` (buying opportunity badges)

---

## Enhancement Roadmap

### Completed
- [x] Phase 1C: Last Sale Return KPI (dollar amount and percentage in expanded card row)
- [x] Phase 3A: Card Edit Modal (edit existing cards via pencil icon)
- [x] Phase 3D: Card Filtering (search, set filter, grade filter)
- [x] Phase 5A: Mobile-Responsive Redesign (card layout, bottom nav, scroll KPIs)
- [x] Phase 5B: Drag-to-Rearrange (reorder cards with grip handles)

### Pending
- [ ] Phase 1A: eBay API Integration (requires eBay developer account)
- [ ] Phase 1B: Price Data Pipeline (real price history from eBay API)
- [ ] Phase 2A: Monthly Snapshot System (per-card monthly values)
- [ ] Phase 2B: Monthly P&L Endpoints (month-over-month tracking)
- [ ] Phase 2C: Monthly P&L Frontend (bar chart toggle on portfolio chart)
- [ ] Phase 3B: Want List Grade-Level Pricing (PSA 10/9/8/Raw columns)
- [ ] Phase 3C: Want List Sum Totals by PSA Level
- [ ] Phase 4A: PSA Cert Verification (auto-pull grade and population)
- [ ] Phase 4B: BGS/Beckett Cert Support
- [ ] Phase 5B: Drag-to-Rearrange Enhancements
- [ ] Phase 6A: Price Alert Backend
- [ ] Phase 6B: Alert Evaluation Engine
- [ ] Phase 6C: Alert UI (notification bell, alert creation modal)

### Blockers
- **eBay API Credentials:** Phases 1A, 1B, 3B, 3C, and 6 all require a registered eBay developer account (free at developer.ebay.com, 1-3 business day approval)
- **Card Ladder:** No public API available; deferred until subscription obtained

---

## Running the Application

### Prerequisites
- Python 3.12+
- Node.js 18+
- npm or yarn

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the backend at `http://localhost:8000`.

### Build for Production
```bash
cd frontend
npm run build
```

---

## Data Flow

```
User Action → React Component → useApi Hook (Mutation)
    → Axios POST/PUT/DELETE → FastAPI Endpoint
    → database.py → SQLite/PostgreSQL
    → Response → React Query Cache Invalidation
    → Auto-refetch → UI Update
```

### Price Refresh Flow
```
User clicks "Refresh Prices"
    → POST /api/prices/refresh (starts background task)
    → Frontend polls GET /api/prices/status every 2 seconds
    → Background task iterates each card:
        → ebay_scraper.get_card_prices() → estimated price
        → Updates card in database
        → Updates progress counter
    → Task completes → Frontend stops polling
    → React Query invalidates all card/portfolio queries
```
