#!/usr/bin/env python3
"""
Regenerate data/jlc_basic_resistors_embedded.json from jlcsearch (same merge
logic as jlc-basic-catalog.js: is_basic page + per-package queries).

Also mirrors the same file to app/static/data/ so SvelteKit dev/build serves it at
/app/data/jlc_basic_resistors_embedded.json (paths.base).

Requires: curl
"""
import json
import shutil
import subprocess
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "jlc_basic_resistors_embedded.json"
APP_STATIC_OUT = ROOT / "app" / "static" / "data" / "jlc_basic_resistors_embedded.json"
UA = "resistor-finder/1.0 (https://github.com/go2dev/resistor-finder; embedded data)"

PACKAGES = ["0402", "0603", "0805", "1206", "1210", "2010", "2512", "0201", "01005"]


def curl_json(url: str) -> dict:
    out = subprocess.check_output(
        ["curl", "-fsS", "-m", "60", "-A", UA, url],
        text=True,
    )
    return json.loads(out)


def main() -> None:
    urls = [
        "https://jlcsearch.tscircuit.com/resistors/list.json?is_basic=true&limit=100"
    ]
    for p in PACKAGES:
        q = urllib.parse.urlencode({"is_basic": "true", "package": p, "limit": "500"})
        urls.append(f"https://jlcsearch.tscircuit.com/resistors/list.json?{q}")

    seen: dict[int, dict] = {}
    for url in urls:
        try:
            data = curl_json(url)
        except subprocess.CalledProcessError as e:
            print("skip", url, e)
            continue
        for x in data.get("resistors") or []:
            lcsc = x.get("lcsc")
            if lcsc in seen:
                continue
            pw = x.get("power_watts")
            power_mw = float(pw) if pw is not None else None
            tf = x.get("tolerance_fraction")
            tol_pct = float(tf) * 100 if tf is not None else None
            seen[lcsc] = {
                "lcsc": lcsc,
                "mfr": x.get("mfr"),
                "package": x.get("package"),
                "resistance": x.get("resistance"),
                "tolerance_fraction": tf,
                "tolerance_percent": tol_pct,
                "power_milliwatts": power_mw,
                "power_watts": (power_mw / 1000.0) if power_mw is not None else None,
            }

    rows = list(seen.values())
    rows.sort(key=lambda r: (r.get("resistance") or 0, r.get("package") or "", r.get("lcsc") or 0))
    payload = {
        "source": "https://jlcsearch.tscircuit.com/resistors/list.json (merged)",
        "row_count": len(rows),
        "rows": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    print("wrote", OUT, "rows", len(rows))

    APP_STATIC_OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(OUT, APP_STATIC_OUT)
    print("copied to", APP_STATIC_OUT)


if __name__ == "__main__":
    main()
