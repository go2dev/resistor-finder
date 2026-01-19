## Target Resistance Browser Test Checklist

Use a local server and open `target-resistance.html`. Run each test from a clean page load unless stated otherwise.

### 1) Basic nearest match
- **Input:** Available values `10k, 12k, 15k, 18k, 22k, 27k, 33k, 39k, 47k`
- **Target:** `50k`
- **Expected:** Results include series combinations near 50k (e.g., 22k + 27k) with non‑zero error.

### 2) Series/parallel mix
- **Input:** Available values `10k, 22k, 47k`
- **Target:** `15k`
- **Expected:** Parallel/series options appear (e.g., `22k || 47k` or combinations near 15k).

### 3) Tolerance parsing on target
- **Input:** Available values `4k99(1%), 10k(5%)`
- **Target:** `10k(5%)`
- **Expected:** Target input accepts tolerance; results show real‑world resistance range (not `—`).

### 4) Tight tolerance target
- **Input:** Available values `4k99(1%), 10k(0.1%)`
- **Target:** `10k(0.1%)`
- **Expected:** Large error highlighted (red) and 20% cutoff fallback may be triggered if no close results.

### 5) Invalid target input
- **Input:** Available values `10k, 22k`
- **Target:** `abc`
- **Expected:** Error message shown; no crash.

### 6) Invalid resistor input
- **Input:** Available values `10k(apple), 22k`
- **Target:** `33k`
- **Expected:** Warning shown for invalid tolerance, calculation proceeds using valid values.

### 7) Duplicate value de‑duplication
- **Input:** Available values `10k, 10K, 10k, 22k`
- **Action:** Click Calculate.
- **Expected:** Input box normalizes to unique values (e.g., `10k, 22k`).

### 8) Toggle available resistors
- **Input:** Available values `1k, 1k2, 1k5, 1k8, 2k2, 2k7, 3k3, 3k9, 4k7, 5k6, 6k8, 8k2, 10k`
- **Target:** `50k`
- **Action:** Disable `5k6, 6k8, 8k2, 10k`.
- **Expected:** Results update quickly; `10 × 4k7 = 47k` appears.

### 9) All values disabled
- **Input:** Available values `10k, 22k`
- **Action:** Disable both values.
- **Expected:** Error shown but available grid stays visible so values can be re‑enabled.

### 10) Snap to E‑series toggle
- **Input:** Available values `9.1k, 9.76k, 10.4k`
- **Target:** `10k`
- **Action:** Toggle “Snap to E‑series values” on/off.
- **Expected:** With snap on, values align to E‑series and results change; with snap off, values used as‑is.

### 11) Pruning check
- **Input:** Available values `4k99, 10k`
- **Target:** `10k`
- **Expected:** `4k99 + 4k99` should be pruned; pruning stats > 0.

### 12) 20% cutoff fallback
- **Input:** Available values `10, 22, 47`
- **Target:** `1G`
- **Expected:** 20% cutoff fallback shows “Yes”; error line is red (>20%).

### 13) Sort options
- **Input:** Available values `1k, 2k2, 3k3, 4k7, 6k8, 10k`
- **Target:** `6k`
- **Action:** Switch through sort options.
- **Expected:** Result ordering changes according to sort criteria.

### 14) Download diagram
- **Input:** Available values `10k, 22k, 47k`
- **Target:** `33k`
- **Action:** Download diagram from a result card.
- **Expected:** PNG saved with target value annotation.

### 15) Theme stability
- **Action:** Toggle theme while results are shown.
- **Expected:** Layout remains stable, text readable, no UI resets.
