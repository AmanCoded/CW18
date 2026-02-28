"""
Database models and setup for Caleb Williams Card Collection
Supports both SQLite (local) and PostgreSQL (production)
"""
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass

# Check for PostgreSQL
DATABASE_URL = os.environ.get('DATABASE_URL')

if DATABASE_URL:
    # PostgreSQL (production)
    import psycopg2
    from psycopg2.extras import RealDictCursor

    # Fix for Render's postgres:// vs postgresql://
    if DATABASE_URL.startswith('postgres://'):
        DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

    USE_POSTGRES = True
else:
    # SQLite (local development)
    import sqlite3
    USE_POSTGRES = False
    DB_PATH = Path(__file__).parent.parent / "data" / "cards.db"


@dataclass
class Card:
    id: Optional[int]
    year: int
    set_name: str
    parallel_rarity: str
    serial_number: Optional[str]
    population: Optional[int]
    date_acquired: Optional[str]
    is_graded: bool
    grading_company: Optional[str]
    grade: Optional[float]
    cost_basis: Optional[float]
    authenticity_guaranteed: bool
    is_owned: bool

    # Sort order for manual reordering
    sort_order: int = 0

    # Price data (fetched from eBay)
    last_sale_price: Optional[float] = None
    last_sale_date: Optional[str] = None
    avg_30_day_price: Optional[float] = None
    num_sales_30_day: Optional[int] = None
    price_trend: Optional[str] = None  # "up", "down", "stable"
    lowest_active_price: Optional[float] = None
    lowest_active_url: Optional[str] = None
    estimated_value: Optional[float] = None
    last_price_update: Optional[str] = None


def get_connection():
    """Get database connection"""
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    else:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def init_db():
    """Initialize database schema"""
    conn = get_connection()
    cursor = conn.cursor()

    if USE_POSTGRES:
        # PostgreSQL schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cards (
                id SERIAL PRIMARY KEY,
                year INTEGER NOT NULL,
                set_name TEXT NOT NULL,
                parallel_rarity TEXT NOT NULL,
                serial_number TEXT,
                population INTEGER,
                date_acquired TEXT,
                is_graded BOOLEAN NOT NULL DEFAULT FALSE,
                grading_company TEXT,
                grade REAL,
                cost_basis REAL,
                authenticity_guaranteed BOOLEAN NOT NULL DEFAULT FALSE,
                is_owned BOOLEAN NOT NULL DEFAULT FALSE,
                last_sale_price REAL,
                last_sale_date TEXT,
                avg_30_day_price REAL,
                num_sales_30_day INTEGER,
                price_trend TEXT,
                lowest_active_price REAL,
                lowest_active_url TEXT,
                estimated_value REAL,
                last_price_update TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(year, set_name, parallel_rarity, grading_company, grade)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS price_history (
                id SERIAL PRIMARY KEY,
                card_id INTEGER NOT NULL,
                price REAL NOT NULL,
                sale_date TEXT NOT NULL,
                source TEXT DEFAULT 'ebay',
                url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (card_id) REFERENCES cards(id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                id SERIAL PRIMARY KEY,
                total_cost_basis REAL NOT NULL,
                total_estimated_value REAL NOT NULL,
                snapshot_date TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notable_sales (
                id SERIAL PRIMARY KEY,
                card_description TEXT NOT NULL,
                price REAL NOT NULL,
                sale_date TEXT NOT NULL,
                platform TEXT DEFAULT 'eBay',
                url TEXT,
                set_name TEXT,
                parallel_type TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        # SQLite schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                year INTEGER NOT NULL,
                set_name TEXT NOT NULL,
                parallel_rarity TEXT NOT NULL,
                serial_number TEXT,
                population INTEGER,
                date_acquired TEXT,
                is_graded BOOLEAN NOT NULL DEFAULT 0,
                grading_company TEXT,
                grade REAL,
                cost_basis REAL,
                authenticity_guaranteed BOOLEAN NOT NULL DEFAULT 0,
                is_owned BOOLEAN NOT NULL DEFAULT 0,
                last_sale_price REAL,
                last_sale_date TEXT,
                avg_30_day_price REAL,
                num_sales_30_day INTEGER,
                price_trend TEXT,
                lowest_active_price REAL,
                lowest_active_url TEXT,
                estimated_value REAL,
                last_price_update TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(year, set_name, parallel_rarity, grading_company, grade)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                card_id INTEGER NOT NULL,
                price REAL NOT NULL,
                sale_date TEXT NOT NULL,
                source TEXT DEFAULT 'ebay',
                url TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (card_id) REFERENCES cards(id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_cost_basis REAL NOT NULL,
                total_estimated_value REAL NOT NULL,
                snapshot_date TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notable_sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                card_description TEXT NOT NULL,
                price REAL NOT NULL,
                sale_date TEXT NOT NULL,
                platform TEXT DEFAULT 'eBay',
                url TEXT,
                set_name TEXT,
                parallel_type TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

    # Migration: add sort_order column if it doesn't exist
    try:
        if USE_POSTGRES:
            cursor.execute("ALTER TABLE cards ADD COLUMN sort_order INTEGER DEFAULT 0")
        else:
            cursor.execute("ALTER TABLE cards ADD COLUMN sort_order INTEGER DEFAULT 0")
    except Exception:
        pass  # Column already exists

    conn.commit()
    conn.close()
    print(f"Database initialized ({'PostgreSQL' if USE_POSTGRES else 'SQLite'})")


def parse_population(parallel_rarity: str) -> tuple[Optional[str], Optional[int]]:
    """Extract serial number and population from parallel name"""
    match = re.search(r'(\d+)?/(\d+)', parallel_rarity)
    if match:
        serial = match.group(0)
        pop = int(match.group(2))
        return serial, pop

    if parallel_rarity.strip().endswith('1/1'):
        return "1/1", 1

    return None, None


def _row_to_card(row) -> Card:
    """Convert a database row to a Card object"""
    if USE_POSTGRES:
        return Card(
            id=row['id'],
            year=row['year'],
            set_name=row['set_name'],
            parallel_rarity=row['parallel_rarity'],
            serial_number=row['serial_number'],
            population=row['population'],
            date_acquired=row['date_acquired'],
            is_graded=bool(row['is_graded']),
            grading_company=row['grading_company'],
            grade=row['grade'],
            cost_basis=row['cost_basis'],
            authenticity_guaranteed=bool(row['authenticity_guaranteed']),
            is_owned=bool(row['is_owned']),
            sort_order=row.get('sort_order', 0) or 0,
            last_sale_price=row['last_sale_price'],
            last_sale_date=row['last_sale_date'],
            avg_30_day_price=row['avg_30_day_price'],
            num_sales_30_day=row['num_sales_30_day'],
            price_trend=row['price_trend'],
            lowest_active_price=row['lowest_active_price'],
            lowest_active_url=row['lowest_active_url'],
            estimated_value=row['estimated_value'],
            last_price_update=row['last_price_update']
        )
    else:
        # SQLite Row doesn't have .get(), use try/except
        try:
            sort_order = row['sort_order'] or 0
        except (IndexError, KeyError):
            sort_order = 0
        return Card(
            id=row['id'],
            year=row['year'],
            set_name=row['set_name'],
            parallel_rarity=row['parallel_rarity'],
            serial_number=row['serial_number'],
            population=row['population'],
            date_acquired=row['date_acquired'],
            is_graded=bool(row['is_graded']),
            grading_company=row['grading_company'],
            grade=row['grade'],
            cost_basis=row['cost_basis'],
            authenticity_guaranteed=bool(row['authenticity_guaranteed']),
            is_owned=bool(row['is_owned']),
            sort_order=sort_order,
            last_sale_price=row['last_sale_price'],
            last_sale_date=row['last_sale_date'],
            avg_30_day_price=row['avg_30_day_price'],
            num_sales_30_day=row['num_sales_30_day'],
            price_trend=row['price_trend'],
            lowest_active_price=row['lowest_active_price'],
            lowest_active_url=row['lowest_active_url'],
            estimated_value=row['estimated_value'],
            last_price_update=row['last_price_update']
        )


def insert_card(card: Card) -> int:
    """Insert a card into the database"""
    conn = get_connection()
    cursor = conn.cursor()

    if USE_POSTGRES:
        cursor.execute("""
            INSERT INTO cards (
                year, set_name, parallel_rarity, serial_number, population,
                date_acquired, is_graded, grading_company, grade, cost_basis,
                authenticity_guaranteed, is_owned
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (year, set_name, parallel_rarity, grading_company, grade)
            DO UPDATE SET
                serial_number = EXCLUDED.serial_number,
                population = EXCLUDED.population,
                date_acquired = EXCLUDED.date_acquired,
                cost_basis = EXCLUDED.cost_basis,
                authenticity_guaranteed = EXCLUDED.authenticity_guaranteed,
                is_owned = EXCLUDED.is_owned,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        """, (
            card.year, card.set_name, card.parallel_rarity, card.serial_number,
            card.population, card.date_acquired, card.is_graded, card.grading_company,
            card.grade, card.cost_basis, card.authenticity_guaranteed, card.is_owned
        ))
        card_id = cursor.fetchone()[0]
    else:
        cursor.execute("""
            INSERT OR REPLACE INTO cards (
                year, set_name, parallel_rarity, serial_number, population,
                date_acquired, is_graded, grading_company, grade, cost_basis,
                authenticity_guaranteed, is_owned
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            card.year, card.set_name, card.parallel_rarity, card.serial_number,
            card.population, card.date_acquired, card.is_graded, card.grading_company,
            card.grade, card.cost_basis, card.authenticity_guaranteed, card.is_owned
        ))
        card_id = cursor.lastrowid

    conn.commit()
    conn.close()
    return card_id


def get_all_cards() -> List[Card]:
    """Get all cards from database"""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
    else:
        cursor = conn.cursor()

    cursor.execute("SELECT * FROM cards ORDER BY is_owned DESC, sort_order ASC, set_name, parallel_rarity")
    rows = cursor.fetchall()
    conn.close()

    return [_row_to_card(row) for row in rows]


def get_owned_cards() -> List[Card]:
    """Get only owned cards"""
    return [c for c in get_all_cards() if c.is_owned]


def get_want_list() -> List[Card]:
    """Get only want list cards"""
    return [c for c in get_all_cards() if not c.is_owned]


def update_card_prices(card_id: int, **kwargs):
    """Update price fields for a card"""
    conn = get_connection()
    cursor = conn.cursor()

    if USE_POSTGRES:
        set_clauses = []
        values = []
        for i, (key, value) in enumerate(kwargs.items(), 1):
            set_clauses.append(f"{key} = %s")
            values.append(value)

        values.append(datetime.now().isoformat())
        values.append(card_id)

        cursor.execute(f"""
            UPDATE cards
            SET {', '.join(set_clauses)}, last_price_update = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, values)
    else:
        set_clauses = []
        values = []
        for key, value in kwargs.items():
            set_clauses.append(f"{key} = ?")
            values.append(value)

        values.append(datetime.now().isoformat())
        values.append(card_id)

        cursor.execute(f"""
            UPDATE cards
            SET {', '.join(set_clauses)}, last_price_update = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, values)

    conn.commit()
    conn.close()


def add_portfolio_snapshot(cost_basis: float, estimated_value: float):
    """Record a portfolio snapshot for historical tracking"""
    conn = get_connection()
    cursor = conn.cursor()

    if USE_POSTGRES:
        cursor.execute("""
            INSERT INTO portfolio_snapshots (total_cost_basis, total_estimated_value, snapshot_date)
            VALUES (%s, %s, %s)
        """, (cost_basis, estimated_value, datetime.now().date().isoformat()))
    else:
        cursor.execute("""
            INSERT INTO portfolio_snapshots (total_cost_basis, total_estimated_value, snapshot_date)
            VALUES (?, ?, ?)
        """, (cost_basis, estimated_value, datetime.now().date().isoformat()))

    conn.commit()
    conn.close()


def get_portfolio_history(days: int = 90) -> List[dict]:
    """Get portfolio value history"""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT snapshot_date, total_cost_basis, total_estimated_value
            FROM portfolio_snapshots
            WHERE snapshot_date >= CURRENT_DATE - INTERVAL '%s days'
            ORDER BY snapshot_date
        """, (days,))
    else:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT snapshot_date, total_cost_basis, total_estimated_value
            FROM portfolio_snapshots
            WHERE snapshot_date >= date('now', ?)
            ORDER BY snapshot_date
        """, (f'-{days} days',))

    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def add_notable_sale(card_description: str, price: float, sale_date: str,
                     url: str = None, set_name: str = None, parallel_type: str = None):
    """Record a notable sale"""
    conn = get_connection()
    cursor = conn.cursor()

    if USE_POSTGRES:
        cursor.execute("""
            INSERT INTO notable_sales (card_description, price, sale_date, url, set_name, parallel_type)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (card_description, price, sale_date, url, set_name, parallel_type))
    else:
        cursor.execute("""
            INSERT INTO notable_sales (card_description, price, sale_date, url, set_name, parallel_type)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (card_description, price, sale_date, url, set_name, parallel_type))

    conn.commit()
    conn.close()


def get_notable_sales(limit: int = 50) -> List[dict]:
    """Get recent notable sales"""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT * FROM notable_sales
            ORDER BY sale_date DESC
            LIMIT %s
        """, (limit,))
    else:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM notable_sales
            ORDER BY sale_date DESC
            LIMIT ?
        """, (limit,))

    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def update_card(card_id: int, **kwargs):
    """Update any card fields"""
    conn = get_connection()
    cursor = conn.cursor()

    if USE_POSTGRES:
        set_clauses = []
        values = []
        for key, value in kwargs.items():
            set_clauses.append(f"{key} = %s")
            values.append(value)

        values.append(card_id)

        cursor.execute(f"""
            UPDATE cards
            SET {', '.join(set_clauses)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, values)
    else:
        set_clauses = []
        values = []
        for key, value in kwargs.items():
            set_clauses.append(f"{key} = ?")
            values.append(value)

        values.append(card_id)

        cursor.execute(f"""
            UPDATE cards
            SET {', '.join(set_clauses)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, values)

    conn.commit()
    conn.close()


def delete_card(card_id: int):
    """Delete a card"""
    conn = get_connection()
    cursor = conn.cursor()

    if USE_POSTGRES:
        cursor.execute("DELETE FROM cards WHERE id = %s", (card_id,))
    else:
        cursor.execute("DELETE FROM cards WHERE id = ?", (card_id,))

    conn.commit()
    conn.close()


def clear_all_cards():
    """Clear all cards from database (used before import)"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cards")
    conn.commit()
    conn.close()


def reorder_cards(order: List[dict]):
    """Update sort_order for multiple cards. Each dict has card_id and sort_order."""
    conn = get_connection()
    cursor = conn.cursor()

    for item in order:
        if USE_POSTGRES:
            cursor.execute(
                "UPDATE cards SET sort_order = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                (item['sort_order'], item['card_id'])
            )
        else:
            cursor.execute(
                "UPDATE cards SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (item['sort_order'], item['card_id'])
            )

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("Database schema created successfully!")
