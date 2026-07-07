# Deep-link URL schema (app)

Owner decision (2026-07-06): **human-readable `key=value` parameters; inputs are
always encoded, sort/filter state only when it differs from the defaults.**
These parameter names are a sharing format — treat them as a public API: add
new parameters freely, never repurpose or rename existing ones.

Implementation: `app/src/lib/domain/share-url.ts` (pure build/parse, vitest-covered).
Pages update the URL with a debounced `replaceState` (no history spam while
typing) and offer a Copy link button. Loading a deep link reproduces the
calculation on mount.

## Voltage divider — `/app/voltage-divider`

| Param | Meaning | When present |
| --- | --- | --- |
| `vs` | Supply voltage in volts, as typed (`5`, `3.3`) | always (non-empty) |
| `vt` | Target voltage in volts | always (non-empty) |
| `r` | Available resistor values, comma-separated, any legacy notation (`1k`, `4k7`, `100R(0.1%)`, `EB1041`, `96C`) | always (non-empty) |
| `os` | `0` = overshoot not allowed | only when off (default: allowed) |
| `snap` | Snap-to-E-series enabled with this series: `E24`/`E48`/`E96`/`E192` | only when snapping is on |
| `sort` | `parts` (component count), `rasc` / `rdesc` (total resistance) | only when not the default `error` |
| `rmin`, `rmax` | Total-resistance band in plain ohms (`rmin=1000&rmax=20000`) | only when the user narrowed the band; both or neither |

Example:

```
/app/voltage-divider?vs=3.3&vt=2.76&r=1k,2.2k,5.1k,10k&sort=parts
```

## Target resistance — `/app/target-resistance`

| Param | Meaning | When present |
| --- | --- | --- |
| `rt` | Target resistance, any legacy notation incl. tolerance bracket (`50k`, `1k2(1%)`) | always (non-empty) |
| `r` | Available resistor values (as above) | always (non-empty) |
| `snap` | Snap series, as above | only when snapping is on |

Sort is intentionally not encoded here: the page resets sort to `error` on
every calculation (legacy parity), so a sort param could never survive load.

## Balanced attenuator / interactive divider

Not encoded. The attenuator's inputs are owned by injected legacy DOM
(`script.js`), out of deep-link scope this tranche; the interactive divider's
state is a resistor tree, which doesn't fit flat query params — revisit if
sharing demand shows up.

## Encoding rules

- Values are `encodeURIComponent`-encoded, then commas and parentheses are
  restored (both are legal in query values per RFC 3986) so resistor lists and
  tolerance brackets stay readable. `%` still encodes as `%25`
  (`100R(0.1%)` → `100R(0.1%25)`).
- Unknown or malformed parameter values are ignored on load (no guessing);
  the page falls back to its defaults for that field.
- Parameters at their default value are omitted so shared URLs stay short.
