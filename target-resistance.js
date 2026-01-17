// Target resistance calculator logic
const resistorValuesInput = document.getElementById('resistorValues');
const targetResistanceInput = document.getElementById('targetResistance');
const calculateBtn = document.getElementById('calculateBtn');
const sortBySelect = document.getElementById('sortBy');
const resultsContainer = document.getElementById('results');

function formatCombination(combo) {
    const formatSection = (section) => {
        if (!Array.isArray(section)) {
            return ResistorUtils.formatResistorValue(section.value ?? section);
        }
        const type = section.type || 'series';
        const values = section.map(item => formatSection(item));
        const joined = values.join(type === 'parallel' ? ' || ' : ' + ');
        return type === 'parallel' ? `(${joined})` : joined;
    };
    return formatSection(combo);
}

function wrapText(text, maxLength = 32) {
    if (text.length <= maxLength) return [text];
    const parts = text.split(' + ');
    const lines = [];
    let current = '';
    parts.forEach(part => {
        const next = current ? `${current} + ${part}` : part;
        if (next.length > maxLength && current) {
            lines.push(current);
            current = part;
        } else {
            current = next;
        }
    });
    if (current) lines.push(current);
    return lines;
}

function generateCombinations(resistors, options = {}) {
    const maxParallel = options.maxParallel ?? 5;
    const maxSeriesBlocks = options.maxSeriesBlocks ?? 5;
    const maxBlocks = options.maxBlocks ?? 250;
    const maxCombos = options.maxCombos ?? 20000;
    const targetValue = options.targetValue ?? null;
    const blocks = [];

    const buildIndexCombos = (startIdx, depth, targetDepth, current, result) => {
        if (depth === targetDepth) {
            result.push([...current]);
            return;
        }
        for (let i = startIdx; i < resistors.length; i++) {
            current.push(i);
            buildIndexCombos(i, depth + 1, targetDepth, current, result);
            current.pop();
        }
    };

    // Single resistors
    resistors.forEach(resistor => blocks.push(resistor));

    // Parallel blocks up to maxParallel
    for (let size = 2; size <= maxParallel; size++) {
        const combos = [];
        buildIndexCombos(0, 0, size, [], combos);
        combos.forEach(indices => {
            const parallel = indices.map(idx => resistors[idx]);
            parallel.type = 'parallel';
            blocks.push(parallel);
        });
    }

    let filteredBlocks = blocks;
    if (targetValue) {
        filteredBlocks = blocks
            .map(block => ({
                block,
                resistance: resistanceOf(block),
                diff: Math.abs(resistanceOf(block) - targetValue)
            }))
            .sort((a, b) => a.diff - b.diff);

        const topBlocks = filteredBlocks.slice(0, maxBlocks);
        const extremes = filteredBlocks.slice(0, Math.min(5, filteredBlocks.length))
            .concat(filteredBlocks.slice(-5));
        const unique = new Map();
        topBlocks.concat(extremes).forEach(entry => {
            unique.set(entry.block, entry);
        });
        filteredBlocks = Array.from(unique.values()).map(entry => entry.block);
    }

    const combinations = [];
    let comboCount = 0;

    for (let size = 1; size <= maxSeriesBlocks; size++) {
        const combos = [];
        buildIndexCombos(0, 0, size, [], combos);
        combos.forEach(indices => {
            if (comboCount >= maxCombos) return;
            if (size === 1) {
                combinations.push(filteredBlocks[indices[0]]);
                comboCount += 1;
                return;
            }
            const series = indices.map(idx => filteredBlocks[idx]);
            series.type = 'series';
            combinations.push(series);
            comboCount += 1;
        });
        if (comboCount >= maxCombos) break;
    }

    return combinations;
}

function resistanceOf(section) {
    if (!Array.isArray(section)) {
        return section.value ?? section;
    }
    const type = section.type || 'series';
    if (type === 'parallel') {
        const reciprocal = section.reduce((sum, item) => sum + 1 / resistanceOf(item), 0);
        return 1 / reciprocal;
    }
    return section.reduce((sum, item) => sum + resistanceOf(item), 0);
}

function countComponents(section) {
    if (!Array.isArray(section)) return 1;
    return section.reduce((sum, item) => sum + countComponents(item), 0);
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

    const combos = generateCombinations(resistors, {
        maxParallel: 10,
        maxSeriesBlocks: 10,
        maxBlocks: 2048,
        maxCombos: 200000,
        targetValue
    });
    const results = combos.map(combo => {
        const totalResistance = resistanceOf(combo);
        const errorPercent = ((totalResistance - targetValue) / targetValue) * 100;
        return {
            combo,
            totalResistance,
            error: totalResistance - targetValue,
            errorPercent,
            componentCount: countComponents(combo)
        };
    });

    const sortBy = sortBySelect?.value || 'error';
    results.sort((a, b) => {
        if (sortBy === 'components') {
            if (a.componentCount !== b.componentCount) {
                return a.componentCount - b.componentCount;
            }
            return Math.abs(a.error) - Math.abs(b.error);
        }
        if (sortBy === 'totalResistanceAsc') {
            return a.totalResistance - b.totalResistance;
        }
        if (sortBy === 'totalResistanceDesc') {
            return b.totalResistance - a.totalResistance;
        }
        return Math.abs(a.error) - Math.abs(b.error);
    });

    const topResults = results.slice(0, 5);

    let output = '';
    if (warnings.length > 0) {
        const warningRows = warnings.map(w => {
            let inputLabel = 'Input';
            let value = '';
            let issue = w;
            if (w.includes(' ignored: ')) {
                const [input, rest] = w.split(' ignored: ');
                issue = rest;
                inputLabel = input.substring(0, input.lastIndexOf(' '));
                value = input.split(' ').pop();
            } else if (w.includes(': ')) {
                const parts = w.split(': ');
                inputLabel = parts[0];
                issue = parts.slice(1).join(': ');
            }
            return `
                <tr>
                    <td>${inputLabel}</td>
                    <td>${value}</td>
                    <td>${issue}</td>
                </tr>
            `;
        }).join('');

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
                        ${warningRows}
                    </tbody>
                </table>
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
                                        <td><strong>Error (abs):</strong></td>
                                        <td>${ResistorUtils.formatResistorValue(Math.abs(result.error))} (${Math.abs(result.errorPercent).toFixed(2)}%)</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Components:</strong></td>
                                        <td>${result.componentCount}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="result-diagram" id="diagram-${topResults.indexOf(result)}"></div>
                    </div>
                `).join('')}
            </div>
        </div>`;

    resultsContainer.innerHTML = output;
    initializeTargetDiagrams(topResults);
}

function initializeTargetDiagrams(results) {
    results.forEach((result, index) => {
        const diagramContainer = document.getElementById(`diagram-${index}`);
        if (!diagramContainer) return;
        const comboText = formatCombination(result.combo);
        const lines = wrapText(comboText).concat(
            [`Total: ${ResistorUtils.formatResistorValue(result.totalResistance)}`]
        );
        const diagram = new Diagram(diagramContainer.id, 300, 160);
        diagram.renderTextDiagram(lines, 'Target Network');
    });
}

calculateBtn.addEventListener('click', calculateResults);
if (sortBySelect) {
    sortBySelect.addEventListener('change', calculateResults);
}

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
const appVersionEl = document.getElementById('appVersion');

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

function initializeAppVersion() {
    if (!appVersionEl) return;
    const cacheBust = Date.now();
    fetch(`version.json?cb=${cacheBust}`)
        .then(response => response.ok ? response.json() : null)
        .then(data => {
            if (data && data.version) {
                appVersionEl.textContent = data.version;
            }
        })
        .catch(() => {});
}

initializeTheme();
initializeAppVersion();
if (toggleSwitch) {
    toggleSwitch.addEventListener('change', (e) => {
        setTheme(e.target.checked ? 'dark' : 'light');
    });
}
