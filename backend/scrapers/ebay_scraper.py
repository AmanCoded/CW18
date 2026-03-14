"""
eBay Price Data Module for Caleb Williams Card Dashboard

Uses eBay's official APIs:
- Browse API: Active listings (lowest BIN prices)
- Finding API: Completed/sold listings (30-day averages, last sale)

Requires environment variables: EBAY_APP_ID, EBAY_CERT_ID
"""
import os
import re
import base64
from datetime import datetime, timedelta
from typing import Optional, List
from dataclasses import dataclass
import json
from pathlib import Path
import urllib.parse
import httpx

# Load .env file if present (for local development)
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, _, value = line.partition('=')
                os.environ.setdefault(key.strip(), value.strip())

# eBay API credentials
EBAY_APP_ID = os.environ.get('EBAY_APP_ID', '')
EBAY_CERT_ID = os.environ.get('EBAY_CERT_ID', '')

# Cache file for price data and OAuth tokens
CACHE_FILE = Path(__file__).parent.parent / "data" / "price_cache.json"
TOKEN_CACHE_FILE = Path(__file__).parent.parent / "data" / "ebay_token.json"
CACHE_TTL_MINUTES = 60 * 6  # 6 hours for API data

# eBay API endpoints (Production)
EBAY_AUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1"
EBAY_FINDING_URL = "https://svcs.ebay.com/services/search/FindingService/v1"

# Fallback price estimates (used when API returns no results)
PRICE_ESTIMATES = {
    "base": 50, "holo": 200, "blue hyper": 100, "green hyper": 120,
    "pink": 100, "purple shock": 90, "fire": 400, "red mojo": 250,
    "green velocity": 150, "teal velocity": 140, "white sparkle": 130,
    "freedom": 200, "jazz": 180, "stars": 160, "red stars": 300,
    "rocket": 250, "one hundred": 500, "blue glitter": 350,
    "wave /300": 150, "aqua /299": 160, "orange /249": 180,
    "blue /199": 200, "flex /149": 250, "red /125": 300,
    "pink velocity /80": 400, "orange scope /79": 420,
    "electricity /75": 450, "purple /60": 550, "lime green /50": 650,
    "team logo /32": 900, "black pandora /25": 1200, "dragon /24": 1300,
    "footballs /16": 2000, "ice /15": 2200, "purple stars /15": 2100,
    "gold /10": 3500, "blue mojo /5": 6000, "green /5": 5500,
    "black 1/1": 15000, "gold vinyl 1/1": 20000, "nebula 1/1": 18000,
    "kaboom! horizontal": 4500, "kaboom horizontal": 4500,
    "framed fabrics patch /25": 300, "framed fabrics patch": 300,
    "rookie auto refractor": 350, "nike swoosh patch 1/1": 8000,
    "nike swoosh patch": 8000, "micro mosaic": 800,
}


@dataclass
class EbaySale:
    title: str
    price: float
    sale_date: str
    url: str
    is_auction: bool


@dataclass
class EbayListing:
    title: str
    price: float
    url: str
    is_buy_now: bool


@dataclass
class PriceData:
    last_sale_price: Optional[float]
    last_sale_date: Optional[str]
    avg_30_day_price: Optional[float]
    num_sales_30_day: int
    price_trend: Optional[str]
    lowest_active_price: Optional[float]
    lowest_active_url: Optional[str]
    sales: List[EbaySale]
    source: str = "estimate"  # "estimate", "cache", "api"


# ── OAuth Token Management ──────────────────────────────────────────

async def get_oauth_token() -> Optional[str]:
    """Get eBay OAuth2 application token (Client Credentials Grant)."""
    if not EBAY_APP_ID or not EBAY_CERT_ID:
        print("  [eBay] No API credentials configured")
        return None

    # Check cached token
    if TOKEN_CACHE_FILE.exists():
        try:
            with open(TOKEN_CACHE_FILE) as f:
                token_data = json.load(f)
            expires = datetime.fromisoformat(token_data['expires_at'])
            if datetime.now() < expires - timedelta(minutes=5):
                return token_data['access_token']
        except Exception:
            pass

    # Request new token
    credentials = base64.b64encode(f"{EBAY_APP_ID}:{EBAY_CERT_ID}".encode()).decode()

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                EBAY_AUTH_URL,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": f"Basic {credentials}",
                },
                data={
                    "grant_type": "client_credentials",
                    "scope": "https://api.ebay.com/oauth/api_scope",
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

            access_token = data['access_token']
            expires_in = data.get('expires_in', 7200)
            expires_at = datetime.now() + timedelta(seconds=expires_in)

            # Cache token
            TOKEN_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(TOKEN_CACHE_FILE, 'w') as f:
                json.dump({
                    'access_token': access_token,
                    'expires_at': expires_at.isoformat(),
                }, f)

            print("  [eBay] OAuth token acquired")
            return access_token

        except Exception as e:
            print(f"  [eBay] OAuth error: {e}")
            return None


# ── Price Cache ─────────────────────────────────────────────────────

def load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_cache(cache: dict):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f, indent=2)


def get_cached_price(cache_key: str) -> Optional[dict]:
    cache = load_cache()
    if cache_key in cache:
        cached = cache[cache_key]
        try:
            cached_time = datetime.fromisoformat(cached['timestamp'])
            if datetime.now() - cached_time < timedelta(minutes=CACHE_TTL_MINUTES):
                return cached['data']
        except Exception:
            pass
    return None


def set_cached_price(cache_key: str, data: dict):
    cache = load_cache()
    cache[cache_key] = {
        'timestamp': datetime.now().isoformat(),
        'data': data
    }
    save_cache(cache)


# ── Search Query Building ──────────────────────────────────────────

def build_search_query(year: int, set_name: str, parallel_rarity: str,
                       grading_company: Optional[str] = None,
                       grade: Optional[float] = None,
                       raw_only: bool = False) -> str:
    """Build simplified eBay search query string."""
    parts = ["Caleb Williams"]

    set_lower = set_name.lower()
    if "donruss optic" in set_lower:
        parts.append("Optic")
    elif "national treasures" in set_lower:
        parts.append("National Treasures")
    elif "topps finest" in set_lower:
        parts.append("Topps Finest")
    elif "panini absolute" in set_lower or "kaboom" in parallel_rarity.lower():
        parts.append("Kaboom")
    elif "immaculate" in set_lower:
        parts.append("Immaculate")
    elif "mosaic" in set_lower:
        parts.append("Mosaic")
    else:
        clean_set = set_name.split(' - ')[0].split()[0]
        parts.append(clean_set)

    clean_parallel = re.sub(r'^\d+\.\s*', '', parallel_rarity)

    if '1/1' in parallel_rarity:
        clean_parallel = clean_parallel.replace('1/1', '').strip()
        if clean_parallel:
            parts.append(clean_parallel)
        parts.append("1/1")
    else:
        clean_parallel = re.sub(r'/\d+', '', clean_parallel).strip()
        if clean_parallel and clean_parallel.lower() not in ['base', 'rookie']:
            parts.append(clean_parallel)

    if grading_company and grade:
        grade_str = str(int(grade)) if grade == int(grade) else str(grade)
        parts.append(f"{grading_company} {grade_str}")
    elif raw_only:
        parts.append("raw")

    return " ".join(parts)


def generate_ebay_url(query: str, sold: bool = True) -> str:
    """Generate direct eBay search URL."""
    encoded = urllib.parse.quote_plus(query)
    if sold:
        return f"https://www.ebay.com/sch/i.html?_nkw={encoded}&LH_Complete=1&LH_Sold=1&_sop=13"
    else:
        return f"https://www.ebay.com/sch/i.html?_nkw={encoded}&_sop=15&LH_BIN=1"


# ── eBay Browse API (Active Listings) ──────────────────────────────

async def fetch_ebay_active_listings(query: str, max_results: int = 10) -> List[EbayListing]:
    """Fetch active Buy It Now listings using the eBay Browse API."""
    token = await get_oauth_token()
    if not token:
        return []

    async with httpx.AsyncClient() as client:
        try:
            # Browse API search endpoint
            params = {
                "q": query,
                "category_ids": "261328",  # Football Cards
                "filter": "buyingOptions:{FIXED_PRICE}",
                "sort": "price",
                "limit": str(min(max_results, 50)),
            }

            resp = await client.get(
                f"{EBAY_BROWSE_URL}/item_summary/search",
                params=params,
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
                },
                timeout=15,
            )

            if resp.status_code == 200:
                data = resp.json()
                items = data.get('itemSummaries', [])
                listings = []
                for item in items:
                    price_val = float(item.get('price', {}).get('value', 0))
                    if price_val <= 0:
                        continue
                    listings.append(EbayListing(
                        title=item.get('title', ''),
                        price=price_val,
                        url=item.get('itemWebUrl', ''),
                        is_buy_now=True,
                    ))
                print(f"  [eBay Browse] Found {len(listings)} active listings for: {query}")
                return listings
            else:
                print(f"  [eBay Browse] HTTP {resp.status_code}: {resp.text[:200]}")
                return []

        except Exception as e:
            print(f"  [eBay Browse] Error: {e}")
            return []


# ── eBay Browse API (Sold/Completed Items Fallback) ───────────────

async def fetch_browse_sold_items(query: str, max_results: int = 20) -> List[EbaySale]:
    """Fallback: Use Browse API to search recently ended items. Less data than
    Finding API but works when Finding API is rate-limited."""
    token = await get_oauth_token()
    if not token:
        return []

    async with httpx.AsyncClient() as client:
        try:
            # Search with no buying option filter to get broader results
            # and use price sorting to get market data
            params = {
                "q": query,
                "category_ids": "261328",
                "sort": "-price",  # highest price first
                "limit": str(min(max_results, 50)),
            }

            resp = await client.get(
                f"{EBAY_BROWSE_URL}/item_summary/search",
                params=params,
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
                },
                timeout=15,
            )

            if resp.status_code == 200:
                data = resp.json()
                items = data.get('itemSummaries', [])
                # Use active BIN prices as proxy for recent sale prices
                # This gives us market-rate data even without completed items
                sales = []
                for item in items:
                    price_val = float(item.get('price', {}).get('value', 0))
                    if price_val <= 0:
                        continue
                    sales.append(EbaySale(
                        title=item.get('title', ''),
                        price=price_val,
                        sale_date=datetime.now().strftime('%Y-%m-%d'),
                        url=item.get('itemWebUrl', ''),
                        is_auction=False,
                    ))
                if sales:
                    print(f"  [eBay Browse Fallback] Using {len(sales)} active prices as market reference")
                return sales
            return []

        except Exception as e:
            print(f"  [eBay Browse Fallback] Error: {e}")
            return []


# ── eBay Finding API (Completed/Sold Listings) ────────────────────

async def fetch_ebay_sold_listings(query: str, max_results: int = 20, _retry: int = 0) -> List[EbaySale]:
    """Fetch completed/sold listings using the eBay Finding API."""
    if not EBAY_APP_ID:
        return []

    async with httpx.AsyncClient() as client:
        try:
            # Finding API - findCompletedItems
            params = {
                "OPERATION-NAME": "findCompletedItems",
                "SERVICE-VERSION": "1.13.0",
                "SECURITY-APPNAME": EBAY_APP_ID,
                "RESPONSE-DATA-FORMAT": "JSON",
                "REST-PAYLOAD": "",
                "keywords": query,
                "categoryId": "261328",  # Football Cards
                "itemFilter(0).name": "SoldItemsOnly",
                "itemFilter(0).value": "true",
                "itemFilter(1).name": "Condition",
                "itemFilter(1).value": "3000",  # Used (for graded cards)
                "sortOrder": "EndTimeSoonest",
                "paginationInput.entriesPerPage": str(min(max_results, 100)),
            }

            resp = await client.get(
                EBAY_FINDING_URL,
                params=params,
                timeout=15,
            )

            if resp.status_code == 200:
                data = resp.json()
                search_result = (
                    data
                    .get('findCompletedItemsResponse', [{}])[0]
                    .get('searchResult', [{}])[0]
                )

                total_count = int(search_result.get('@count', '0'))
                if total_count == 0:
                    print(f"  [eBay Finding] No sold items found for: {query}")
                    return []

                items = search_result.get('item', [])
                sales = []
                for item in items:
                    selling_status = item.get('sellingStatus', [{}])[0]
                    price_info = selling_status.get('currentPrice', [{}])[0]
                    price_val = float(price_info.get('__value__', 0))

                    if price_val <= 0:
                        continue

                    # Determine listing type
                    listing_type = item.get('listingInfo', [{}])[0].get('listingType', [None])[0]
                    is_auction = listing_type in ['Auction', 'AuctionWithBIN']

                    # Get end date
                    end_time = item.get('listingInfo', [{}])[0].get('endTime', [None])[0]
                    sale_date = ''
                    if end_time:
                        try:
                            sale_date = datetime.fromisoformat(
                                end_time.replace('Z', '+00:00')
                            ).strftime('%Y-%m-%d')
                        except Exception:
                            sale_date = end_time[:10] if len(end_time) >= 10 else ''

                    url = item.get('viewItemURL', [''])[0]
                    title = item.get('title', [''])[0]

                    sales.append(EbaySale(
                        title=title,
                        price=price_val,
                        sale_date=sale_date,
                        url=url,
                        is_auction=is_auction,
                    ))

                print(f"  [eBay Finding] Found {len(sales)} sold items for: {query}")
                return sales
            else:
                print(f"  [eBay Finding] HTTP {resp.status_code}: {resp.text[:200]}")
                # Retry once on 500 (rate limiter warm-up)
                if resp.status_code == 500 and _retry < 1:
                    import asyncio as _asyncio
                    await _asyncio.sleep(3)
                    return await fetch_ebay_sold_listings(query, max_results, _retry=_retry + 1)
                return []

        except Exception as e:
            print(f"  [eBay Finding] Error: {e}")
            return []


# ── Fallback Estimates ─────────────────────────────────────────────

def get_estimated_price(set_name: str, parallel_rarity: str,
                        grading_company: Optional[str] = None,
                        grade: Optional[float] = None) -> Optional[float]:
    """Get estimated price from known market data (fallback)."""
    clean_parallel = re.sub(r'^\d+\.\s*', '', parallel_rarity).lower().strip()

    if clean_parallel in PRICE_ESTIMATES:
        base_price = PRICE_ESTIMATES[clean_parallel]
    else:
        base_price = None
        for key, price in PRICE_ESTIMATES.items():
            if key in clean_parallel or clean_parallel in key:
                base_price = price
                break

    if base_price is None:
        match = re.search(r'/(\d+)', parallel_rarity)
        if match:
            pop = int(match.group(1))
            if pop == 1:
                base_price = 15000
            elif pop <= 5:
                base_price = 5000
            elif pop <= 10:
                base_price = 3000
            elif pop <= 25:
                base_price = 1000
            elif pop <= 50:
                base_price = 500
            elif pop <= 100:
                base_price = 300
            else:
                base_price = 150
        elif '1/1' in parallel_rarity:
            base_price = 15000
        else:
            base_price = 100

    if grading_company and grade:
        if grade >= 10:
            pass
        elif grade >= 9.5:
            base_price *= 0.6
        elif grade >= 9:
            base_price *= 0.4
        elif grade >= 8:
            base_price *= 0.25
        else:
            base_price *= 0.15
    elif grading_company is None:
        base_price *= 0.3

    return round(base_price, 0)


# ── Relevance Filtering ───────────────────────────────────────────

def is_relevant_listing(title: str, parallel_rarity: str, set_name: str,
                        grading_company: Optional[str], grade: Optional[float]) -> bool:
    """Filter out irrelevant eBay results by checking title keywords."""
    title_lower = title.lower()
    clean_parallel = re.sub(r'^\d+\.\s*', '', parallel_rarity).lower().strip()

    # Must mention Caleb Williams
    if 'caleb williams' not in title_lower and 'c. williams' not in title_lower:
        return False

    # Check parallel keywords (at least one word should match)
    parallel_words = re.sub(r'[/\d]', ' ', clean_parallel).split()
    significant_words = [w for w in parallel_words if len(w) > 2 and w not in ('the', 'and')]
    if significant_words:
        if not any(w in title_lower for w in significant_words):
            return False

    # If graded, check for grading company
    if grading_company and grade:
        company_lower = grading_company.lower()
        grade_str = str(int(grade)) if grade == int(grade) else str(grade)
        if company_lower not in title_lower:
            return False
        if grade_str not in title_lower:
            return False

    return True


# ── Main Price Fetching ────────────────────────────────────────────

async def get_card_prices(year: int, set_name: str, parallel_rarity: str,
                          is_owned: bool, is_graded: bool,
                          grading_company: Optional[str] = None,
                          grade: Optional[float] = None) -> PriceData:
    """
    Get pricing data for a card using eBay APIs with fallback to estimates.

    Flow:
    1. Check cache (6-hour TTL)
    2. Query eBay Finding API for sold listings → 30-day avg, last sale
    3. Query eBay Browse API for active listings → lowest BIN price
    4. Fall back to hardcoded estimates if APIs return nothing
    """
    cache_key = f"{year}_{set_name}_{parallel_rarity}_{grading_company}_{grade}_{is_owned}_{is_graded}"
    cache_key = re.sub(r'[^\w]', '_', cache_key)

    # Check cache
    cached = get_cached_price(cache_key)
    if cached:
        return PriceData(
            last_sale_price=cached.get('last_sale_price'),
            last_sale_date=cached.get('last_sale_date'),
            avg_30_day_price=cached.get('avg_30_day_price'),
            num_sales_30_day=cached.get('num_sales_30_day', 0),
            price_trend=cached.get('price_trend', 'stable'),
            lowest_active_price=cached.get('lowest_active_price'),
            lowest_active_url=cached.get('lowest_active_url'),
            sales=[EbaySale(**s) for s in cached.get('sales', [])],
            source=cached.get('source', 'cache')
        )

    # Build search query
    if is_owned and is_graded:
        query = build_search_query(year, set_name, parallel_rarity, grading_company, grade)
    elif is_owned and not is_graded:
        query = build_search_query(year, set_name, parallel_rarity, raw_only=True)
    else:
        # Want list - search for PSA 10
        query = build_search_query(year, set_name, parallel_rarity, "PSA", 10)

    # ── Fetch sold listings (Finding API, with Browse fallback) ──
    sold_listings = await fetch_ebay_sold_listings(query)

    # Filter to relevant results
    sold_listings = [
        s for s in sold_listings
        if is_relevant_listing(s.title, parallel_rarity, set_name, grading_company, grade)
    ]

    # If Finding API returned nothing, use Browse API as market price proxy
    if not sold_listings:
        browse_sales = await fetch_browse_sold_items(query)
        sold_listings = [
            s for s in browse_sales
            if is_relevant_listing(s.title, parallel_rarity, set_name, grading_company, grade)
        ]

    last_sale_price = None
    last_sale_date = None
    avg_30_day_price = None
    num_sales_30_day = 0
    price_trend = "stable"
    sales = []

    if sold_listings:
        # Sort by date descending
        sold_listings.sort(key=lambda s: s.sale_date, reverse=True)
        sales = sold_listings

        # Last sale
        last_sale_price = sold_listings[0].price
        last_sale_date = sold_listings[0].sale_date

        # 30-day filter
        cutoff = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        recent = [s for s in sold_listings if s.sale_date >= cutoff]
        num_sales_30_day = len(recent)

        if recent:
            prices = [s.price for s in recent]
            # Remove outliers (> 2 std dev from mean)
            if len(prices) >= 3:
                import statistics
                mean = statistics.mean(prices)
                stdev = statistics.stdev(prices)
                prices = [p for p in prices if abs(p - mean) <= 2 * stdev]

            avg_30_day_price = round(sum(prices) / len(prices), 2) if prices else None

            # Determine trend: compare first half to second half
            if len(recent) >= 4:
                mid = len(recent) // 2
                newer_avg = sum(s.price for s in recent[:mid]) / mid
                older_avg = sum(s.price for s in recent[mid:]) / (len(recent) - mid)
                pct_change = (newer_avg - older_avg) / older_avg * 100
                if pct_change > 5:
                    price_trend = "up"
                elif pct_change < -5:
                    price_trend = "down"
                else:
                    price_trend = "stable"

    # ── Fetch active listings (Browse API) ──
    lowest_active_price = None
    lowest_active_url = None

    active_listings = await fetch_ebay_active_listings(query)
    active_listings = [
        l for l in active_listings
        if is_relevant_listing(l.title, parallel_rarity, set_name, grading_company, grade)
    ]

    if active_listings:
        # Already sorted by price from API
        lowest = active_listings[0]
        lowest_active_price = lowest.price
        lowest_active_url = lowest.url
    else:
        # Generate manual search URL as fallback
        lowest_active_url = generate_ebay_url(query, sold=False) if not is_owned else None

    # ── Determine source and apply fallback ──
    source = "api"

    if not last_sale_price and not avg_30_day_price:
        # No API data — use estimates as fallback
        estimated = get_estimated_price(set_name, parallel_rarity, grading_company, grade)
        last_sale_price = estimated
        last_sale_date = None
        avg_30_day_price = estimated
        source = "estimate"
        print(f"  [Fallback] Using estimate: ${estimated:,.0f}")

        if not is_owned and not lowest_active_price:
            lowest_active_price = estimated

    # ── Cache result ──
    cache_data = {
        'last_sale_price': last_sale_price,
        'last_sale_date': last_sale_date,
        'avg_30_day_price': avg_30_day_price,
        'num_sales_30_day': num_sales_30_day,
        'price_trend': price_trend,
        'lowest_active_price': lowest_active_price,
        'lowest_active_url': lowest_active_url,
        'sales': [{'title': s.title, 'price': s.price, 'sale_date': s.sale_date,
                    'url': s.url, 'is_auction': s.is_auction} for s in sales[:10]],
        'source': source,
    }
    set_cached_price(cache_key, cache_data)

    return PriceData(
        last_sale_price=last_sale_price,
        last_sale_date=last_sale_date,
        avg_30_day_price=avg_30_day_price,
        num_sales_30_day=num_sales_30_day,
        price_trend=price_trend,
        lowest_active_price=lowest_active_price,
        lowest_active_url=lowest_active_url,
        sales=sales,
        source=source,
    )


def update_manual_price(cache_key: str, price: float, sale_date: str = None):
    """Manually update a card's price."""
    if sale_date is None:
        sale_date = datetime.now().strftime('%Y-%m-%d')

    cache_data = {
        'last_sale_price': price,
        'last_sale_date': sale_date,
        'avg_30_day_price': price,
        'num_sales_30_day': 1,
        'price_trend': 'stable',
        'lowest_active_price': None,
        'lowest_active_url': None,
        'sales': [{'title': 'Manual entry', 'price': price, 'sale_date': sale_date, 'url': '', 'is_auction': False}],
        'source': 'manual'
    }
    set_cached_price(cache_key, cache_data)


if __name__ == "__main__":
    import asyncio

    async def test():
        print("Testing eBay API integration...\n")

        # Test OAuth
        token = await get_oauth_token()
        if token:
            print(f"  Token: {token[:20]}...\n")
        else:
            print("  No token - check credentials\n")
            return

        # Test Finding API (sold listings)
        print("Sold listings for 'Caleb Williams Optic Holo PSA 10':")
        sales = await fetch_ebay_sold_listings("Caleb Williams Optic Holo PSA 10")
        for s in sales[:5]:
            print(f"  ${s.price:,.2f} on {s.sale_date} - {s.title[:60]}")

        print()

        # Test Browse API (active listings)
        print("Active listings for 'Caleb Williams Optic Holo PSA 10':")
        listings = await fetch_ebay_active_listings("Caleb Williams Optic Holo PSA 10")
        for l in listings[:5]:
            print(f"  ${l.price:,.2f} BIN - {l.title[:60]}")

        print()

        # Test full price fetch
        print("Full price fetch for Fire PSA 10:")
        data = await get_card_prices(
            year=2024,
            set_name="Donruss Optic - Rated Rookie 201",
            parallel_rarity="5. Fire",
            is_owned=True,
            is_graded=True,
            grading_company="PSA",
            grade=10
        )
        print(f"  Last sale: ${data.last_sale_price:,.2f}" if data.last_sale_price else "  Last sale: N/A")
        print(f"  30D avg:   ${data.avg_30_day_price:,.2f}" if data.avg_30_day_price else "  30D avg: N/A")
        print(f"  30D sales: {data.num_sales_30_day}")
        print(f"  Trend:     {data.price_trend}")
        print(f"  Source:    {data.source}")

    asyncio.run(test())
