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

    // Calculate total number of components in a result
    getComponentCount(result) {
        const r1Count = Array.isArray(result.r1) ? result.r1.length : 1;
        const r2Count = Array.isArray(result.r2) ? result.r2.length : 1;
        return r1Count + r2Count;
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

        for (let r1 of combinations) {
            for (let r2 of combinations) {
                const r1Value = Array.isArray(r1) ? this.calculateSeriesResistance(r1) : r1;
                const r2Value = Array.isArray(r2) ? this.calculateSeriesResistance(r2) : r2;
                
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
                    
                    results.push({
                        r1: r1,
                        r2: r2,
                        r1Value: r1Value,
                        r2Value: r2Value,
                        outputVoltage: outputVoltage,
                        error: error,
                        componentCount: this.getComponentCount({ r1, r2 })
                    });
                }
            }
        }

        // Get the selected sort option
        const sortBy = document.querySelector('input[name="sortBy"]:checked').value;
        
        // Sort results based on the selected option
        if (sortBy === 'components') {
            // Sort by component count first, then by absolute error
            results.sort((a, b) => {
                if (a.componentCount !== b.componentCount) {
                    return a.componentCount - b.componentCount;
                }
                return Math.abs(a.error) - Math.abs(b.error);
            });
        } else {
            // Sort by absolute error
            results.sort((a, b) => Math.abs(a.error) - Math.abs(b.error));
        }

        return results.slice(0, 5);
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
const showDetailsSwitch = document.getElementById('showDetails');

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
            calculator.calculationStats.inputConversions.push({
                input: value,
                value: result.value,
                formatted: calculator.formatResistorValue(result.value),
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
        output += `
            <div class="parsed-values">
                <h3>Variables</h3>
                <div class="parsed-values-grid">
                    ${calculator.calculationStats.inputConversions.map((conv, index) => `
                        <div class="parsed-value-box ${conv.active !== false ? 'active' : 'disabled'}" 
                             data-value="${conv.value}" 
                             data-index="${index}" 
                             onclick="toggleResistorValue(this)">
                            <span class="value">${conv.value} Ω</span>
                            <span class="formatted">(${conv.formatted})</span>
                        </div>
                    `).join('')}
                </div>
                <div class="voltage-slider-section">
                    <label for="supplyVoltageSlider">Quick Adjust Supply Voltage: <span id="sliderValue">${calculator.supplyVoltage}</span> V</label>
                    <input type="range" id="supplyVoltageSlider" min="0" max="${calculator.supplyVoltage * 2}" step="0.1" value="${calculator.supplyVoltage}">
                </div>
            </div>`;
    }

    // Add calculation details if enabled
    if (showDetailsSwitch.checked) {
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
                                </tr>
                            </thead>
                            <tbody>
                                ${calculator.calculationStats.inputConversions.map(conv => `
                                    <tr>
                                        <td>${conv.input}</td>
                                        <td>${conv.value}</td>
                                        <td>${conv.formatted}</td>
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
    }

    output += `
        <div class="results-section">
            <h3>Results</h3>
            <div id="resultsList">
                ${results.map(result => `
                    <div class="result-item" data-r1="${result.r1Value}" data-r2="${result.r2Value}">
                        <p><strong>R1:</strong> ${calculator.formatResistorArray(result.r1)} (${calculator.formatResistorValue(result.r1Value)})</p>
                        <p><strong>R2:</strong> ${calculator.formatResistorArray(result.r2)} (${calculator.formatResistorValue(result.r2Value)})</p>
                        <p><strong>Output Voltage:</strong> <span class="output-voltage">${result.outputVoltage.toFixed(2)}</span> V</p>
                        <p><strong>Error:</strong> <span class="error-value">${result.error > 0 ? '+' : ''}${result.error.toFixed(2)}</span> V</p>
                        <p><strong>Components:</strong> ${result.componentCount}</p>
                    </div>
                `).join('')}
            </div>
        </div>`;

    resultsContainer.innerHTML = output;

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
}

// Event Listeners
calculateBtn.addEventListener('click', calculateAndDisplayResults);
overshootSwitch.addEventListener('change', calculateAndDisplayResults);
showDetailsSwitch.addEventListener('change', calculateAndDisplayResults);
document.querySelectorAll('input[name="sortBy"]').forEach(radio => {
    radio.addEventListener('change', calculateAndDisplayResults);
});

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
    const results = calculator.findVoltageDividerCombinations();

    // Display results
    let output = '';
    
    // Get the original input conversions from the current display
    const originalConversions = Array.from(document.querySelectorAll('.parsed-value-box')).map(box => ({
        input: box.querySelector('.value').textContent.replace(' Ω', ''),
        value: parseFloat(box.dataset.value),
        formatted: box.querySelector('.formatted').textContent.replace(/[()]/g, ''),
        active: box.classList.contains('active')
    }));
    
    // Add parsed values display with original conversions
    output += `
        <div class="parsed-values">
            <h3>Variables</h3>
            <div class="parsed-values-grid">
                ${originalConversions.map((conv, index) => `
                    <div class="parsed-value-box ${conv.active ? 'active' : 'disabled'}" 
                         data-value="${conv.value}" 
                         data-index="${index}" 
                         onclick="toggleResistorValue(this)">
                        <span class="value">${conv.value} Ω</span>
                        <span class="formatted">(${conv.formatted})</span>
                    </div>
                `).join('')}
            </div>
            <div class="voltage-slider-section">
                <label for="supplyVoltageSlider">Quick Adjust Supply Voltage: <span id="sliderValue">${calculator.supplyVoltage}</span> V</label>
                <input type="range" id="supplyVoltageSlider" min="0" max="${calculator.supplyVoltage * 2}" step="0.1" value="${calculator.supplyVoltage}">
            </div>
        </div>`;

    // Add calculation details if enabled
    if (showDetailsSwitch.checked) {
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
                                </tr>
                            </thead>
                            <tbody>
                                ${originalConversions.map(conv => `
                                    <tr>
                                        <td>${conv.input}</td>
                                        <td>${conv.value}</td>
                                        <td>${conv.formatted}</td>
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
    }

    output += `
        <div class="results-section">
            <h3>Results</h3>
            <div id="resultsList">
                ${results.map(result => `
                    <div class="result-item" data-r1="${result.r1Value}" data-r2="${result.r2Value}">
                        <p><strong>R1:</strong> ${calculator.formatResistorArray(result.r1)} (${calculator.formatResistorValue(result.r1Value)})</p>
                        <p><strong>R2:</strong> ${calculator.formatResistorArray(result.r2)} (${calculator.formatResistorValue(result.r2Value)})</p>
                        <p><strong>Output Voltage:</strong> <span class="output-voltage">${result.outputVoltage.toFixed(2)}</span> V</p>
                        <p><strong>Error:</strong> <span class="error-value">${result.error > 0 ? '+' : ''}${result.error.toFixed(2)}</span> V</p>
                        <p><strong>Components:</strong> ${result.componentCount}</p>
                    </div>
                `).join('')}
            </div>
        </div>`;

    resultsContainer.innerHTML = output;

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
} 