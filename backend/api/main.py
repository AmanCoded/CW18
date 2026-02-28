"""
FastAPI Backend for Caleb Williams Card Dashboard
"""
from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
from collections import defaultdict
import asyncio
import csv
import io
import sys
from pathlib import Path

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "scrapers"))

from database import (
    init_db, get_all_cards, get_owned_cards, get_want_list,
    insert_card, update_card, delete_card, update_card_prices,
    add_portfolio_snapshot, get_portfolio_history, get_notable_sales,
    add_notable_sale, reorder_cards, Card, parse_population
)

app = FastAPI(
    title="Caleb Williams Card Dashboard API",
    description="Portfolio tracker for Caleb Williams rookie card collection",
    version="1.0.0"
)

# CORS for frontend
import os
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", FRONTEND_URL, "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic models
class CardCreate(BaseModel):
    year: int
    set_name: str
    parallel_rarity: str
    date_acquired: Optional[str] = None
    is_graded: bool = False
    grading_company: Optional[str] = None
    grade: Optional[float] = None
    cost_basis: Optional[float] = None
    authenticity_guaranteed: bool = False


class CardUpdate(BaseModel):
    year: Optional[int] = None
    set_name: Optional[str] = None
    parallel_rarity: Optional[str] = None
    date_acquired: Optional[str] = None
    is_graded: Optional[bool] = None
    grading_company: Optional[str] = None
    grade: Optional[float] = None
    cost_basis: Optional[float] = None
    authenticity_guaranteed: Optional[bool] = None


class PortfolioSummary(BaseModel):
    total_cost_basis: float
    total_estimated_value: float
    net_appreciation_dollars: float
    net_appreciation_percent: float
    owned_count: int
    want_list_count: int
    last_updated: Optional[str]


class RecentSale(BaseModel):
    price: float
    date: str
    url: str
    title: str


# Track refresh status
refresh_status = {"running": False, "progress": 0, "total": 0, "current_card": ""}


# Initialize database on startup
@app.on_event("startup")
async def startup():
    init_db()


# Health check
@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


# Portfolio Summary
@app.get("/api/portfolio/summary", response_model=PortfolioSummary)
async def get_portfolio_summary():
    """Get portfolio KPIs"""
    owned = get_owned_cards()
    want_list = get_want_list()

    total_cost = sum(c.cost_basis or 0 for c in owned)

    # Use estimated_value if available, otherwise fall back to cost_basis
    total_value = sum(
        c.estimated_value if c.estimated_value else (c.cost_basis or 0)
        for c in owned
    )

    net_dollars = total_value - total_cost
    net_percent = (net_dollars / total_cost * 100) if total_cost > 0 else 0

    # Find most recent price update
    last_updated = None
    for card in owned:
        if card.last_price_update:
            if not last_updated or card.last_price_update > last_updated:
                last_updated = card.last_price_update

    return PortfolioSummary(
        total_cost_basis=total_cost,
        total_estimated_value=total_value,
        net_appreciation_dollars=net_dollars,
        net_appreciation_percent=net_percent,
        owned_count=len(owned),
        want_list_count=len(want_list),
        last_updated=last_updated
    )


# Portfolio History - Generate from acquisition dates
@app.get("/api/portfolio/history")
async def get_history(days: int = 90):
    """Get portfolio value history for chart - generated from acquisition dates"""
    owned = get_owned_cards()

    if not owned:
        return []

    # Build history from acquisition dates
    # Group cards by acquisition date
    date_acquisitions = defaultdict(list)
    for card in owned:
        if card.date_acquired:
            date_acquisitions[card.date_acquired].append(card)

    if not date_acquisitions:
        return []

    # Sort dates
    sorted_dates = sorted(date_acquisitions.keys())

    # Build cumulative portfolio history
    history = []
    cumulative_cost = 0
    cumulative_value = 0

    for date in sorted_dates:
        cards_on_date = date_acquisitions[date]
        for card in cards_on_date:
            cumulative_cost += card.cost_basis or 0
            cumulative_value += card.estimated_value if card.estimated_value else (card.cost_basis or 0)

        history.append({
            'snapshot_date': date,
            'total_cost_basis': cumulative_cost,
            'total_estimated_value': cumulative_value
        })

    # Add today's data point if different from last
    today = datetime.now().strftime('%Y-%m-%d')
    if history and history[-1]['snapshot_date'] != today:
        # Recalculate current values
        total_cost = sum(c.cost_basis or 0 for c in owned)
        total_value = sum(
            c.estimated_value if c.estimated_value else (c.cost_basis or 0)
            for c in owned
        )
        history.append({
            'snapshot_date': today,
            'total_cost_basis': total_cost,
            'total_estimated_value': total_value
        })

    # Filter to requested time range
    cutoff = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
    history = [h for h in history if h['snapshot_date'] >= cutoff]

    return history


# Cards endpoints
@app.get("/api/cards")
async def list_cards():
    """Get all cards with recent sales data"""
    cards = get_all_cards()
    result = []
    for card in cards:
        card_dict = card.__dict__.copy()
        # Add eBay search URLs for convenience
        card_dict['ebay_sold_url'] = generate_ebay_url(card, sold=True)
        card_dict['ebay_active_url'] = generate_ebay_url(card, sold=False)
        result.append(card_dict)
    return result


@app.get("/api/cards/owned")
async def list_owned_cards():
    """Get owned cards only"""
    cards = get_owned_cards()
    result = []
    for card in cards:
        card_dict = card.__dict__.copy()
        card_dict['ebay_sold_url'] = generate_ebay_url(card, sold=True)
        card_dict['ebay_active_url'] = generate_ebay_url(card, sold=False)
        result.append(card_dict)
    return result


@app.get("/api/cards/wantlist")
async def list_want_list():
    """Get want list cards"""
    cards = get_want_list()
    result = []
    for card in cards:
        card_dict = card.__dict__.copy()
        card_dict['ebay_sold_url'] = generate_ebay_url(card, sold=True)
        card_dict['ebay_active_url'] = generate_ebay_url(card, sold=False)
        result.append(card_dict)
    return result


def generate_ebay_url(card: Card, sold: bool = True) -> str:
    """Generate eBay search URL for a card"""
    import urllib.parse
    import re

    parts = ["Caleb Williams"]

    # Simplify set name
    set_lower = card.set_name.lower()
    if "donruss optic" in set_lower:
        parts.append("Donruss Optic")
    elif "national treasures" in set_lower:
        parts.append("National Treasures")
    elif "topps finest" in set_lower:
        parts.append("Topps Finest")
    elif "kaboom" in card.parallel_rarity.lower() or "panini absolute" in set_lower:
        parts.append("Kaboom")
    elif "immaculate" in set_lower:
        parts.append("Immaculate")
    else:
        parts.append(card.set_name.split(' - ')[0])

    # Add parallel info
    clean_parallel = re.sub(r'^\d+\.\s*', '', card.parallel_rarity)
    if '1/1' in card.parallel_rarity:
        clean_parallel = clean_parallel.replace('1/1', '').strip()
        if clean_parallel:
            parts.append(clean_parallel)
        parts.append("1/1")
    else:
        clean_parallel = re.sub(r'/\d+', '', clean_parallel).strip()
        if clean_parallel and clean_parallel.lower() != 'base':
            parts.append(clean_parallel)

    # Add grade for graded cards
    if card.is_graded and card.grading_company and card.grade:
        parts.append(f"{card.grading_company} {int(card.grade) if card.grade == int(card.grade) else card.grade}")

    query = " ".join(parts)
    encoded = urllib.parse.quote_plus(query)

    if sold:
        return f"https://www.ebay.com/sch/i.html?_nkw={encoded}&LH_Complete=1&LH_Sold=1&_sop=13"
    else:
        return f"https://www.ebay.com/sch/i.html?_nkw={encoded}&_sop=15&LH_BIN=1"


@app.post("/api/cards")
async def create_card(card: CardCreate):
    """Add a new card"""
    serial, population = parse_population(card.parallel_rarity)
    is_owned = card.date_acquired is not None

    new_card = Card(
        id=None,
        year=card.year,
        set_name=card.set_name,
        parallel_rarity=card.parallel_rarity,
        serial_number=serial,
        population=population,
        date_acquired=card.date_acquired,
        is_graded=card.is_graded,
        grading_company=card.grading_company,
        grade=card.grade,
        cost_basis=card.cost_basis,
        authenticity_guaranteed=card.authenticity_guaranteed,
        is_owned=is_owned
    )

    card_id = insert_card(new_card)
    return {"id": card_id, "message": "Card created successfully"}


@app.put("/api/cards/{card_id}")
async def update_card_endpoint(card_id: int, card_update: CardUpdate):
    """Update a card"""
    updates = {k: v for k, v in card_update.dict().items() if v is not None}
    if 'date_acquired' in updates:
        updates['is_owned'] = updates['date_acquired'] is not None
    # Re-parse population if parallel_rarity changed
    if 'parallel_rarity' in updates:
        serial, population = parse_population(updates['parallel_rarity'])
        updates['serial_number'] = serial
        updates['population'] = population
    update_card(card_id, **updates)
    return {"message": "Card updated successfully"}


@app.delete("/api/cards/{card_id}")
async def delete_card_endpoint(card_id: int):
    """Delete a card"""
    delete_card(card_id)
    return {"message": "Card deleted successfully"}


class ReorderItem(BaseModel):
    card_id: int
    sort_order: int

class ReorderRequest(BaseModel):
    order: List[ReorderItem]

@app.put("/api/cards/reorder")
async def reorder_cards_endpoint(request: ReorderRequest):
    """Update sort order for cards"""
    reorder_cards([item.dict() for item in request.order])
    return {"message": "Cards reordered successfully"}


@app.post("/api/cards/{card_id}/acquire")
async def acquire_card(card_id: int, date_acquired: str, cost_basis: float):
    """Mark a want list card as acquired"""
    update_card(card_id, date_acquired=date_acquired, cost_basis=cost_basis, is_owned=True)
    return {"message": "Card marked as acquired"}


# Pricing endpoints
@app.get("/api/prices/status")
async def get_refresh_status():
    """Get current refresh status"""
    return refresh_status


@app.post("/api/prices/refresh")
async def refresh_all_prices(background_tasks: BackgroundTasks):
    """Refresh prices for all cards (runs in background)"""
    if refresh_status["running"]:
        return {"message": "Refresh already in progress", "status": refresh_status}

    background_tasks.add_task(refresh_prices_task)
    return {"message": "Price refresh started", "status": "running"}


async def refresh_prices_task():
    """Background task to refresh all card prices"""
    global refresh_status

    # Import here to avoid circular imports
    from ebay_scraper import get_card_prices
    from comp_engine import calculate_rare_card_value

    cards = get_all_cards()
    refresh_status["running"] = True
    refresh_status["progress"] = 0
    refresh_status["total"] = len(cards)

    for i, card in enumerate(cards):
        refresh_status["progress"] = i + 1
        refresh_status["current_card"] = f"{card.set_name} - {card.parallel_rarity}"

        try:
            print(f"\n[{i+1}/{len(cards)}] Fetching prices for: {card.parallel_rarity}")

            # Get prices from eBay
            price_data = await get_card_prices(
                year=card.year,
                set_name=card.set_name,
                parallel_rarity=card.parallel_rarity,
                is_owned=card.is_owned,
                is_graded=card.is_graded,
                grading_company=card.grading_company,
                grade=card.grade
            )

            # Determine estimated value
            estimated_value = None

            # For rare cards (population <= 25), use comp engine
            if card.population and card.population <= 25:
                try:
                    valuation = await calculate_rare_card_value(
                        year=card.year,
                        set_name=card.set_name,
                        parallel_rarity=card.parallel_rarity,
                        population=card.population
                    )
                    estimated_value = valuation.estimated_value
                except Exception as e:
                    print(f"Comp engine error: {e}")

            # Fall back to eBay data
            if not estimated_value:
                estimated_value = price_data.avg_30_day_price or price_data.last_sale_price

            # If still no value and owned, use cost basis
            if not estimated_value and card.is_owned:
                estimated_value = card.cost_basis

            # Update card with price data
            update_card_prices(
                card.id,
                last_sale_price=price_data.last_sale_price,
                last_sale_date=price_data.last_sale_date,
                avg_30_day_price=price_data.avg_30_day_price,
                num_sales_30_day=price_data.num_sales_30_day,
                price_trend=price_data.price_trend,
                lowest_active_price=price_data.lowest_active_price,
                lowest_active_url=price_data.lowest_active_url,
                estimated_value=estimated_value
            )

            # Rate limiting - wait between requests
            await asyncio.sleep(2)

        except Exception as e:
            print(f"Error refreshing price for card {card.id}: {e}")

    # Take a portfolio snapshot
    owned = get_owned_cards()
    total_cost = sum(c.cost_basis or 0 for c in owned)
    total_value = sum(c.estimated_value or c.cost_basis or 0 for c in owned)
    add_portfolio_snapshot(total_cost, total_value)

    refresh_status["running"] = False
    refresh_status["current_card"] = ""
    print("\nPrice refresh complete!")


@app.post("/api/prices/refresh/{card_id}")
async def refresh_single_card_price(card_id: int):
    """Refresh price for a single card"""
    from ebay_scraper import get_card_prices
    from comp_engine import calculate_rare_card_value

    cards = get_all_cards()
    card = next((c for c in cards if c.id == card_id), None)

    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    price_data = await get_card_prices(
        year=card.year,
        set_name=card.set_name,
        parallel_rarity=card.parallel_rarity,
        is_owned=card.is_owned,
        is_graded=card.is_graded,
        grading_company=card.grading_company,
        grade=card.grade
    )

    estimated_value = None

    # For rare cards, use comp engine
    if card.population and card.population <= 25:
        try:
            valuation = await calculate_rare_card_value(
                year=card.year,
                set_name=card.set_name,
                parallel_rarity=card.parallel_rarity,
                population=card.population
            )
            estimated_value = valuation.estimated_value
        except:
            pass

    if not estimated_value:
        estimated_value = price_data.avg_30_day_price or price_data.last_sale_price

    if not estimated_value and card.is_owned:
        estimated_value = card.cost_basis

    update_card_prices(
        card.id,
        last_sale_price=price_data.last_sale_price,
        last_sale_date=price_data.last_sale_date,
        avg_30_day_price=price_data.avg_30_day_price,
        num_sales_30_day=price_data.num_sales_30_day,
        price_trend=price_data.price_trend,
        lowest_active_price=price_data.lowest_active_price,
        lowest_active_url=price_data.lowest_active_url,
        estimated_value=estimated_value
    )

    return {
        "message": "Price refreshed",
        "estimated_value": estimated_value,
        "last_sale_price": price_data.last_sale_price,
        "avg_30_day_price": price_data.avg_30_day_price
    }


# Notable sales
@app.get("/api/notable-sales")
async def list_notable_sales(limit: int = 50):
    """Get recent notable sales"""
    return get_notable_sales(limit)


# Export
@app.get("/api/export/csv")
async def export_csv():
    """Export collection to CSV"""
    cards = get_all_cards()

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        'Year', 'Set', 'Parallel/Rarity', 'Population', 'Date Acquired',
        'Graded', 'Grading Company', 'Grade', 'Cost Basis', 'Estimated Value',
        'P/L ($)', 'P/L (%)', '30-Day Avg', 'Status', 'eBay Search URL'
    ])

    for card in cards:
        pl_dollars = None
        pl_percent = None
        if card.is_owned and card.cost_basis:
            value = card.estimated_value or card.cost_basis
            pl_dollars = value - card.cost_basis
            pl_percent = (pl_dollars / card.cost_basis * 100) if card.cost_basis else None

        writer.writerow([
            card.year,
            card.set_name,
            card.parallel_rarity,
            card.population,
            card.date_acquired,
            'Yes' if card.is_graded else 'No',
            card.grading_company,
            card.grade,
            card.cost_basis,
            card.estimated_value,
            f"{pl_dollars:.2f}" if pl_dollars is not None else '',
            f"{pl_percent:.1f}%" if pl_percent is not None else '',
            card.avg_30_day_price,
            'Owned' if card.is_owned else 'Want List',
            generate_ebay_url(card, sold=True)
        ])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=caleb_williams_collection.csv"}
    )


# Import endpoint
@app.post("/api/import/excel")
async def import_excel_endpoint(file: UploadFile = File(...)):
    """Import cards from Excel file"""
    import pandas as pd
    from database import Card, insert_card, parse_population, get_connection

    # Clear existing cards
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cards")
    conn.commit()
    conn.close()

    # Read file content
    content = await file.read()

    # Save to temp file
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
        tmp.write(content)
        temp_path = tmp.name

    try:
        # Read Excel without headers first to find the header row
        df_raw = pd.read_excel(temp_path, header=None)

        # Find the header row (row containing 'Year')
        header_row = None
        for idx, row in df_raw.iterrows():
            row_values = [str(v) for v in row.values]
            if 'Year' in row_values:
                header_row = idx
                break

        if header_row is None:
            raise HTTPException(status_code=400, detail="Could not find header row with 'Year' column")

        # Re-read with correct header
        df = pd.read_excel(temp_path, header=header_row)

        # Clean column names
        df.columns = [str(col).strip() for col in df.columns]
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]

        owned_count = 0
        want_list_count = 0
        total_cost = 0.0

        for idx, row in df.iterrows():
            try:
                year = row.get('Year')
                if pd.isna(year) or year == 'Year':
                    continue

                year = int(year)
                set_name = str(row.get('Set', '')).strip()
                parallel_rarity = str(row.get('Rarity / Type', '')).strip()

                if not set_name or not parallel_rarity:
                    continue

                # Parse date acquired
                date_acquired = row.get('Date Acquired')
                if pd.isna(date_acquired):
                    date_acquired = None
                    is_owned = False
                else:
                    if isinstance(date_acquired, datetime):
                        date_acquired = date_acquired.strftime('%Y-%m-%d')
                    else:
                        date_acquired = str(date_acquired)
                    is_owned = True

                # Parse graded status
                graded_val = row.get('Graded?', '')
                is_graded = str(graded_val).strip() == '☑'

                # Grading company and grade
                grading_company = row.get('Grading Company')
                if pd.isna(grading_company):
                    grading_company = None
                else:
                    grading_company = str(grading_company).strip()

                grade = row.get('Grade')
                if pd.isna(grade):
                    grade = None
                else:
                    grade = float(grade)

                # Cost
                cost = row.get('Cost')
                if pd.isna(cost):
                    cost = None
                else:
                    cost = float(cost)
                    if is_owned:
                        total_cost += cost

                # Authenticity guaranteed
                auth_val = row.get('Authenticity Guaranteed?', '')
                authenticity_guaranteed = str(auth_val).strip() == '☑'

                # Parse population
                serial_number, population = parse_population(parallel_rarity)

                card = Card(
                    id=None,
                    year=year,
                    set_name=set_name,
                    parallel_rarity=parallel_rarity,
                    serial_number=serial_number,
                    population=population,
                    date_acquired=date_acquired,
                    is_graded=is_graded,
                    grading_company=grading_company,
                    grade=grade,
                    cost_basis=cost,
                    authenticity_guaranteed=authenticity_guaranteed,
                    is_owned=is_owned
                )

                insert_card(card)

                if is_owned:
                    owned_count += 1
                else:
                    want_list_count += 1

            except Exception as e:
                print(f"Row {idx} error: {e}")
                continue

        return {
            'owned_count': owned_count,
            'want_list_count': want_list_count,
            'total_cost_basis': total_cost,
            'message': f'Successfully imported {owned_count} owned cards and {want_list_count} want list cards'
        }
    finally:
        import os
        os.unlink(temp_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
