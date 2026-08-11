#!/usr/bin/env python3
"""
Export JLC/LCSC *basic* chip resistors from a jlcparts cache.sqlite3 database.

Data model (see yaqwsx/jlcparts jlcparts/partLib.py and tscircuit/jlcsearch
lib/db/derivedtables/resistor.ts): components.basic marks JLC "Base" parts;
attributes live in JSON columns `extra` and optionally `jlc_extra`.

Prerequisites
-------------
- A jlcparts SQLite library, typically named cache.sqlite3, built by jlcparts
  from the JLC BOM spreadsheet (see jlcparts README).

Usage
-----
  python3 scripts/export_jlc_basic_chip_resistors.py --db ~/jlcparts/cache.sqlite3 \\
      --json-out data/jlc_basic_chip_resistors.json \\
      --csv-out data/jlc_basic_chip_resistors.csv

Outputs one row per LCSC part: lcsc, mfr, package, resistance_ohms, tolerance
(raw string and parsed percent), power (raw and watts if parsed), description,
stock, preferred flag, and datasheet URL when present.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


def read_resistance_ohms(value: str) -> float | None:
    """
    Parse LCSC resistance attribute to ohms (best-effort; mirrors jlcparts
    jlcparts/attributes.readResistance).
    """
    if not value or not isinstance(value, str):
        return None
    s = (
        value.replace("Ω", "")
        .replace("Ohms", "")
        .replace("Ohm", "")
        .replace("(Max)", "")
        .replace("Max", "")
        .strip()
    )
    s = s.replace(" ", "")
    if s in ("-", "", "null"):
        return None
    unit_prefixes = {
        "m": (1e-3, 1e-6),
        "K": (1e3, 1),
        "k": (1e3, 1),
        "M": (1e6, 1e3),
        "G": (1e9, 1e6),
    }
    for prefix, (mul0, mul1) in unit_prefixes.items():
        if prefix in s:
            parts = s.split(prefix)
            try:
                a = float(parts[0]) if parts[0] != "" else 0.0
                b = float(parts[1]) if len(parts) > 1 and parts[1] != "" else 0.0
                return a * mul0 + b * mul1
            except ValueError:
                return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_tolerance_percent(raw: str) -> float | None:
    """Return tolerance as a percent value (e.g. 1.0 for ±1%)."""
    if not raw or not isinstance(raw, str):
        return None
    s = raw.strip()
    m = re.search(r"±\s*([\d.]+)\s*%", s)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    m = re.search(r"([\d.]+)\s*%", s)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None


def parse_power_watts(raw: str) -> float | None:
    """
    Parse power attribute to watts (subset of jlcparts readPower).
    """
    if not raw or not isinstance(raw, str):
        return None
    s = raw.split(";")[0].strip()
    if s in ("-", "--", "", "null"):
        return None
    frac = re.fullmatch(r"(\d+)/(\d+)\s*(\w*)", s, re.I)
    if frac:
        num, den, unit = frac.groups()
        try:
            v = float(num) / float(den)
        except ValueError:
            return None
        s = str(v) + (unit or "")
    s = s.replace("W", "").strip()
    prefixes = {
        "p": 1e-12,
        "n": 1e-9,
        "u": 1e-6,
        "μ": 1e-6,
        "µ": 1e-6,
        "m": 1e-3,
        "k": 1e3,
        "K": 1e3,
        "M": 1e6,
        "G": 1e9,
    }
    if s and (s[-1].isalpha() or s[-1] in "μµ"):
        try:
            return float(s[:-1]) * prefixes.get(s[-1], 1.0)
        except (ValueError, KeyError):
            return None
    try:
        return float(s)
    except ValueError:
        return None


def _json_obj(blob: str | None) -> dict[str, Any]:
    if not blob:
        return {}
    try:
        o = json.loads(blob)
    except json.JSONDecodeError:
        return {}
    return o if isinstance(o, dict) else {}


def merge_attributes(extra: dict[str, Any], jlc_extra: dict[str, Any]) -> dict[str, Any]:
    """Merge LCSC extra.attributes with jlc_extra.attributes (jlc wins non-empty)."""
    out: dict[str, Any] = {}
    for src in (extra, jlc_extra):
        attr = src.get("attributes")
        if isinstance(attr, dict):
            for k, v in attr.items():
                if v in ("", "-", None):
                    continue
                out[k] = v
    return out


def lcsc_from_db(n: int) -> str:
    return f"C{n}"


def is_chip_resistor_row(description: str) -> bool:
    d = (description or "").strip()
    return d.startswith("Chip Resistor") and "Surface Mount" in d


def is_simple_single_chip(attrs: dict[str, Any], description: str) -> bool:
    desc_l = description.lower()
    if "array" in desc_l or "network" in desc_l:
        return False
    n = attrs.get("Number of Resistors")
    if n is not None and str(n).strip() not in ("", "-", "1"):
        try:
            if int(float(str(n).strip())) > 1:
                return False
        except ValueError:
            pass
    return True


def query_basic_chip_resistors(conn: sqlite3.Connection) -> Iterable[sqlite3.Row]:
    cur = conn.execute(
        """
        SELECT
            c.lcsc,
            c.mfr,
            c.package,
            c.preferred,
            c.description,
            c.stock,
            c.datasheet,
            c.extra,
            c.jlc_extra
        FROM components c
        INNER JOIN categories cat ON c.category_id = cat.id
        WHERE c.basic = 1
          AND cat.category = 'Resistors'
          AND c.description LIKE 'Chip Resistor%Surface Mount%'
        ORDER BY c.lcsc
        """
    )
    yield from cur


def row_to_record(r: sqlite3.Row) -> dict[str, Any] | None:
    extra = _json_obj(r["extra"])
    jlc_extra = _json_obj(r["jlc_extra"])
    attrs = merge_attributes(extra, jlc_extra)
    desc = r["description"] or ""

    if not is_chip_resistor_row(desc):
        return None
    if not is_simple_single_chip(attrs, desc):
        return None

    raw_r = attrs.get("Resistance")
    raw_tol = attrs.get("Tolerance")
    raw_pow = attrs.get("Power(Watts)") or attrs.get("Power")

    ohms = read_resistance_ohms(str(raw_r)) if raw_r is not None else None
    tol_pct = parse_tolerance_percent(str(raw_tol)) if raw_tol is not None else None
    pow_w = parse_power_watts(str(raw_pow)) if raw_pow is not None else None

    lcsc = lcsc_from_db(int(r["lcsc"]))
    return {
        "lcsc": lcsc,
        "mfr": (r["mfr"] or "").strip(),
        "package": (r["package"] or "").strip(),
        "preferred": bool(r["preferred"]),
        "description": desc,
        "stock": int(r["stock"] or 0),
        "datasheet": (r["datasheet"] or "").strip(),
        "resistance_ohms": ohms,
        "resistance_raw": raw_r if isinstance(raw_r, str) else (str(raw_r) if raw_r is not None else ""),
        "tolerance_raw": raw_tol if isinstance(raw_tol, str) else (str(raw_tol) if raw_tol is not None else ""),
        "tolerance_percent": tol_pct,
        "tolerance_fraction": (tol_pct / 100.0) if tol_pct is not None else None,
        "power_raw": raw_pow if isinstance(raw_pow, str) else (str(raw_pow) if raw_pow is not None else ""),
        "power_watts": pow_w,
    }


def write_json(path: Path, rows: list[dict[str, Any]], db_path: Path) -> None:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_db": str(db_path.resolve()),
        "filter": {
            "basic": True,
            "category": "Resistors",
            "description_prefix": "Chip Resistor - Surface Mount",
            "excludes": ["arrays/networks", "multi-resistor when Number of Resistors > 1"],
        },
        "row_count": len(rows),
        "rows": rows,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=False)
        f.write("\n")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "lcsc",
        "mfr",
        "package",
        "resistance_ohms",
        "resistance_raw",
        "tolerance_percent",
        "tolerance_fraction",
        "tolerance_raw",
        "power_watts",
        "power_raw",
        "preferred",
        "stock",
        "description",
        "datasheet",
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow(row)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument(
        "--db",
        required=True,
        type=Path,
        help="Path to jlcparts cache.sqlite3 (from jlcparts JLC spreadsheet import)",
    )
    p.add_argument("--json-out", type=Path, help="Write JSON table (metadata + rows)")
    p.add_argument("--csv-out", type=Path, help="Write CSV table")
    args = p.parse_args()

    if not args.json_out and not args.csv_out:
        print("Specify at least one of --json-out or --csv-out", file=sys.stderr)
        return 2

    db_path = args.db
    if not db_path.is_file():
        print(f"Database not found: {db_path}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        rows: list[dict[str, Any]] = []
        for r in query_basic_chip_resistors(conn):
            rec = row_to_record(r)
            if rec is not None:
                rows.append(rec)
    finally:
        conn.close()

    if args.json_out:
        write_json(args.json_out, rows, db_path)
        print(f"Wrote {len(rows)} rows to {args.json_out}")
    if args.csv_out:
        write_csv(args.csv_out, rows)
        print(f"Wrote {len(rows)} rows to {args.csv_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
