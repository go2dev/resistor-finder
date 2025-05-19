# Resistor Voltage Divider Calculator

A tool for finding optimal resistor combinations to create voltage dividers with specific target voltages. Make use of resistor values already present in your design to keep the number of unique items in your BOM low.

## Features

- Calculate voltage divider combinations using available resistor values
- Support for resistors in series and parallel combinations
- Standard electronics notation for resistor values (e.g., 1k, 5k1, 1M)
- Shows top 5 best matches sorted by error

## Usage

1. Enter your available resistor values as comma-separated numbers (e.g., `100,220,470,1000,2200,4700`)
2. Enter your supply voltage (V)
3. Enter your target voltage (V)
4. Click "Calculate Combinations"

The calculator will show you the best combinations of resistors that will give you the closest voltage to your target.

## Example

Input:
- Resistor Values: `100,220,470,1000,2200,4700`
- Supply Voltage: `12`
- Target Voltage: `5`

Output will show combinations like:
```
R1: 1k + 2k2 (3k2)
R2: 4k7 (4k7)
Output Voltage: 5.12 V
Error: 0.12 V
```

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

## Resistor Value Notation

The calculator uses standard electronics notation for resistor values:
- 1000 → 1k
- 5100 → 5k1
- 1000000 → 1M
- 4700000 → 4M7

## How It Works

The calculator:
1. Takes your available resistor values
2. Generates all possible combinations (single resistors, series, and parallel)
3. Calculates the output voltage for each combination
4. Sorts the results by how close they get to your target voltage
5. Shows the top 5 best matches


## License

This project is licensed under the MIT License.

