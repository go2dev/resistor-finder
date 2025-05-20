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
            'K': 1000,
            'M': 1000000,
            'G': 1000000000
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

        throw new Error(`Invalid resistor value format: ${value}`);
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
}

// DOM Elements
const resistorValuesInput = document.getElementById('resistorValues');
const supplyVoltageInput = document.getElementById('supplyVoltage');
const targetVoltageInput = document.getElementById('targetVoltage');
const calculateBtn = document.getElementById('calculateBtn');
const resultsContainer = document.getElementById('results');

// Event Listeners
calculateBtn.addEventListener('click', () => {
    try {
        // Parse input values
        const calculator = new ResistorCalculator();
        const resistorValues = resistorValuesInput.value
            .split(',')
            .map(v => calculator.parseResistorValue(v))
            .filter(v => !isNaN(v));

        const supplyVoltage = parseFloat(supplyVoltageInput.value);
        const targetVoltage = parseFloat(targetVoltageInput.value);

        // Validate inputs
        if (resistorValues.length === 0) {
            throw new Error('Please enter at least one resistor value');
        }
        if (isNaN(supplyVoltage) || supplyVoltage <= 0) {
            throw new Error('Please enter a valid supply voltage');
        }
        if (isNaN(targetVoltage) || targetVoltage < 0 || targetVoltage > supplyVoltage) {
            throw new Error('Please enter a valid target voltage (must be between 0 and supply voltage)');
        }

        // Calculate combinations
        calculator.resistorValues = resistorValues;
        calculator.supplyVoltage = supplyVoltage;
        calculator.targetVoltage = targetVoltage;

        const results = calculator.findVoltageDividerCombinations();

        // Display results
        resultsContainer.innerHTML = results.map(result => `
            <div class="result-item">
                <p><strong>R1:</strong> ${calculator.formatResistorArray(result.r1)} (${calculator.formatResistorValue(result.r1Value)})</p>
                <p><strong>R2:</strong> ${calculator.formatResistorArray(result.r2)} (${calculator.formatResistorValue(result.r2Value)})</p>
                <p><strong>Output Voltage:</strong> ${result.outputVoltage.toFixed(2)} V</p>
                <p><strong>Error:</strong> ${result.error.toFixed(2)} V</p>
            </div>
        `).join('');

    } catch (error) {
        resultsContainer.innerHTML = `<div class="error">${error.message}</div>`;
    }
}); 