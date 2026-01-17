# Voltage Divider Resistor Calculator

A tool for finding optimal resistor combinations from a limited set to create a voltage divider. For example, make use of resistor values already present in your design to limit the number unique items in your BOM.

## Features

- Calculate voltage divider combinations using available resistor values
- Support for resistors in series and parallel combinations
- RKM / R notation input support (IEC 60062) and EIA-96 marking codes
- Tolerance parsing from brackets (numeric or letter codes)
- JLCPCB Basic values autofill
- Per-solution supply voltage slider (updates Vout range only)
- Power dissipation breakdown and package recommendation per solution
- Target resistance mode (series/parallel match finder)
- PNG export includes key result text
- Shows top 5 best matches sorted by error

## Usage

1. Enter your available resistor values as comma-separated numbers (e.g., `10,220,470,1000,2k2,1M`)
2. Enter your supply voltage (V)
3. Enter your target output voltage (V)
4. Click "Calculate Combinations"
5. Use the per-solution slider to adjust supply voltage for that solution only (error remains based on the original inputs)

The calculator will show you the best combinations of resistors that will give you the closest voltage to your target.

### Example

**Input:**   
Resistor Values: `100,220,470,1000,2200,4700`   
Supply Voltage: `12`   
Target Voltage: `5`   
   
**Output will show combinations like:**
```
R1: 1k + 2k2 (3k2)
R2: 4k7 (4k7)
Output Voltage: 5.12 V
Error: 0.12 V
Components: 4
Output Voltage Range: 3.30V to 3.45V
```

- The error value indicates how far from the target Vout an idealised divider would be in volts. Positive numbers overshoot the target and negative numbers are under the target.   

- The output voltage range shows the possible range where the Vout might be, accounting for the real life tolerances of components. Tolerances are determined by the E series for a given value and the calculator determines the range by trying the permutations of upper and lower bounds for a given value for each resistor in the network. 

### Sorting & filtering results

The options panel allows for precise filtering and sorting of the results. As there are often many results, the tool only shows the top 5 based on the filter and sort options.

- Sort by radio buttons change the criteria by which the results are shown
- The total resistance slider can be moved from either end to only show results within a certain range, which is useful if you are looking for a target total resistance to match the impedance of a DAC or have overall power draw requirements in a battery-powered application. 
  - Grab the handles to adjust the range and drag the body to the slider to shift the range

## Target Resistance Mode

Use the Target Resistance page to find the closest single/series/parallel combinations to a desired resistance value.

1. Enter your available resistor values as comma-separated numbers
2. Enter your target resistance
3. Click "Find Closest Matches"

## Snap to E-series Values

Enable the Snap to E-series toggle to coerce parsed values to the nearest E-series value. If a tolerance is specified, the closest matching E-series is chosen. Otherwise the selected series is used. When disabled, values are used exactly as entered (including non-standard values), and no snapping is applied.

## JLC PCB Basics Autofill

Use the "Autofill JLC PCB Basics Values" button to populate the input with JLCPCB Basic resistor values. At the time of writing, JLCPCB does not charge a loading fee for basic parts, so using these values can be more cost-effective for assembly.

## Resistor Value Notation (RKM / R notation, IEC 60062)

The calculator can use a variety of notation styles when entering resistor values:
- Plain numbers for ohms:
    - 10 → 10 Ohm
    - 1000 → 1 kilo Ohm
- RKM / R notation (IEC 60062):
    - 100m → 100 milli Ohm
    - 10R → 10 Ohm
    - 1k → 1 kilo Ohm → 1000 Ohm
    - 43k2 → 42.3 kilo Ohm → 42300 Ohm
    - 10M → 10 mega Ohm → 10000000 Ohm
- EIA-96 code notation:
    - 96C → 97k6
- Mixed electronic and decimal notation:
    - 71.5k → 71k5 → 71.5 kilo Ohm → 71500 Ohm
- Scientific notation:
    - 5.1e3 → 5k1 → 5100 Ohm


It is possible to use these styles in combination when inputting values e.g. `10, 330R, 4k7, 5.1e3, 10e6`

See [RKM code](https://en.wikipedia.org/wiki/RKM_code) for more details. E-series preferred numbers are defined by IEC 60063: [E series of preferred numbers](https://en.wikipedia.org/wiki/E_series_of_preferred_numbers).

## Tolerance Input

You can add tolerance in brackets after the value. If omitted, the E-series tolerance is used for any value that matches a standard series.

Examples:
- `10k(1%)`
- `33k(0.5%)`
- `4k99(A)`

Tolerance letter codes (from RKM code):

| Code letter | Tolerance |
|-------------|-----------|
| A           | ±0.05%    |
| B           | ±0.1%     |
| C           | ±0.25%    |
| D           | ±0.5%     |
| E           | ±0.005%   |
| F           | ±1.0%     |
| G           | ±2.0%     |
| H           | ±3.0%     |
| J           | ±5.0%     |
| K           | ±10%      |
| L           | ±0.01%    |
| M           | ±20%      |
| N           | ±30%      |
| P           | ±0.02%    |
| W           | ±0.05%    |

Source: [RKM code](https://en.wikipedia.org/wiki/RKM_code)

## Full Marking Codes (Power + Value + Tolerance)

This tool also supports full marking codes such as `EB1041` or `CB3932`.

Format:
- First two letters: power dissipation code
- Next three digits: resistance value (first two are significant, third is multiplier)
- Final digit: tolerance (interpreted as 10% × digit, matching the examples below)

Examples:
- `EB1041` → 10 × 10^4 Ω, ±10% (power code EB)
- `CB3932` → 39 × 10^3 Ω, ±20% (power code CB)

Power code table (from the resistor marking reference on Wikipedia):

| Code  | Power rating (W) |
|-------|-------------------|
| BB    | 1/8               |
| CB    | 1/4               |
| EB    | 1/2               |
| GB    | 1                 |
| HB    | 2                 |
| GM    | 3                 |
| HM    | 4                 |

Source: [Resistor](https://en.wikipedia.org/wiki/Resistor)

If a power code is supplied and a solution exceeds it, a warning is shown.

## Power Dissipation & Package Recommendation

Each solution includes power dissipation per leg and a minimum recommended package size. This LUT is based on general/normal parts and may vary by manufacturer:

| Package Code (Imperial) | Package Code (Metric) | Power Rating (W) |
|-------------------------|-----------------------|------------------|
| 01005                   | 0402                  | 0.031            |
| 0201                    | 0603                  | 0.05             |
| 0402                    | 1005                  | 0.062            |
| 0603                    | 1608                  | 0.10             |
| 0805                    | 2012                  | 0.125            |
| 1206                    | 3216                  | 0.25             |
| 1210                    | 3225                  | 0.33             |
| 2010                    | 5025                  | 0.5              |
| 1812                    | 4532                  | 0.75             |
| 2512                    | 6332                  | 1.0              |

## How It Works
The calculator:
1. Takes your available resistor values
2. Generates a list of all possible combinations (single resistors, series, and parallel)
3. Reduces the search space by removing 'obviously' wrong combinations and then performs the calculations
4. Sorts the results by user set criteria
5. Shows the top 5 best matches

### Search Space Optimisation
Rather than testing every possible pairing of resistor combinations, the calculator uses a smart optimisation strategy. For each bottom resistor (R2) in the voltage divider, it calculates the mathematically ideal top resistor (R1) that would produce exactly the target voltage. It then uses binary search on pre-sorted resistance values to quickly locate the closest available R1 value, and only tests a small range of nearby candidates. This approach dramatically reduces computation time - for example, with 100 resistor values, it tests only a few thousand combinations instead of all ten thousand possible pairings. The calculator also eliminates duplicate results by tracking voltage divider ratios and keeping only the lowest total resistance for each unique ratio. When multiple CPU cores are available, the work is split across parallel workers for even faster results.


## Running Locally

1. Clone this repository
2. Start a local server using one of these methods:

Using Python:
```bash
python3 -m http.server 8000
```

Using Node.js:
```bash
npx http-server -p 8000
```

3. Open your browser and navigate to `http://localhost:8000`



## License

This project is licensed under the MIT License.

Warranty: none provided. Use at your own risk; results are not validated.


