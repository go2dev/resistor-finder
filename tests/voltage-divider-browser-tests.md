## Voltage Divider Browser Test Checklist

Use a local server and open `index.html`. Run each test from a clean page load unless stated otherwise.

### 1) Basic midpoint
- **Input:** Available values `10k`
- **Supply:** `5`
- **Target:** `2.5`
- **Expected:** A result with `R1: 10K` and `R2: 10K` (or equivalent), nominal Vout ~`2.50 V`, non‑zero real‑world range and power.

### 2) Overshoot toggle
- **Input:** Available values `10k, 12k, 15k`
- **Supply:** `5`
- **Target:** `4.2`
- **Action:** Toggle "Allow Voltage Overshoot" off/on.
- **Expected:** With overshoot off, results should not exceed target Vout; with overshoot on, results may exceed target.

### 3) Snap to E‑series toggle (non‑standard only)
- **Input:** Available values `4k123, 4k123(0.1%), 4k7`
- **Supply:** `5`
- **Target:** `2.5`
- **Action:** Toggle "Snap to E‑series values" off/on.
- **Expected:** `4k7` (standard) stays unchanged. `4k123` snaps to nearest series only when enabled (e.g. `4k3`). `4k123(0.1%)` snaps to E192 (e.g. `4k12`).

### 4) RKM / EIA‑96 / marking inputs
- **Input:** Available values `4k7, 4K99, 96C, EB1041`
- **Supply:** `12`
- **Target:** `3.3`
- **Expected:** Parsed values show in the available grid with correct formatting; no parsing errors for valid codes.

### 5) Tolerance parsing & series color
- **Input:** Available values `10k(1%), 10k(D), 4k99(A)`
- **Supply:** `5`
- **Target:** `2.5`
- **Expected:** Tooltips show tolerance; `10k(1%)` shows E96 color, `10k(D)` shows E192 color.

### 6) Invalid input handling
- **Input:** Available values `10k(apple), 22k`
- **Supply:** `5`
- **Target:** `2.5`
- **Expected:** Warning shown for invalid tolerance, calculation continues using valid values.

### 7) Duplicate value de‑duplication
- **Input:** Available values `10k, 10K, 10k, 22k, 22K`
- **Action:** Click Calculate.
- **Expected:** Input box normalizes to unique values (e.g., `10k, 22k`), results still appear.

### 8) Toggle available resistors
- **Input:** Available values `10k, 22k, 47k`
- **Supply:** `5`
- **Target:** `2.5`
- **Action:** Disable `10k` in the available grid.
- **Expected:** Results recompute using only enabled values; no empty results if enabled values remain.

### 9) Toggle all resistors off
- **Input:** Available values `10k, 22k`
- **Action:** Disable both values.
- **Expected:** Error appears, but the available grid remains visible so values can be re‑enabled.

### 10) Resistance filter slider reset
- **Input:** Available values `1k, 2k2, 4k7, 10k`
- **Supply:** `12`
- **Target:** `3.3`
- **Action:** Move the resistance filter to exclude all results, then toggle a resistor on/off.
- **Expected:** Slider range resets to show valid results; no "empty results" due to stale filter.

### 11) Per‑solution slider behavior
- **Input:** Available values `10k, 22k`
- **Supply:** `5`
- **Target:** `2.5`
- **Action:** Move per‑solution slider on a result card.
- **Expected:** Nominal Vout and real‑world Vout range update; error remains unchanged.

### 12) Power dissipation values
- **Input:** Available values `1k, 2k2, 4k7`
- **Supply:** `12`
- **Target:** `5`
- **Expected:** Power dissipation values are non‑zero and "Minimum package size recommendation" is shown.

### 13) Sort options affect output
- **Input:** Available values `1k, 2k2, 3k3, 4k7, 6k8, 10k`
- **Supply:** `12`
- **Target:** `5`
- **Action:** Change sort order to each option.
- **Expected:** Order of results changes to match the chosen sort criteria.

### 14) Diagram and PNG export
- **Input:** Available values `10k, 22k`
- **Supply:** `5`
- **Target:** `2.5`
- **Action:** Click the download icon on a result.
- **Expected:** PNG downloads with diagram plus total resistance, error, and Vout range annotations.

### 15) Theme toggle stability
- **Action:** Toggle light/dark mode.
- **Expected:** UI theme changes without breaking layout or hiding inputs/results.
