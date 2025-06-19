// Define resistor series data
const resistorSeries = {
    E24: [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1],
    E48: [1.00, 1.05, 1.10, 1.15, 1.21, 1.27, 1.33, 1.40, 1.47, 1.54, 1.62, 1.69, 1.78, 1.87, 1.96, 2.05, 2.15, 2.26, 2.37, 2.49, 2.61, 2.74, 2.87, 3.01, 3.16, 3.32, 3.48, 3.65, 3.83, 4.02, 4.22, 4.42, 4.64, 4.87, 5.11, 5.36, 5.62, 5.90, 6.19, 6.49, 6.81, 7.15, 7.50, 7.87, 8.25, 8.66, 9.09, 9.53],
    E96: [1.00, 1.02, 1.05, 1.07, 1.10, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.30, 1.33, 1.37, 1.40, 1.43, 1.47, 1.50, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2.00, 2.05, 2.10, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.80, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24, 3.32, 3.40, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.90, 6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.50, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76],
    E192: [1.00, 1.01, 1.02, 1.04, 1.05, 1.06, 1.07, 1.09, 1.10, 1.11, 1.13, 1.14, 1.15, 1.17, 1.18, 1.20, 1.21, 1.23, 1.24, 1.26, 1.27, 1.29, 1.30, 1.32, 1.33, 1.35, 1.37, 1.38, 1.40, 1.42, 1.43, 1.45, 1.47, 1.49, 1.50, 1.52, 1.54, 1.56, 1.58, 1.60, 1.62, 1.64, 1.65, 1.67, 1.69, 1.72, 1.74, 1.76, 1.78, 1.80, 1.82, 1.84, 1.87, 1.89, 1.91, 1.93, 1.96, 1.98, 2.00, 2.03, 2.05, 2.08, 2.10, 2.13, 2.15, 2.18, 2.21, 2.23, 2.26, 2.29, 2.32, 2.34, 2.37, 2.40, 2.43, 2.46, 2.49, 2.52, 2.55, 2.58, 2.61, 2.64, 2.67, 2.71, 2.74, 2.77, 2.80, 2.84, 2.87, 2.91, 2.94, 2.98, 3.01, 3.05, 3.09, 3.12, 3.16, 3.20, 3.24, 3.28, 3.32, 3.36, 3.40, 3.44, 3.48, 3.52, 3.57, 3.61, 3.65, 3.70, 3.74, 3.79, 3.83, 3.88, 3.92, 3.97, 4.02, 4.07, 4.12, 4.17, 4.22, 4.27, 4.32, 4.37, 4.42, 4.48, 4.53, 4.59, 4.64, 4.70, 4.75, 4.81, 4.87, 4.93, 4.99, 5.05, 5.11, 5.17, 5.23, 5.30, 5.36, 5.42, 5.49, 5.56, 5.62, 5.69, 5.76, 5.83, 5.90, 5.97, 6.04, 6.12, 6.19, 6.26, 6.34, 6.42, 6.49, 6.57, 6.65, 6.73, 6.81, 6.90, 6.98, 7.06, 7.15, 7.23, 7.32, 7.41, 7.50, 7.59, 7.68, 7.77, 7.87, 7.96, 8.06, 8.16, 8.25, 8.35, 8.45, 8.56, 8.66, 8.76, 8.87, 8.98, 9.09, 9.20, 9.31, 9.42, 9.53, 9.65, 9.76, 9.88]
};

// Define E-series tolerances
const resistorTolerances = {
    E24: 5,
    E48: 2,
    E96: 1,
    E192: 0.5
};

// Global cache for results to avoid recalculation on sort changes
let resultsCache = {
    allResults: null,
    calculatorState: null,
    isValid: false
};

// Global variables to store current resistance filter range
let currentResistanceRange = {
    min: 0,
    max: Infinity
};

// Function to generate a state key for cache validation
function generateStateKey(calculator, resistorValues, supplyVoltage, targetVoltage, allowOvershoot) {
    return JSON.stringify({
        resistorValues: resistorValues.slice().sort(), // Sort for consistent comparison
        supplyVoltage,
        targetVoltage,
        allowOvershoot
    });
}

// Function to check if cache is valid for current state
function isCacheValid(calculator, resistorValues, supplyVoltage, targetVoltage, allowOvershoot) {
    if (!resultsCache.isValid || !resultsCache.allResults) {
        return false;
    }
    
    const currentState = generateStateKey(calculator, resistorValues, supplyVoltage, targetVoltage, allowOvershoot);
    return resultsCache.calculatorState === currentState;
}

// Function to invalidate the cache
function invalidateCache() {
    resultsCache.isValid = false;
    resultsCache.allResults = null;
    resultsCache.calculatorState = null;
}

class ResistorCalculator {
    constructor() {
        this.resistorValues = [];
        this.supplyVoltage = 0;
        this.targetVoltage = 0;
        this.results = [];
        this.allowOvershoot = false;
        this.calculationStats = {
            totalCombinations: 0,
            validCombinations: 0,
            inputConversions: [],
            voltageStats: {
                above: 0,
                below: 0,
                exact: 0
            }
        };
    }

    // Parse resistor value from string notation to number
    parseResistorValue(value) {
        // Remove any whitespace
        value = value.trim();
        
        // If it's just a number, return it
        if (!isNaN(value)) {
            return parseFloat(value);
        }

        // Handle letter notation
        const multipliers = {
            'm': 0.001, // Handle lowercase 'm' for milliohms
            'R': 1,
            'r': 1,
            'K': 1000,
            'k': 1000,
            'M': 1000000,
            'G': 1000000000,
            'g': 1000000000
        };

        // First try decimal notation (e.g., "2.2k", "43.2k")
        const decimalMatch = value.match(/^(\d+\.?\d*)([kKmMgGrR])$/);
        if (decimalMatch) {
            const [, number, unit] = decimalMatch;
            return parseFloat(number) * multipliers[unit];
        }

        // Then try letter notation (e.g., "2k2", "43k2")
        const letterMatch = value.match(/^(\d+)([kKmMgGrR])(\d*)$/);
        if (letterMatch) {
            const [, whole, unit, decimal] = letterMatch;
            const multiplier = multipliers[unit];
            let result = parseFloat(whole) * multiplier;
            
            // Add decimal part if it exists
            if (decimal) {
                result += (parseFloat(decimal) * multiplier) / Math.pow(10, decimal.length);
            }
            
            return result;
        }

        throw new Error(`Invalid resistor value format`);
    }

    // Format resistor value using standard electronics notation
    formatResistorValue(value) {
        const units = [
            { value: 1e9, symbol: 'G' },
            { value: 1e6, symbol: 'M' },
            { value: 1e3, symbol: 'K' },
            { value: 1, symbol: 'Ω' },
            { value: 1e-3, symbol: 'mΩ'}
        ];

        for (const unit of units) {
            if (value >= unit.value) {
                const scaled = value / unit.value;
                // If the value is a whole number, don't show decimal
                if (Number.isInteger(scaled)) {
                    return `${scaled}${unit.symbol}`;
                }
                // For values like 5.1k, show as 5k1
                const [whole, decimal] = scaled.toString().split('.');
                if (decimal && decimal.length > 0) {
                    return `${whole}${unit.symbol}${decimal[0]}`;
                }
                return `${scaled}${unit.symbol}`;
            }
        }
        return value.toString();
    }

    // Format an array of resistor values
    formatResistorArray(resistors) {
        if (!Array.isArray(resistors)) {
            return this.formatResistorValue(resistors);
        }
        const type = resistors.type || 'series';
        const values = resistors.map(r => this.formatResistorValue(r)).join(type === 'parallel' ? ' || ' : ' + ');
        return type === 'parallel' ? `(${values})` : values;
    }

    // Calculate equivalent resistance for resistors in series
    calculateSeriesResistance(resistors) {
        if (!Array.isArray(resistors)) return resistors;
        return resistors.reduce((sum, r) => sum + r, 0);
    }

    // Calculate equivalent resistance for resistors in parallel
    calculateParallelResistance(resistors) {
        if (!Array.isArray(resistors)) return resistors;
        return 1 / resistors.reduce((sum, r) => sum + (1 / r), 0);
    }

    // Calculate total resistance based on connection type
    calculateTotalResistance(resistors) {
        if (!Array.isArray(resistors)) return resistors;
        if (resistors.type === 'parallel') {
            return this.calculateParallelResistance(resistors);
        }
        return this.calculateSeriesResistance(resistors);
    }

    // Calculate output voltage for a voltage divider
    calculateOutputVoltage(r1, r2, supplyVoltage) {
        return (r2 / (r1 + r2)) * supplyVoltage;
    }

    // Generate all possible combinations of resistors
    generateCombinations(resistors, maxResistors = 4) {
        const combinations = [];
        
        // Single resistor combinations
        for (let r of resistors) {
            combinations.push(r);
        }

        // Series combinations
        for (let i = 0; i < resistors.length; i++) {
            for (let j = i; j < resistors.length; j++) {
                const series = [resistors[i], resistors[j]];
                series.type = 'series';
                combinations.push(series);
            }
        }

        // Parallel combinations
        for (let i = 0; i < resistors.length; i++) {
            for (let j = i; j < resistors.length; j++) {
                const parallel = [resistors[i], resistors[j]];
                parallel.type = 'parallel';
                combinations.push(parallel);
            }
        }

        return combinations;
    }

    // Calculate total number of components in a result
    getComponentCount(result) {
        const r1Count = Array.isArray(result.r1) ? result.r1.length : 1;
        const r2Count = Array.isArray(result.r2) ? result.r2.length : 1;
        return r1Count + r2Count;
    }

    // Calculate bounds for a resistor value based on its series
    calculateResistorBounds(value, series) {
        const tolerance = series ? resistorTolerances[series] : 0;
        const multiplier = tolerance / 100;
        return {
            lower: value * (1 - multiplier),
            upper: value * (1 + multiplier)
        };
    }

    // Calculate voltage range for a voltage divider considering tolerances
    calculateVoltageRange(r1, r2, supplyVoltage) {
        // Get series for each resistor
        const r1Series = normalizeAndCheckSeries(r1);
        const r2Series = normalizeAndCheckSeries(r2);

        // Calculate bounds for each resistor
        const r1Bounds = this.calculateResistorBounds(r1, r1Series);
        const r2Bounds = this.calculateResistorBounds(r2, r2Series);

        // Calculate all possible combinations
        const combinations = [
            { r1: r1Bounds.lower, r2: r2Bounds.lower },
            { r1: r1Bounds.lower, r2: r2Bounds.upper },
            { r1: r1Bounds.upper, r2: r2Bounds.lower },
            { r1: r1Bounds.upper, r2: r2Bounds.upper }
        ];

        // Calculate voltages for all combinations
        const voltages = combinations.map(combo => 
            this.calculateOutputVoltage(combo.r1, combo.r2, supplyVoltage)
        );

        return {
            min: Math.min(...voltages),
            max: Math.max(...voltages)
        };
    }

    // Find voltage divider combinations
    findVoltageDividerCombinations() {
        const combinations = this.generateCombinations(this.resistorValues);
        const results = [];
        this.calculationStats.totalCombinations = combinations.length * combinations.length;
        this.calculationStats.validCombinations = 0;
        this.calculationStats.voltageStats = {
            above: 0,
            below: 0,
            exact: 0
        };

        // Store all valid combinations for debugging
        const allValidCombinations = [];

        for (let r1 of combinations) {
            for (let r2 of combinations) {
                const r1Value = this.calculateTotalResistance(r1);
                const r2Value = this.calculateTotalResistance(r2);
                
                const outputVoltage = this.calculateOutputVoltage(r1Value, r2Value, this.supplyVoltage);
                const error = outputVoltage - this.targetVoltage;
                
                // Only include results that are within bounds or if overshoot is allowed
                if (this.allowOvershoot || error <= 0) {
                    this.calculationStats.validCombinations++;
                    
                    // Update voltage statistics
                    if (Math.abs(error) < 0.0001) {
                        this.calculationStats.voltageStats.exact++;
                    } else if (error > 0) {
                        this.calculationStats.voltageStats.above++;
                    } else {
                        this.calculationStats.voltageStats.below++;
                    }
                    
                    // Calculate voltage range considering tolerances
                    const voltageRange = this.calculateVoltageRange(r1Value, r2Value, this.supplyVoltage);
                    
                    const result = {
                        r1: r1,
                        r2: r2,
                        r1Value: r1Value,
                        r2Value: r2Value,
                        outputVoltage: outputVoltage,
                        error: error,
                        componentCount: this.getComponentCount({ r1, r2 }),
                        voltageRange: voltageRange,
                        totalResistance: r1Value + r2Value
                    };
                    
                    results.push(result);
                    allValidCombinations.push(result);
                }
            }
        }

        return results;
    }

    validateResistorValue(value) {
        try {
            const parsed = this.parseResistorValue(value);
            if (parsed <= 0) {
                return { valid: false, error: 'Resistor value must be positive' };
            }
            return { valid: true, value: parsed };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    validateVoltage(value, isSupply = false) {
        const num = parseFloat(value);
        if (isNaN(num)) {
            return { valid: false, error: 'Invalid voltage value' };
        }
        if (num <= 0) {
            return { valid: false, error: 'Voltage must be positive' };
        }
        if (!isSupply && num > this.supplyVoltage) {
            return { valid: false, error: 'Target voltage cannot exceed supply voltage' };
        }
        return { valid: true, value: num };
    }
}

// DOM Elements
const resistorValuesInput = document.getElementById('resistorValues');
const supplyVoltageInput = document.getElementById('supplyVoltage');
const supplyVoltageSlider = document.getElementById('supplyVoltageSlider');
const targetVoltageInput = document.getElementById('targetVoltage');
const calculateBtn = document.getElementById('calculateBtn');
const resultsContainer = document.getElementById('results');
const overshootSwitch = document.getElementById('overshoot');

// Update slider range when supply voltage changes
function updateSliderRange(value) {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
        supplyVoltageSlider.min = "0";
        supplyVoltageSlider.max = (numValue * 2).toString();
        supplyVoltageSlider.value = numValue.toString();
    }
}

// Update supply voltage input when slider changes
function updateSupplyVoltage(value) {
    supplyVoltageInput.value = value;
    document.getElementById('sliderValue').textContent = value;
    calculateAndDisplayResults();
}

// Event Listeners for supply voltage
supplyVoltageInput.addEventListener('input', (e) => {
    invalidateCache(); // Cache is invalid when supply voltage changes
    calculateAndDisplayResults();
});

// Function to perform calculation and update results
function calculateAndDisplayResults() {
    const calculator = new ResistorCalculator();
    const errors = [];
    const warnings = [];
    
    // Parse and validate resistor values
    const resistorInputs = resistorValuesInput.value.split(',').map(v => v.trim());
    const validResistors = [];
    
    // Store current active states
    const activeStates = Array.from(document.querySelectorAll('.parsed-value-box')).map(box => ({
        value: parseFloat(box.dataset.value),
        active: box.classList.contains('active')
    }));
    
    resistorInputs.forEach((value, index) => {
        if (!value) return; // Skip empty values
        const result = calculator.validateResistorValue(value);
        if (result.valid) {
            validResistors.push(result.value);
            // Check series and log to console
            const seriesName = normalizeAndCheckSeries(result.value);
            //console.log(`Resistor value ${result.value} belongs to series: ${seriesName || 'None'}`);
            calculator.calculationStats.inputConversions.push({
                input: value,
                value: result.value,
                formatted: calculator.formatResistorValue(result.value),
                series: seriesName,
                active: activeStates.find(state => state.value === result.value)?.active ?? true
            });
        } else {
            warnings.push(`Resistor ${index + 1} ${value} ignored: ${result.error}`);
        }
    });

    // Validate supply voltage
    const supplyResult = calculator.validateVoltage(supplyVoltageInput.value, true);
    if (!supplyResult.valid) {
        errors.push(`Supply Voltage: ${supplyResult.error}`);
    } else {
        calculator.supplyVoltage = supplyResult.value;
    }

    // Validate target voltage
    const targetResult = calculator.validateVoltage(targetVoltageInput.value);
    if (!targetResult.valid) {
        errors.push(`Target Voltage: ${targetResult.error}`);
    } else {
        calculator.targetVoltage = targetResult.value;
    }

    // Set overshoot option
    calculator.allowOvershoot = overshootSwitch.checked;

    // Check if we have enough valid inputs to proceed
    if (validResistors.length === 0) {
        errors.push('At least one valid resistor value is required');
    }

    // If there are critical errors, show them and stop
    if (errors.length > 0) {
        resultsContainer.innerHTML = `
            <div class="error">
                <h3>Errors:</h3>
                <ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>
            </div>`;
        return;
    }

    // Proceed with calculation using valid inputs
    calculator.resistorValues = validResistors;
    
    // Check if we can use cached results
    let allResults;
    const useCache = isCacheValid(calculator, validResistors, calculator.supplyVoltage, calculator.targetVoltage, calculator.allowOvershoot);
    
    if (useCache) {
        // Use cached results - no need to recalculate
        allResults = resultsCache.allResults;
    } else {
        // Calculate new results and cache them
        allResults = calculator.findVoltageDividerCombinations();
        
        // Update cache
        resultsCache.allResults = allResults;
        resultsCache.calculatorState = generateStateKey(calculator, validResistors, calculator.supplyVoltage, calculator.targetVoltage, calculator.allowOvershoot);
        resultsCache.isValid = true;
    }
    
    // Apply filtering and sorting to get display results
    const displayResults = filterAndSortResults(allResults, currentResistanceRange.min, currentResistanceRange.max);

    // Display results with warnings if any
    let output = '';
    if (warnings.length > 0) {
        output += `
            <div class="warnings-section">
                <h3>Warnings</h3>
                <table class="warnings-table">
                    <thead>
                        <tr>
                            <th>Input</th>
                            <th>Value</th>
                            <th>Issue</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${warnings.map(w => {
                            const [input, issue] = w.split(' ignored: ');
                            const value = input.split(' ').pop();
                            const inputLabel = input.substring(0, input.lastIndexOf(' '));
                            return `
                                <tr>
                                    <td>${inputLabel}</td>
                                    <td>${value}</td>
                                    <td>${issue}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // Add parsed values display
    if (calculator.calculationStats.inputConversions.length > 0) {
        // Sort inputConversions by value in ascending order
        calculator.calculationStats.inputConversions.sort((a, b) => a.value - b.value);
        
        output += `
            <div class="parsed-values">
                <h3>Available resistors</h3>
                <div class="help-tooltip">
                    ?
                    <span class="tooltip-text">
                        Click a value to temporarily exclude/include it from the calculation. Colours inidicate the E series of the value
                    </span>
                </div>
                <div class="parsed-values-grid">
                    ${calculator.calculationStats.inputConversions.map((conv, index) => `
                        <div class="parsed-value-box ${conv.active !== false ? 'active' : 'disabled'} ${conv.series ? 'series-' + conv.series.toLowerCase() : 'series-none'}" 
                             data-value="${conv.value}" 
                             data-input="${conv.input}"
                             data-series="${conv.series || ''}"
                             data-index="${index}" 
                             onclick="toggleResistorValue(this)">
                            <span class="formatted">${conv.formatted}</span>
                            <span class="box-tooltip">${conv.value} Ω<br>${conv.series ? 'Series: ' + conv.series : 'Non-standard value'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }

    // Add voltage slider section
    output += `
        <div class="voltage-slider-section">
            <label for="supplyVoltageSlider">Quick Adjust Supply Voltage: <span id="sliderValue">${calculator.supplyVoltage}</span> V</label>
            <input type="range" id="supplyVoltageSlider" min="0" max="${calculator.supplyVoltage * 2}" step="0.1" value="${calculator.supplyVoltage}">
        </div>
    `;

    output += renderResults(displayResults, calculator);

    // Add calculation details if enabled
        output += `
            <div class="details-section">
                <h3>Calculation Details</h3>
                <div class="details-content">
                    <div class="input-conversions">
                        <h4>Input Value Conversions</h4>
                        <table class="details-table">
                            <thead>
                                <tr>
                                    <th>Input</th>
                                    <th>Value (Ω)</th>
                                    <th>Formatted</th>
                                    <th>Series</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${calculator.calculationStats.inputConversions.map(conv => `
                                    <tr>
                                        <td>${conv.input}</td>
                                        <td>${conv.value}</td>
                                        <td>${conv.formatted}</td>
                                        <td>${conv.series || 'None'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="combination-stats">
                        <h4>Combination Statistics</h4>
                        <p>Total combinations tested: ${calculator.calculationStats.totalCombinations.toLocaleString()}</p>
                        <p>Valid combinations: ${calculator.calculationStats.validCombinations.toLocaleString()}</p>
                        <div class="voltage-stats">
                            <h4>Voltage Distribution</h4>
                            <p>Above target: ${calculator.calculationStats.voltageStats.above.toLocaleString()}</p>
                            <p>Below target: ${calculator.calculationStats.voltageStats.below.toLocaleString()}</p>
                            <p>Exactly at target: ${calculator.calculationStats.voltageStats.exact.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>`;

    resultsContainer.innerHTML = output;

    // Initialize diagrams for each result
    document.querySelectorAll('.result-diagram').forEach((diagramContainer, idx) => {
        const result = displayResults[idx];
        // Helper to convert r1/r2 array to string for renderCustom
        function sectionToString(section) {
            if (Array.isArray(section)) {
                // Use the .type property if present, otherwise default to 'series'
                const type = section.type || 'series';
                return section.map(v => v).join(',') + ',' + type;
            } else {
                // Single resistor, treat as series
                return section + ',series';
            }
        }
        const topSection = sectionToString(result.r1);
        const bottomSection = sectionToString(result.r2);
        const diagram = new Diagram(diagramContainer.id, 300, 300);
        diagram.renderCustom(topSection, bottomSection);
    });

    // Add event listener for the slider after it's added to the DOM
    const slider = document.getElementById('supplyVoltageSlider');
    if (slider) {
        slider.addEventListener('input', (e) => {
            const newVoltage = parseFloat(e.target.value);
            document.getElementById('sliderValue').textContent = newVoltage.toFixed(1);
            
            // Update each result's output voltage and error
            document.querySelectorAll('.result-item').forEach(item => {
                const r1 = parseFloat(item.dataset.r1);
                const r2 = parseFloat(item.dataset.r2);
                const outputVoltage = (r2 / (r1 + r2)) * newVoltage;
                const error = outputVoltage - calculator.targetVoltage;
                
                item.querySelector('.output-voltage').textContent = outputVoltage.toFixed(2);
                item.querySelector('.error-value').textContent = `${error > 0 ? '+' : ''}${error.toFixed(2)}`;
            });
        });
    }

    // Initialize resistance filter slider with all results
    initializeResistanceFilter(allResults);
}

// Event Listeners
calculateBtn.addEventListener('click', calculateAndDisplayResults);
overshootSwitch.addEventListener('change', calculateAndDisplayResults);
document.getElementById('sortBy').addEventListener('change', calculateAndDisplayResults);

// Theme Switcher
const toggleSwitch = document.querySelector('.theme-switch input[type="checkbox"]');
const currentTheme = localStorage.getItem('theme');

if (currentTheme) {
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (currentTheme === 'dark') {
        toggleSwitch.checked = true;
    }
}

function switchTheme(e) {
    if (e.target.checked) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }    
}

toggleSwitch.addEventListener('change', switchTheme, false);

// Tooltip positioning
function positionTooltip(tooltip) {
    const tooltipText = tooltip.querySelector('.tooltip-text');
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipTextRect = tooltipText.getBoundingClientRect();
    
    // Reset any previous positioning
    tooltipText.style.bottom = '';
    tooltipText.style.top = '';
    tooltipText.style.left = '';
    tooltipText.style.right = '';
    tooltipText.style.transform = '';
    
    // Check if tooltip would go off the top of the screen
    if (tooltipRect.top - tooltipTextRect.height < 0) {
        tooltipText.style.top = '125%';
        tooltipText.style.bottom = 'auto';
        // Adjust arrow position
        tooltipText.style.setProperty('--arrow-top', 'auto');
        tooltipText.style.setProperty('--arrow-bottom', '100%');
        tooltipText.style.setProperty('--arrow-border-color', 'transparent transparent var(--input-border) transparent');
    } else {
        tooltipText.style.bottom = '125%';
        tooltipText.style.top = 'auto';
        // Adjust arrow position
        tooltipText.style.setProperty('--arrow-top', '100%');
        tooltipText.style.setProperty('--arrow-bottom', 'auto');
        tooltipText.style.setProperty('--arrow-border-color', 'var(--input-border) transparent transparent transparent');
    }
    
    // Check if tooltip would go off the left of the screen
    if (tooltipRect.left + (tooltipTextRect.width / 2) < 0) {
        tooltipText.style.left = '0';
        tooltipText.style.transform = 'none';
    }
    // Check if tooltip would go off the right of the screen
    else if (tooltipRect.right + (tooltipTextRect.width / 2) > window.innerWidth) {
        tooltipText.style.right = '0';
        tooltipText.style.left = 'auto';
        tooltipText.style.transform = 'none';
    }
    else {
        tooltipText.style.left = '50%';
        tooltipText.style.transform = 'translateX(-50%)';
    }
}

// Initialize tooltips
document.addEventListener('DOMContentLoaded', () => {
    const tooltips = document.querySelectorAll('.help-tooltip');
    
    tooltips.forEach(tooltip => {
        // Position on load
        positionTooltip(tooltip);
        
        // Position on hover/touch
        tooltip.addEventListener('mouseenter', () => positionTooltip(tooltip));
        tooltip.addEventListener('touchstart', () => positionTooltip(tooltip));
    });
    
    // Reposition on window resize
    window.addEventListener('resize', () => {
        tooltips.forEach(tooltip => positionTooltip(tooltip));
    });
});

// Add this function at the end of the file, before the last closing brace
function toggleResistorValue(element) {
    invalidateCache(); // Cache is invalid when resistor selection changes
    element.classList.toggle('disabled');
    element.classList.toggle('active');
    
    // Get all active resistor values
    const activeResistors = Array.from(document.querySelectorAll('.parsed-value-box.active'))
        .map(box => parseFloat(box.dataset.value));
    
    // Create a new calculator with only active resistors
    const calculator = new ResistorCalculator();
    
    // Parse and validate resistor values
    const errors = [];
    const warnings = [];
    
    // Add all active resistors to the calculator
    calculator.resistorValues = activeResistors;
    
    // Validate supply voltage
    const supplyResult = calculator.validateVoltage(supplyVoltageInput.value, true);
    if (!supplyResult.valid) {
        errors.push(`Supply Voltage: ${supplyResult.error}`);
    } else {
        calculator.supplyVoltage = supplyResult.value;
    }

    // Validate target voltage
    const targetResult = calculator.validateVoltage(targetVoltageInput.value);
    if (!targetResult.valid) {
        errors.push(`Target Voltage: ${targetResult.error}`);
    } else {
        calculator.targetVoltage = targetResult.value;
    }

    // Set overshoot option
    calculator.allowOvershoot = overshootSwitch.checked;

    // If there are critical errors, show them and stop
    if (errors.length > 0) {
        resultsContainer.innerHTML = `
            <div class="error">
                <h3>Errors:</h3>
                <ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>
            </div>`;
        return;
    }

    // Get results with only active resistors
    const allResults = calculator.findVoltageDividerCombinations();
    const displayResults = allResults.slice(0, 5);

    // Display results
    let output = '';
    
    // Get the original input conversions from the current display
    const originalConversions = Array.from(document.querySelectorAll('.parsed-value-box')).map(box => ({
        input: box.dataset.input || box.querySelector('.formatted').textContent,
        value: parseFloat(box.dataset.value),
        formatted: box.querySelector('.formatted').textContent,
        active: box.classList.contains('active'),
        series: box.dataset.series || normalizeAndCheckSeries(parseFloat(box.dataset.value))
    }));
    
    // Add parsed values display with original conversions
    output += `
        <div class="parsed-values">
            <h3>Available Resistors</h3>
            <div class="help-tooltip">
                ?
                <span class="tooltip-text">
                    Click a value to temporarily exclude/include it from the calculation. Colours inidicate the E series of the value
                </span>
            </div>
            <div class="parsed-values-grid">
                ${originalConversions.map((conv, index) => `
                    <div class="parsed-value-box ${conv.active ? 'active' : 'disabled'} ${conv.series ? 'series-' + conv.series.toLowerCase() : 'series-none'}" 
                         data-value="${conv.value}" 
                         data-input="${conv.input}"
                         data-series="${conv.series || ''}"
                         data-index="${index}" 
                         onclick="toggleResistorValue(this)">
                        <span class="formatted">${conv.formatted}</span>
                        <span class="box-tooltip">${conv.value} Ω<br>${conv.series ? 'Series: ' + conv.series : 'Non-standard value'}</span>
                    </div>
                `).join('')}
            </div>
            <div class="voltage-slider-section">
                <label for="supplyVoltageSlider">Quick Adjust Supply Voltage: <span id="sliderValue">${calculator.supplyVoltage}</span> V</label>
                <input type="range" id="supplyVoltageSlider" min="0" max="${calculator.supplyVoltage * 2}" step="0.1" value="${calculator.supplyVoltage}">
            </div>
        </div>`;

    output += renderResults(displayResults, calculator);

    // Add calculation details if enabled
        output += `
            <div class="details-section">
                <h3>Calculation Details</h3>
                <div class="details-content">
                    <div class="input-conversions">
                        <h4>Input Value Conversions</h4>
                        <table class="details-table">
                            <thead>
                                <tr>
                                    <th>Input</th>
                                    <th>Value (Ω)</th>
                                    <th>Formatted</th>
                                    <th>Series</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${originalConversions.map(conv => `
                                    <tr>
                                        <td>${conv.input}</td>
                                        <td>${conv.value}</td>
                                        <td>${conv.formatted}</td>
                                        <td>${conv.series || 'None'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="combination-stats">
                        <h4>Combination Statistics</h4>
                        <p>Total combinations tested: ${calculator.calculationStats.totalCombinations.toLocaleString()}</p>
                        <p>Valid combinations: ${calculator.calculationStats.validCombinations.toLocaleString()}</p>
                        <div class="voltage-stats">
                            <h4>Voltage Distribution</h4>
                            <p>Above target: ${calculator.calculationStats.voltageStats.above.toLocaleString()}</p>
                            <p>Below target: ${calculator.calculationStats.voltageStats.below.toLocaleString()}</p>
                            <p>Exactly at target: ${calculator.calculationStats.voltageStats.exact.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>`;

    resultsContainer.innerHTML = output;

    // Initialize diagrams for each result
    document.querySelectorAll('.result-diagram').forEach((diagramContainer, idx) => {
        const result = displayResults[idx];
        // Helper to convert r1/r2 array to string for renderCustom
        function sectionToString(section) {
            if (Array.isArray(section)) {
                // Use the .type property if present, otherwise default to 'series'
                const type = section.type || 'series';
                return section.map(v => v).join(',') + ',' + type;
            } else {
                // Single resistor, treat as series
                return section + ',series';
            }
        }
        const topSection = sectionToString(result.r1);
        const bottomSection = sectionToString(result.r2);
        const diagram = new Diagram(diagramContainer.id, 300, 300);
        diagram.renderCustom(topSection, bottomSection);
    });

    // Add event listener for the slider after it's added to the DOM
    const slider = document.getElementById('supplyVoltageSlider');
    if (slider) {
        slider.addEventListener('input', (e) => {
            const newVoltage = parseFloat(e.target.value);
            document.getElementById('sliderValue').textContent = newVoltage.toFixed(1);
            
            // Update each result's output voltage and error
            document.querySelectorAll('.result-item').forEach(item => {
                const r1 = parseFloat(item.dataset.r1);
                const r2 = parseFloat(item.dataset.r2);
                const outputVoltage = (r2 / (r1 + r2)) * newVoltage;
                const error = outputVoltage - calculator.targetVoltage;
                
                item.querySelector('.output-voltage').textContent = outputVoltage.toFixed(2);
                item.querySelector('.error-value').textContent = `${error > 0 ? '+' : ''}${error.toFixed(2)}`;
            });
        });
    }

    // Initialize resistance filter slider with all results
    initializeResistanceFilter(allResults);
}

// Test function for resistor value parsing
function testResistorParsing() {
    const calculator = new ResistorCalculator();
    const testCases = [
        // Decimal notation tests
        { input: "2.2k", expected: 2200, description: "Decimal notation with k" },
        { input: "43.2k", expected: 43200, description: "Decimal notation with larger number" },
        { input: "1.5M", expected: 1500000, description: "Decimal notation with M" },
        { input: "0.1k", expected: 100, description: "Decimal notation with leading zero" },
        { input: "2.2m", expected: 0.0022, description: "Decimal notation with m" },
        
        // Letter notation tests
        { input: "2k2", expected: 2200, description: "Letter notation with k" },
        { input: "43k2", expected: 43200, description: "Letter notation with larger number" },
        { input: "1M5", expected: 1500000, description: "Letter notation with M" },
        { input: "0k1", expected: 100, description: "Letter notation with leading zero" },
        { input: "2m2", expected: 0.0022, description: "Letter notation with m" },
        
        // Plain number tests
        { input: "2200", expected: 2200, description: "Plain number" },
        { input: "100", expected: 100, description: "Plain number" },
        
        // Edge cases
        { input: "1k", expected: 1000, description: "Simple k notation" },
        { input: "1M", expected: 1000000, description: "Simple M notation" },
        { input: "1R", expected: 1, description: "Simple R notation" },
        { input: "1m", expected: 0.001, description: "Simple m notation" }
    ];

    console.log("Testing resistor value parsing...");
    let passed = 0;
    let failed = 0;

    testCases.forEach(test => {
        try {
            const result = calculator.parseResistorValue(test.input);
            const success = Math.abs(result - test.expected) < 0.0001; // Use small epsilon for floating point comparison
            
            if (success) {
                console.log(`✅ PASS: ${test.description} - ${test.input} = ${result}`);
                passed++;
            } else {
                console.log(`❌ FAIL: ${test.description} - ${test.input} = ${result} (expected ${test.expected})`);
                failed++;
            }
        } catch (error) {
            console.log(`❌ ERROR: ${test.description} - ${test.input} - ${error.message}`);
            failed++;
        }
    });

    console.log(`\nTest Summary: ${passed} passed, ${failed} failed`);
}

// Run tests when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // ... existing DOMContentLoaded code ...
    
    // Run the tests
    // testResistorParsing(); // Commented out to prevent automatic test execution
});

// Add this function after the ResistorCalculator class definition
function normalizeAndCheckSeries(value) {
    // Normalize value to be between 0 and 10
    let normalized = value;
    while (normalized >= 10) {
        normalized /= 10;
    }
    while (normalized < 1 && normalized > 0) {
        normalized *= 10;
    }

    // Check if normalized value appears in any series array
    const seriesOrder = ['E24', 'E48', 'E96', 'E192'];
    for (const seriesName of seriesOrder) {
        if (resistorSeries[seriesName].includes(normalized)) {
            return seriesName;
        }
    }
    return null;
}

// Function to format resistance value in "1k2" style notation
function formatResistorValueAutofill(value) {
    if (value < 0.001) {
        // Sub-milliohm values - use scientific notation or very small decimals
        return `${(value * 1000000).toFixed(0)}µΩ`;
    } else if (value < 1) {
        // Milliohm values
        const mValue = value * 1000;
        if (mValue >= 100) {
            return `${Math.round(mValue)}m`;
        } else if (mValue >= 10) {
            const integer = Math.floor(mValue / 10);
            const decimal = Math.round(mValue % 10);
            return decimal === 0 ? `${integer * 10}m` : `${integer}m${decimal}`;
        } else {
            const integer = Math.floor(mValue);
            const decimal = Math.round((mValue - integer) * 10);
            return decimal === 0 ? `${integer}m` : `${integer}m${decimal}`;
        }
    } else if (value < 1000) {
        // Ohm values
        if (value >= 100) {
            return `${Math.round(value)}`;
        } else if (value >= 10) {
            const integer = Math.floor(value / 10);
            const decimal = Math.round(value % 10);
            return decimal === 0 ? `${integer * 10}` : `${integer}R${decimal}`;
        } else {
            const integer = Math.floor(value);
            const decimal = Math.round((value - integer) * 10);
            return decimal === 0 ? `${integer}R` : `${integer}R${decimal}`;
        }
    } else if (value < 1000000) {
        // Kiloohm values
        const kValue = value / 1000;
        if (kValue >= 100) {
            return `${Math.round(kValue)}k`;
        } else if (kValue >= 10) {
            const integer = Math.floor(kValue / 10);
            const decimal = Math.round(kValue % 10);
            return decimal === 0 ? `${integer * 10}k` : `${integer}k${decimal}`;
        } else {
            const integer = Math.floor(kValue);
            const decimal = Math.round((kValue - integer) * 10);
            return decimal === 0 ? `${integer}k` : `${integer}k${decimal}`;
        }
    } else {
        // Megaohm values
        const mValue = value / 1000000;
        if (mValue >= 100) {
            return `${Math.round(mValue)}M`;
        } else if (mValue >= 10) {
            const integer = Math.floor(mValue / 10);
            const decimal = Math.round(mValue % 10);
            return decimal === 0 ? `${integer * 10}M` : `${integer}M${decimal}`;
        } else {
            const integer = Math.floor(mValue);
            const decimal = Math.round((mValue - integer) * 10);
            return decimal === 0 ? `${integer}M` : `${integer}M${decimal}`;
        }
    }
}

// Add event listener for the autofill button
document.getElementById('autofillBtn').addEventListener('click', () => {
    // Get the multiplier from the dropdown
    const multiplier = parseFloat(document.getElementById('autofillRange').value);
    
    // Get the E24 values, multiply by the selected multiplier, and format them
    const e24Values = resistorSeries.E24.map(value => {
        const scaledValue = value * multiplier;
        return formatResistorValueAutofill(scaledValue);
    });
    
    // Join the values with commas and update the input
    resistorValuesInput.value = e24Values.join(', ');
    
    // Trigger the calculation
    calculateAndDisplayResults();
});

// Initialize resistance filter slider
function initializeResistanceFilter(results) {
    if (results.length === 0) return;
    
    // Find min and max total resistance values efficiently
    let minResistance = Infinity;
    let maxResistance = -Infinity;
    
    for (const result of results) {
        if (result.totalResistance < minResistance) {
            minResistance = result.totalResistance;
        }
        if (result.totalResistance > maxResistance) {
            maxResistance = result.totalResistance;
        }
    }
    
    // Show the filter section
    const filterSection = document.querySelector('.resistance-filter-section');
    if (filterSection) {
    filterSection.style.display = 'block';
    }
    
    // Get the slider element
    const slider = document.getElementById('resistance-slider');
    if (!slider) {
        return;
    }
    
    // Check if slider already exists and preserve current values
    let currentMin = minResistance;
    let currentMax = maxResistance;
    let sliderExists = false;
    
    if (slider.noUiSlider) {
        // Slider exists - preserve current values if they're within the new range
        const currentValues = slider.noUiSlider.get();
        const currentMinVal = parseInt(currentValues[0]);
        const currentMaxVal = parseInt(currentValues[1]);
        
        // Only preserve values if they're within the new valid range
        if (currentMinVal >= minResistance && currentMaxVal <= maxResistance) {
            currentMin = currentMinVal;
            currentMax = currentMaxVal;
        }
        
        sliderExists = true;
        slider.noUiSlider.destroy();
    } else {
        // New slider - update global resistance range to full range initially
        currentResistanceRange.min = minResistance;
        currentResistanceRange.max = maxResistance;
    }
    
    // Create the range slider
    noUiSlider.create(slider, {
        start: [currentMin, currentMax],
        behaviour: 'drag-smooth-steps-tap',
        connect: true,
        range: {
            'min': minResistance,
            'max': maxResistance
        },
        step: 1,
        format: {
            to: function (value) {
                return Math.round(value);
            },
            from: function (value) {
                return Number(value);
            }
        }
    });
    
    // Update the global range if we're preserving slider position
    if (sliderExists) {
        currentResistanceRange.min = currentMin;
        currentResistanceRange.max = currentMax;
    }
    
    // Update the display values
    const calculator = new ResistorCalculator();
    document.getElementById('resistance-min').textContent = calculator.formatResistorValue(currentMin);
    document.getElementById('resistance-max').textContent = calculator.formatResistorValue(currentMax);
    
    // Add event listener for slider changes - real-time filtering
    slider.noUiSlider.on('update', function (values, handle) {
        const minVal = parseInt(values[0]);
        const maxVal = parseInt(values[1]);
        
        // Update display values
        document.getElementById('resistance-min').textContent = calculator.formatResistorValue(minVal);
        document.getElementById('resistance-max').textContent = calculator.formatResistorValue(maxVal);
        
        // Update global range
        currentResistanceRange.min = minVal;
        currentResistanceRange.max = maxVal;
        
        // Apply real-time filtering if we have cached results
        if (resultsCache.isValid && resultsCache.allResults) {
            const filteredResults = filterAndSortResults(resultsCache.allResults, minVal, maxVal);
            
            // Update only the results section
            const resultsSection = document.querySelector('.results-section');
            if (resultsSection) {
                resultsSection.outerHTML = renderResults(filteredResults, calculator);
                
                // Reinitialize diagrams for the new results
                document.querySelectorAll('.result-diagram').forEach((diagramContainer, idx) => {
                    const result = filteredResults[idx];
                    if (result) {
                        // Helper to convert r1/r2 array to string for renderCustom
                        function sectionToString(section) {
                            if (Array.isArray(section)) {
                                const type = section.type || 'series';
                                return section.map(v => v).join(',') + ',' + type;
                            } else {
                                return section + ',series';
                            }
                        }
                        const topSection = sectionToString(result.r1);
                        const bottomSection = sectionToString(result.r2);
                        const diagram = new Diagram(diagramContainer.id, 300, 300);
                        diagram.renderCustom(topSection, bottomSection);
                    }
                });
            }
        }
    });
}

// Function to filter and sort results based on resistance range
function filterAndSortResults(allResults, minResistance, maxResistance) {
    // Filter results by resistance range
    const filteredResults = allResults.filter(result => 
        result.totalResistance >= minResistance && result.totalResistance <= maxResistance
    );
    
    // Apply sorting to filtered results
    const sortBy = document.getElementById('sortBy').value;
    let sortedResults = [...filteredResults]; // Create a copy
    
    if (sortBy === 'components') {
        // Sort by component count first, then by absolute error
        sortedResults.sort((a, b) => {
            if (a.componentCount !== b.componentCount) {
                return a.componentCount - b.componentCount;
            }
            return Math.abs(a.error) - Math.abs(b.error);
        });
    } else if (sortBy === 'totalResistanceAsc') {
        // Sort by total resistance ascending
        sortedResults.sort((a, b) => a.totalResistance - b.totalResistance);
    } else if (sortBy === 'totalResistanceDesc') {
        // Sort by total resistance descending
        sortedResults.sort((a, b) => b.totalResistance - a.totalResistance);
    } else {
        // Sort by absolute error (default)
        sortedResults.sort((a, b) => Math.abs(a.error) - Math.abs(b.error));
    }
    
    return sortedResults.slice(0, 5); // Return top 5
}

// Function to render the results display
function renderResults(displayResults, calculator) {
    if (displayResults.length === 0) {
        return `
            <div class="results-section">
                <h3>Solutions</h3>
                <div class="no-results-message">
                    <p>No results found in the selected resistance range.</p>
                    <p>Try adjusting the resistance filter or changing your input parameters.</p>
                </div>
            </div>`;
    }
    
    return `
        <div class="results-section">
            <h3>Solutions <div class="help-tooltip" style="display: inline-block; margin-left: 8px;">
                ?
                <span class="tooltip-text">
                    'Error' indicates how far this divider is away from the target Vout<br><br>
                    'Real world range' Indicates the possible range which Vout may fall in when accounting for the tolerances of real life resistors. This assumes the worst case for a given value e.g. a 1% tolerance 1K3 may exists but they are typically no worse then 5% tolerance as an E24 value
                </span>
            </div></h3>
            <div id="resultsList">
                ${displayResults.map(result => `
                    <div class="result-item" data-r1="${result.r1Value}" data-r2="${result.r2Value}">
                       <div class="result-content">
                            <table class="result-table">
                                <tbody>
                                    <tr>
                                        <td><strong>R1:</strong></td>
                                        <td>${Array.isArray(result.r1) ? `${calculator.formatResistorArray(result.r1)} = ${calculator.formatResistorValue(result.r1Value)}` : calculator.formatResistorValue(result.r1Value)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>R2:</strong></td>
                                        <td>${Array.isArray(result.r2) ? `${calculator.formatResistorArray(result.r2)} = ${calculator.formatResistorValue(result.r2Value)}` : calculator.formatResistorValue(result.r2Value)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Total Resistance:</strong></td>
                                        <td>${calculator.formatResistorValue(result.totalResistance)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Nominal Output Voltage:</strong></td>
                                        <td><span class="output-voltage">${result.outputVoltage.toFixed(2)}</span> V</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Error:</strong></td>
                                        <td><span class="error-value">${result.error > 0 ? '+' : ''}${result.error.toFixed(2)}</span> V</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Components:</strong></td>
                                        <td>${result.componentCount}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Real World Range for Vout:</strong></td>
                                        <td><span class="voltage-range">${result.voltageRange.min.toFixed(2)} V to ${result.voltageRange.max.toFixed(2)} V</span></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="result-diagram" id="diagram-${displayResults.indexOf(result)}"></div>
                    </div>
                `).join('')}
            </div>
        </div>`;
} 