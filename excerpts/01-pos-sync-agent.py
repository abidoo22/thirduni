"""
DzVendeur POS Sync Agent - Offline Database Schema Scanner & Column Matcher
==========================================================================
What it does:
Inspects local offline cashier databases (SQLite, MS Access .accdb/.mdb, Firebird .fdb)
running on Algerian merchants' in-store Windows PCs. It automatically detects table
structures and heuristically matches columns for barcode, product name, and stock quantity.

Why it matters:
Many retail stores in Algeria manage inventory using legacy desktop software without
cloud APIs. This detection logic powers a zero-code desktop wizard so shop owners can connect
their cashier database to their online storefront without technical assistance.
"""

import os
import sqlite3
from typing import Dict, List, Any

def detect_db_type(db_path: str) -> str:
    """Detects database engine from file extension for appropriate driver selection."""
    if not db_path:
        return "sqlite"
    ext = os.path.splitext(db_path.strip())[1].lower()
    if ext in (".fdb", ".gdb"):
        return "firebird"
    elif ext in (".accdb", ".mdb"):
        return "access"
    return "sqlite"

def scan_sqlite_schema(db_path: str) -> Dict[str, Any]:
    """Extracts tables and column manifests from local SQLite cashier databases."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [row[0] for row in cursor.fetchall()]

    columns: Dict[str, List[str]] = {}
    for table in tables:
        cursor.execute(f'PRAGMA table_info("{table}")')
        columns[table] = [row[1] for row in cursor.fetchall()]

    conn.close()
    return {"tables": tables, "columns": columns}

def match_column_hints(available_cols: List[str], hints: List[str]) -> str:
    """Matches database columns against common French, Arabic-transliterated, and English retail naming patterns."""
    for col in available_cols:
        col_clean = col.lower().strip()
        if any(h.lower() == col_clean or h.lower() in col_clean for h in hints):
            return col
    return ""

def auto_configure_product_mapping(columns: List[str]) -> Dict[str, str]:
    """Infers critical e-commerce catalog fields from cashier column list."""
    return {
        "barcode": match_column_hints(columns, ["codebarre", "barcode", "refcodebarre", "code_barre", "ref"]),
        "name": match_column_hints(columns, ["designation", "nomproduit", "nom", "libelle", "name", "article"]),
        "stock": match_column_hints(columns, ["quantiteenstock", "qte", "stock", "quantity", "qtestock"]),
        "price": match_column_hints(columns, ["prixvente", "prix", "price", "pv", "pu"]),
    }
