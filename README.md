# Voltage Divider Resistor Calculator

A tool for finding optimal resistor combinations from a limited set to create a voltage divider. For example, make use of resistor values already present in your design to limit the number unique items in your BOM.

## Features

- Calculate voltage divider combinations using available resistor values
- Support for resistors in series and parallel combinations
- Standard electronics notation for resistor values (e.g. 200R, 1K, 5K1, 1M)
- Shows top 5 best matches sorted by error

## Usage

1. Enter your available resistor values as comma-separated numbers (e.g., `10,220,470,1000,2k2,1M`)
2. Enter your supply voltage (V)
3. Enter your target output voltage (V)
4. Click "Calculate Combinations"

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

- The error value indicates how far from the target Vout an idealised divider would in volts. Positive numbers overshoot and negative numbers are under the target.   

- The output voltage range shows the possible range where the Vout might be accounting for the real life tolerances of components. Tolerances are determined by the E series for a given value and the calculator determines the range by trying the permutations of upper and lower bounds for a given value for each resistor in the network. 

### Sorting & filtering results

The options panel allows for precise filtering and sorting of the results. As there are often many results, the tool only shows the top 5 based on the filter and sort options.

- Sort by radio buttons change the criteria by which the results are shown
- The total resistance slider can be moved from either end to only show results within a certain range, useful if you are looking for a target total resistance to match the impedance of a DAC or have overall power draw requirements in a battery powered application. 
  - Grab the handles to adjust the range and drag the body to the slider to shift the range

## Resistor Value Notation

The calculator can use variety of notation styles when entering resistor values:
- Plain numbers for ohms:
    - 10 → 10 Ohm
    - 1000 → 1 kilo Ohm
- Electronics notation:
    - 100m → 100 milli Ohm
    - 10R → 10 Ohm
    - 1k → 1 kilo Ohm → 1000 Ohm
    - 43k2 → 42.3 kilo Ohm → 42300 Ohm
    - 10M → 10 mega Ohm → 10000000 Ohm
- Mixed electronic and decimal notation:
    - 71.5k → 71k5 → 71.5 kilo Ohm → 71500 Ohm
- Scientific notation:
    - 5.1e3 → 5k1 → 5100 Ohm


It is possible to use these styles in combination when inputting values e.g. `10, 330R, 4k7, 5.1e3, 10e6`

## How It Works
The calculator:
1. Takes your available resistor values
2. Generates all possible combinations (single resistors, series, and parallel)
3. Uses an intelligent search algorithm to efficiently find optimal voltage divider combinations
4. Sorts the results by how close they get to your target voltage
5. Shows the top 5 best matches

### Search Space Optimization
Rather than testing every possible pairing of resistor combinations, the calculator uses a smart optimization strategy. For each bottom resistor (R2) in the voltage divider, it calculates the mathematically ideal top resistor (R1) that would produce exactly the target voltage. It then uses binary search on pre-sorted resistance values to quickly locate the closest available R1 value, and only tests a small range of nearby candidates. This approach dramatically reduces computation time - for example, with 100 resistor values, it tests only a few thousand combinations instead of all ten thousand possible pairings. The calculator also eliminates duplicate results by tracking voltage divider ratios and keeping only the lowest total resistance for each unique ratio. When multiple CPU cores are available, the work is split across parallel workers for even faster results.


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


