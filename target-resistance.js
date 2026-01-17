// Target resistance calculator logic
const resistorValuesInput = document.getElementById('resistorValues');
const targetResistanceInput = document.getElementById('targetResistance');
const calculateBtn = document.getElementById('calculateBtn');
const resultsContainer = document.getElementById('results');

function formatCombination(combo) {
    if (!Array.isArray(combo)) {
        return ResistorUtils.formatResistorValue(combo.value ?? combo);
    }
    const type = combo.type || 'series';
    const values = combo.map(r => ResistorUtils.formatResistorValue(r.value ?? r));
    const joined = values.join(type === 'parallel' ? ' || ' : ' + ');
    return type === 'parallel' ? `(${joined})` : joined;
}

function generateCombinations(resistors, maxCount = 3) {
    const combinations = [];
    resistors.forEach(resistor => combinations.push(resistor));

    for (let i = 0; i < resistors.length; i++) {
        for (let j = i; j < resistors.length; j++) {
            const series = [resistors[i], resistors[j]];
            series.type = 'series';
            combinations.push(series);

            const parallel = [resistors[i], resistors[j]];
            parallel.type = 'parallel';
            combinations.push(parallel);
        }
    }

    if (maxCount >= 3) {
        for (let i = 0; i < resistors.length; i++) {
            for (let j = i; j < resistors.length; j++) {
                for (let k = j; k < resistors.length; k++) {
                    const series = [resistors[i], resistors[j], resistors[k]];
                    series.type = 'series';
                    combinations.push(series);

                    const parallel = [resistors[i], resistors[j], resistors[k]];
                    parallel.type = 'parallel';
                    combinations.push(parallel);
                }
            }
        }
    }

    return combinations;
}

function parseResistorList(values, options) {
    const warnings = [];
    const resistors = [];
    values.forEach((value, index) => {
        if (!value) return;
        try {
            const parsed = ResistorUtils.parseResistorInput(value, options);
            if (parsed.value <= 0) {
                warnings.push(`Resistor ${index + 1} ${value} ignored: value must be positive`);
                return;
            }
            if (parsed.warnings && parsed.warnings.length > 0) {
                parsed.warnings.forEach(warning => warnings.push(`Resistor ${index + 1} ${value}: ${warning}`));
            }
            resistors.push({
                id: index,
                value: parsed.value,
                tolerance: parsed.tolerance,
                powerRating: parsed.powerRating,
                powerCode: parsed.powerCode,
                series: parsed.series || ResistorUtils.findResistorSeries(parsed.value),
                formatted: ResistorUtils.formatResistorValue(parsed.value),
                input: value,
                source: parsed.source
            });
        } catch (error) {
            warnings.push(`Resistor ${index + 1} ${value} ignored: ${error.message}`);
        }
    });

    return { resistors, warnings };
}

function calculateResults() {
    const warnings = [];
    const resistorInputs = resistorValuesInput.value.split(',').map(v => v.trim());
    const snapToSeries = document.getElementById('snapToSeries')?.checked;
    const snapSeries = document.getElementById('autofillSeries')?.value || 'E24';

    const { resistors, warnings: parseWarnings } = parseResistorList(resistorInputs, {
        snapToSeries,
        snapSeries
    });
    warnings.push(...parseWarnings);

    if (!resistors.length) {
        warnings.push('At least one valid resistor value is required');
    }

    let targetValue;
    try {
        const parsedTarget = ResistorUtils.parseResistorInput(targetResistanceInput.value, {
            snapToSeries,
            snapSeries
        });
        targetValue = parsedTarget.value;
        if (parsedTarget.warnings && parsedTarget.warnings.length > 0) {
            parsedTarget.warnings.forEach(warning => warnings.push(`Target resistance: ${warning}`));
        }
    } catch (error) {
        warnings.push(`Target resistance ignored: ${error.message}`);
    }

    if (!targetValue || targetValue <= 0) {
        resultsContainer.innerHTML = `
            <div class="error">
                <h3>Errors:</h3>
                <ul>${warnings.map(w => `<li>${w}</li>`).join('')}</ul>
            </div>`;
        return;
    }

    const combos = generateCombinations(resistors, 3);
    const results = combos.map(combo => {
        const totalResistance = ResistorUtils.calculateTotalResistance(combo);
        return {
            combo,
            totalResistance,
            error: totalResistance - targetValue,
            componentCount: Array.isArray(combo) ? combo.length : 1
        };
    });

    results.sort((a, b) => {
        const aErr = Math.abs(a.error);
        const bErr = Math.abs(b.error);
        if (aErr !== bErr) return aErr - bErr;
        return a.componentCount - b.componentCount;
    });

    const topResults = results.slice(0, 5);

    let output = '';
    if (warnings.length > 0) {
        output += `
            <div class="warning">
                <h3>Warnings</h3>
                <ul>${warnings.map(w => `<li>${w}</li>`).join('')}</ul>
            </div>`;
    }

    output += `
        <div class="results-section">
            <h3>Closest Matches</h3>
            <div id="resultsList">
                ${topResults.map(result => `
                    <div class="result-item">
                        <div class="result-content">
                            <table class="result-table">
                                <tbody>
                                    <tr>
                                        <td><strong>Combination:</strong></td>
                                        <td>${formatCombination(result.combo)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Total Resistance:</strong></td>
                                        <td>${ResistorUtils.formatResistorValue(result.totalResistance)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Error:</strong></td>
                                        <td>${result.error > 0 ? '+' : ''}${result.error.toFixed(2)} Ω</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Components:</strong></td>
                                        <td>${result.componentCount}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;

    resultsContainer.innerHTML = output;
}

calculateBtn.addEventListener('click', calculateResults);

document.getElementById('autofillBtn').addEventListener('click', () => {
    const multiplier = parseFloat(document.getElementById('autofillRange').value);
    const seriesSelect = document.getElementById('autofillSeries');
    const selectedSeries = seriesSelect ? seriesSelect.value : 'E24';
    const seriesValues = ResistorUtils.series[selectedSeries] || ResistorUtils.series.E24;
    const formattedValues = seriesValues.map(value => {
        const scaledValue = value * multiplier;
        const formatted = ResistorUtils.formatResistorValue(scaledValue);
        return formatted.replace('Ω', 'R');
    });
    resistorValuesInput.value = formattedValues.join(', ');
    calculateResults();
});

document.getElementById('autofillJlcBtn').addEventListener('click', () => {
    resistorValuesInput.value = ResistorUtils.luts.JLC_BASIC.join(', ');
    calculateResults();
});

document.getElementById('snapToSeries').addEventListener('change', calculateResults);

// Theme Switcher
const toggleSwitch = document.getElementById('checkbox');

function getSystemThemePreference() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (toggleSwitch) {
        toggleSwitch.checked = theme === 'dark';
    }
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        setTheme(getSystemThemePreference());
    }
}

initializeTheme();
if (toggleSwitch) {
    toggleSwitch.addEventListener('change', (e) => {
        setTheme(e.target.checked ? 'dark' : 'light');
    });
}
