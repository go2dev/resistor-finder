class ResistorCalculator {
    constructor() {
        this.resistorValues = [];
        this.supplyVoltage = 0;
        this.targetVoltage = 0;
        this.results = [];
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

        // Match patterns like "1K", "5K1", "200R", etc.
        const match = value.match(/^(\d+)([kKmMgGrR])(\d*)$/);
        if (match) {
            const [, whole, unit, decimal] = match;
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
            { value: 1, symbol: 'R' },
            { value: 1e-3, symbol: 'm'}
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
        return resistors.map(r => this.formatResistorValue(r)).join(' + ');
    }

    // Calculate equivalent resistance for resistors in series
    calculateSeriesResistance(resistors) {
        return resistors.reduce((sum, r) => sum + r, 0);
    }

    // Calculate equivalent resistance for resistors in parallel
    calculateParallelResistance(resistors) {
        return 1 / resistors.reduce((sum, r) => sum + (1 / r), 0);
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
            combinations.push([r]);
        }

        // Series combinations
        for (let i = 0; i < resistors.length; i++) {
            for (let j = i; j < resistors.length; j++) {
                const series = this.calculateSeriesResistance([resistors[i], resistors[j]]);
                combinations.push([resistors[i], resistors[j]]);
            }
        }

        // Parallel combinations
        for (let i = 0; i < resistors.length; i++) {
            for (let j = i; j < resistors.length; j++) {
                const parallel = this.calculateParallelResistance([resistors[i], resistors[j]]);
                combinations.push([resistors[i], resistors[j]]);
            }
        }

        return combinations;
    }

    // Find voltage divider combinations
    findVoltageDividerCombinations() {
        const combinations = this.generateCombinations(this.resistorValues);
        const results = [];

        for (let r1 of combinations) {
            for (let r2 of combinations) {
                const r1Value = Array.isArray(r1) ? this.calculateSeriesResistance(r1) : r1;
                const r2Value = Array.isArray(r2) ? this.calculateSeriesResistance(r2) : r2;
                
                const outputVoltage = this.calculateOutputVoltage(r1Value, r2Value, this.supplyVoltage);
                const error = Math.abs(outputVoltage - this.targetVoltage);
                
                results.push({
                    r1: r1,
                    r2: r2,
                    r1Value: r1Value,
                    r2Value: r2Value,
                    outputVoltage: outputVoltage,
                    error: error
                });
            }
        }

        // Sort by error and return top 5 results
        return results.sort((a, b) => a.error - b.error).slice(0, 5);
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
const targetVoltageInput = document.getElementById('targetVoltage');
const calculateBtn = document.getElementById('calculateBtn');
const resultsContainer = document.getElementById('results');

// Event Listeners
calculateBtn.addEventListener('click', () => {
    const calculator = new ResistorCalculator();
    const errors = [];
    const warnings = [];
    
    // Parse and validate resistor values
    const resistorInputs = resistorValuesInput.value.split(',').map(v => v.trim());
    const validResistors = [];
    
    resistorInputs.forEach((value, index) => {
        if (!value) return; // Skip empty values
        const result = calculator.validateResistorValue(value);
        if (result.valid) {
            validResistors.push(result.value);
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
    const results = calculator.findVoltageDividerCombinations();

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
                            // Extract the value from the input (everything after the last space)
                            const value = input.split(' ').pop();
                            // Get the input label (everything before the last space)
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

    output += `
        <div class="results-section">
            <h3>Results</h3>
            ${results.map(result => `
                <div class="result-item">
                    <p><strong>R1:</strong> ${calculator.formatResistorArray(result.r1)} (${calculator.formatResistorValue(result.r1Value)})</p>
                    <p><strong>R2:</strong> ${calculator.formatResistorArray(result.r2)} (${calculator.formatResistorValue(result.r2Value)})</p>
                    <p><strong>Output Voltage:</strong> ${result.outputVoltage.toFixed(2)} V</p>
                    <p><strong>Error:</strong> ${result.error.toFixed(2)} V</p>
                </div>
            `).join('')}
        </div>`;

    resultsContainer.innerHTML = output;
}); 