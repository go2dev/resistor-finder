// Target resistance calculator logic
const resistorValuesInput = document.getElementById('resistorValues');
const targetResistanceInput = document.getElementById('targetResistance');
const calculateBtn = document.getElementById('calculateBtn');
const sortBySelect = document.getElementById('sortBy');
const resultsContainer = document.getElementById('results');
const loadingSpinner = document.getElementById('loadingSpinner');
const resistorTolerances = ResistorUtils.resistorTolerances;
const resultsCache = new Map();
const inflightCalculations = new Map();

const LIMITS = {
    maxParallel: 10,
    maxSeriesBlocks: 10,
    maxBlocks: 2048,
    maxCombos: 200000,
    maxParallelCombos: 1000000,
    maxInputResistors: 60
};

function normalizeResistorInput(value) {
    return value.trim().toLowerCase();
}

function buildCacheKey(resistorInputs, targetValue, snapToSeries, snapSeries, activeKeys = []) {
    return JSON.stringify({
        resistors: resistorInputs.map(input => normalizeResistorInput(input)),
        target: normalizeResistorInput(targetValue),
        snapToSeries,
        snapSeries,
        activeKeys: activeKeys.slice().sort()
    });
}

function getActiveKeyMap() {
    const map = new Map();
    document.querySelectorAll('.parsed-value-box').forEach(box => {
        const key = box.dataset.key || box.dataset.input || box.dataset.id;
        if (!key) return;
        map.set(key, box.classList.contains('active'));
    });
    return map;
}

function resultUsesResistorKey(section, resistorKey) {
    if (!section) return false;
    if (!Array.isArray(section)) {
        return (section?.key ?? section?.id ?? null) === resistorKey;
    }
    return section.some(item => resultUsesResistorKey(item, resistorKey));
}

function filterResultsByActiveKeys(allResults, activeKeys) {
    const activeSet = new Set(activeKeys);
    const allKeys = Array.from(document.querySelectorAll('.parsed-value-box'))
        .map(box => box.dataset.key || box.dataset.input || box.dataset.id)
        .filter(Boolean);
    const excludedKeys = allKeys.filter(key => !activeSet.has(key));
    if (excludedKeys.length === 0) return allResults;

    return allResults.filter(result => {
        for (const excludedKey of excludedKeys) {
            if (resultUsesResistorKey(result.combo, excludedKey)) {
                return false;
            }
        }
        return true;
    });
}

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

function estimateComboCount(valueCount, comboSize, cap = Number.MAX_SAFE_INTEGER) {
    if (comboSize <= 1) return valueCount;
    let total = 1;
    for (let i = 1; i <= comboSize; i++) {
        total = (total * (valueCount + i - 1)) / i;
        if (total > cap) return cap + 1;
    }
    return total;
}

function getResistorSignature(resistor) {
    if (resistor == null) return 'R:';
    const value = resistor.value ?? resistor;
    const tolerance = resistor.tolerance ?? '';
    const series = resistor.series ?? '';
    const powerRating = resistor.powerRating ?? '';
    const powerCode = resistor.powerCode ?? '';
    return `R:${value}|${tolerance}|${series}|${powerRating}|${powerCode}`;
}

function collectFlattenedChildren(section, type, bucket) {
    section.forEach(child => {
        if (Array.isArray(child) && (child.type || 'series') === type) {
            collectFlattenedChildren(child, type, bucket);
        } else {
            bucket.push(child);
        }
    });
}

function getComboSignature(section) {
    if (!Array.isArray(section)) {
        return getResistorSignature(section);
    }
    const type = section.type || 'series';
    const flattened = [];
    collectFlattenedChildren(section, type, flattened);
    const signatures = flattened.map(getComboSignature).sort();
    return `${type}(${signatures.join(',')})`;
}

function dedupeResults(results) {
    const seen = new Set();
    const deduped = [];
    results.forEach(result => {
        const signature = result?.combo ? getComboSignature(result.combo) : `${result?.comboLabel ?? ''}|${result?.totalResistance ?? ''}`;
        if (seen.has(signature)) return;
        seen.add(signature);
        deduped.push(result);
    });
    return deduped;
}

function generateCombinations(resistors, options = {}) {
    const maxParallel = options.maxParallel ?? 5;
    const maxSeriesBlocks = options.maxSeriesBlocks ?? 5;
    const maxBlocks = options.maxBlocks ?? 250;
    const maxCombos = options.maxCombos ?? 20000;
    const maxParallelCombos = options.maxParallelCombos ?? 1000000;
    const targetValue = options.targetValue ?? null;
    const blocks = [];
    const singleBounds = buildSingleBounds(resistors);
    let prunedBlocks = 0;
    let prunedCombos = 0;

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
        if (estimateComboCount(resistors.length, size, maxParallelCombos) > maxParallelCombos) {
            break;
        }
        const combos = [];
        buildIndexCombos(0, 0, size, [], combos);
        combos.forEach(indices => {
            const parallel = indices.map(idx => resistors[idx]);
            parallel.type = 'parallel';
            const bounds = calculateSectionBounds(parallel);
            if (overlapsSingle(bounds, singleBounds)) {
                prunedBlocks += 1;
                return;
            }
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

    filteredBlocks.forEach(block => {
        if (comboCount >= maxCombos) return;
        if (Array.isArray(block)) return;
        for (let size = 2; size <= maxSeriesBlocks; size++) {
            if (comboCount >= maxCombos) return;
            const series = Array.from({ length: size }, () => block);
            series.type = 'series';
            const bounds = calculateSectionBounds(series);
            if (overlapsSingle(bounds, singleBounds)) {
                prunedCombos += 1;
                continue;
            }
            combinations.push(series);
            comboCount += 1;
        }
    });

    for (let size = 1; size <= maxSeriesBlocks; size++) {
        if (estimateComboCount(resistors.length, size, maxCombos) > maxCombos) {
            break;
        }
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
            const bounds = calculateSectionBounds(series);
            if (overlapsSingle(bounds, singleBounds)) {
                prunedCombos += 1;
                return;
            }
            combinations.push(series);
            comboCount += 1;
        });
        if (comboCount >= maxCombos) break;
    }

    return {
        combinations,
        stats: {
            blockCount: filteredBlocks.length,
            comboCount: combinations.length,
            prunedBlocks,
            prunedCombos,
            maxParallel,
            maxSeriesBlocks,
            maxBlocks,
            maxCombos
        }
    };
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

function applyResistorHeuristic(resistors, targetValue, limit) {
    if (!targetValue || resistors.length <= limit) {
        return {
            resistors,
            trimmed: false,
            removedCount: 0
        };
    }

    const sortedByDiff = resistors
        .map(resistor => ({
            resistor,
            diff: Math.abs(resistor.value - targetValue)
        }))
        .sort((a, b) => a.diff - b.diff);

    const selection = new Map();
    sortedByDiff.slice(0, limit).forEach(entry => {
        selection.set(entry.resistor.id, entry.resistor);
    });

    const sortedByValue = resistors.slice().sort((a, b) => a.value - b.value);
    sortedByValue.slice(0, 3).forEach(resistor => selection.set(resistor.id, resistor));
    sortedByValue.slice(-3).forEach(resistor => selection.set(resistor.id, resistor));

    let filtered = Array.from(selection.values());
    if (filtered.length > limit) {
        filtered = filtered
            .map(resistor => ({
                resistor,
                diff: Math.abs(resistor.value - targetValue)
            }))
            .sort((a, b) => a.diff - b.diff)
            .slice(0, limit)
            .map(entry => entry.resistor);
    }

    return {
        resistors: filtered,
        trimmed: filtered.length < resistors.length,
        removedCount: resistors.length - filtered.length
    };
}

function getEffectiveLimits(resistorCount) {
    let maxParallel = LIMITS.maxParallel;
    if (resistorCount > 20) maxParallel = Math.min(maxParallel, 7);
    if (resistorCount > 30) maxParallel = Math.min(maxParallel, 6);
    if (resistorCount > 40) maxParallel = Math.min(maxParallel, 5);
    if (resistorCount > 55) maxParallel = Math.min(maxParallel, 4);
    if (resistorCount > 70) maxParallel = Math.min(maxParallel, 3);
    return {
        ...LIMITS,
        maxParallel
    };
}

function buildSingleBounds(resistors) {
    return resistors.map(resistor => ({
        lower: calculateResistorBounds(resistor).lower,
        upper: calculateResistorBounds(resistor).upper
    }));
}

function overlapsSingle(bounds, singleBounds) {
    return singleBounds.some(single => bounds.lower <= single.upper && bounds.upper >= single.lower);
}

function applyErrorFilter(results, maxPercent) {
    const within = results.filter(result => Number.isFinite(result.errorPercent) && Math.abs(result.errorPercent) <= maxPercent);
    if (within.length > 0) {
        return { results: within, fallbackUsed: false };
    }
    return { results, fallbackUsed: true };
}

function getSafeResistanceRange(section) {
    const range = calculateSectionBounds(section);
    if (!Number.isFinite(range.lower) || !Number.isFinite(range.upper)) {
        const total = resistanceOf(section);
        if (Number.isFinite(total)) {
            return { lower: total, upper: total };
        }
        return null;
    }
    return range;
}

function sortResults(results, sortBy) {
    return results.sort((a, b) => {
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
}

function calculateResistorBounds(resistor) {
    const value = resistor.value ?? resistor;
    let tolerance = resistor.tolerance;
    if (tolerance == null) {
        const seriesName = resistor.series || ResistorUtils.findResistorSeries(value);
        tolerance = seriesName ? resistorTolerances[seriesName] : 0;
    }
    const multiplier = tolerance / 100;
    return {
        lower: value * (1 - multiplier),
        upper: value * (1 + multiplier)
    };
}

function calculateSectionBounds(section) {
    if (!Array.isArray(section)) {
        return calculateResistorBounds(section);
    }

    const type = section.type || 'series';
    const bounds = section.map(resistor => calculateResistorBounds(resistor));

    if (type === 'parallel') {
        const min = 1 / bounds.reduce((sum, b) => sum + (1 / b.lower), 0);
        const max = 1 / bounds.reduce((sum, b) => sum + (1 / b.upper), 0);
        return { lower: min, upper: max };
    }

    const lower = bounds.reduce((sum, b) => sum + b.lower, 0);
    const upper = bounds.reduce((sum, b) => sum + b.upper, 0);
    return { lower, upper };
}

function showLoadingSpinner() {
    if (loadingSpinner) {
        loadingSpinner.style.display = 'block';
        updateLoadingProgress(0, 100);
    }
}

function hideLoadingSpinner() {
    if (loadingSpinner) {
        loadingSpinner.style.display = 'none';
        const progressText = loadingSpinner.querySelector('.progress-text');
        if (progressText) {
            progressText.textContent = '';
        }
    }
}

function updateLoadingProgress(processed, total) {
    if (!loadingSpinner) return;
    const progressText = loadingSpinner.querySelector('.progress-text');
    if (!progressText) return;
    if (total === 100) {
        progressText.textContent = `${processed}% complete`;
        return;
    }
    const percentage = total ? ((processed / total) * 100).toFixed(1) : '0.0';
    progressText.textContent = `${processed.toLocaleString()} / ${total.toLocaleString()} (${percentage}%)`;
}

function useWorkerForInput(resistorCount) {
    return typeof Worker !== 'undefined' && resistorCount >= 6;
}

function getWorkerCount(resistorCount) {
    if (!useWorkerForInput(resistorCount)) return 0;
    const cores = navigator.hardwareConcurrency || 2;
    if (cores < 2 || resistorCount < 8) return 1;
    return Math.min(cores, 4);
}

function runWorkerCalculation(resistors, targetValue, sortBy, options) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('target-resistance-worker.js');
        let hasProgress = false;
        const payload = {
            resistors,
            targetValue,
            sortBy,
            options: {
                maxParallel: options.maxParallel,
                maxSeriesBlocks: options.maxSeriesBlocks,
                maxBlocks: options.maxBlocks,
                maxCombos: options.maxCombos,
                maxParallelCombos: options.maxParallelCombos
            }
        };

        const cleanup = () => worker.terminate();

        worker.addEventListener('message', (event) => {
            const { type, results, error, stats, processed, total } = event.data || {};
            if (type === 'progress') {
                if (Number.isFinite(processed) && Number.isFinite(total) && total > 0) {
                    hasProgress = true;
                    updateLoadingProgress(processed, total);
                }
                return;
            }
            if (type === 'result') {
                if (!hasProgress) {
                    updateLoadingProgress(100, 100);
                }
                cleanup();
                resolve({ results: results || [], stats: stats || null });
            } else if (type === 'error') {
                cleanup();
                reject(new Error(error || 'Worker failed'));
            }
        });

        worker.addEventListener('error', (err) => {
            cleanup();
            reject(err);
        });

        worker.postMessage({ type: 'calculate', data: payload });
    });
}

function runWorkerCalculationParallel(resistors, targetValue, sortBy, options, workerCount) {
    return new Promise((resolve, reject) => {
        const workers = [];
        const aggregatedResults = [];
        const aggregatedStats = {
            blockCount: null,
            comboCount: 0,
            prunedBlocks: 0,
            prunedCombos: 0
        };
        const perWorkerMaxCombos = Math.ceil(options.maxCombos / workerCount);
        let completed = 0;
        let settled = false;
        let hasProgressTotals = false;
        const progressByWorker = new Map();

        const updateAggregatedProgress = () => {
            let processedSum = 0;
            let totalSum = 0;
            progressByWorker.forEach(progress => {
                processedSum += progress.processed || 0;
                totalSum += progress.total || 0;
            });
            if (totalSum > 0) {
                hasProgressTotals = true;
                updateLoadingProgress(processedSum, totalSum);
            }
        };

        const cleanup = () => workers.forEach(worker => worker.terminate());

        const finalizeError = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        };

        const finalizeSuccess = () => {
            if (settled) return;
            settled = true;
            aggregatedStats.comboCount = aggregatedResults.length;
            resolve({ results: aggregatedResults, stats: aggregatedStats });
        };

        for (let i = 0; i < workerCount; i++) {
            const worker = new Worker('target-resistance-worker.js');
            workers.push(worker);
            const workerIndex = i;

            worker.addEventListener('message', (event) => {
                const { type, results, error, stats, processed, total, chunkIndex } = event.data || {};
                const progressKey = Number.isFinite(chunkIndex) ? chunkIndex : workerIndex;
                if (type === 'progress') {
                    if (Number.isFinite(processed) && Number.isFinite(total) && total > 0) {
                        progressByWorker.set(progressKey, { processed, total });
                        updateAggregatedProgress();
                    }
                    return;
                }
                if (type === 'result') {
                    if (Array.isArray(results) && results.length) {
                        aggregatedResults.push(...results);
                    }
                    if (stats) {
                        aggregatedStats.prunedCombos += stats.prunedCombos ?? 0;
                        if (aggregatedStats.blockCount == null && stats.blockCount != null) {
                            aggregatedStats.blockCount = stats.blockCount;
                            aggregatedStats.prunedBlocks = stats.prunedBlocks ?? 0;
                        }
                    }
                    if (progressByWorker.has(progressKey)) {
                        const entry = progressByWorker.get(progressKey);
                        if (entry && entry.total) {
                            progressByWorker.set(progressKey, { processed: entry.total, total: entry.total });
                            updateAggregatedProgress();
                        }
                    }
                    completed += 1;
                    worker.terminate();
                    if (completed === workerCount) {
                        if (!hasProgressTotals) {
                            updateLoadingProgress(workerCount, workerCount);
                        } else {
                            updateAggregatedProgress();
                        }
                        finalizeSuccess();
                    }
                } else if (type === 'error') {
                    finalizeError(new Error(error || 'Worker failed'));
                }
            });

            worker.addEventListener('error', (err) => finalizeError(err));

            worker.postMessage({
                type: 'calculateChunk',
                data: {
                    resistors,
                    targetValue,
                    sortBy,
                    options: {
                        maxParallel: options.maxParallel,
                        maxSeriesBlocks: options.maxSeriesBlocks,
                        maxBlocks: options.maxBlocks,
                        maxCombos: perWorkerMaxCombos,
                        maxParallelCombos: options.maxParallelCombos
                    },
                    chunkIndex: i,
                    chunkCount: workerCount
                }
            });
        }
    });
}

function parseResistorList(values, options) {
    const warnings = [];
    const resistors = [];
    const conversions = [];
    const activeStateMap = options.activeStateMap || new Map();
    const occurrenceMap = new Map();
    const dedupeKeys = options.snapToSeries ? new Set() : null;
    values.forEach((value, index) => {
        if (!value) return;
        try {
            const normalizedInput = normalizeResistorInput(value);
            const occurrence = (occurrenceMap.get(normalizedInput) || 0) + 1;
            occurrenceMap.set(normalizedInput, occurrence);
            const key = `${normalizedInput}::${occurrence}`;
            const parsed = ResistorUtils.parseResistorInput(value, options);
            if (parsed.value <= 0) {
                warnings.push(`Resistor ${index + 1} ${value} ignored: value must be positive`);
                return;
            }
            if (parsed.warnings && parsed.warnings.length > 0) {
                parsed.warnings.forEach(warning => warnings.push(`Resistor ${index + 1} ${value}: ${warning}`));
            }
            const toleranceSeries = parsed.tolerance != null
                ? ResistorUtils.getSeriesForTolerance(parsed.tolerance)
                : null;
            const seriesName = toleranceSeries || parsed.series || ResistorUtils.findResistorSeries(parsed.value);
            const dedupeKey = dedupeKeys
                ? `${parsed.value}|${parsed.tolerance ?? ''}|${parsed.powerRating ?? ''}|${parsed.powerCode ?? ''}|${seriesName ?? ''}`
                : null;
            if (dedupeKey && dedupeKeys.has(dedupeKey)) {
                return;
            }
            if (dedupeKey) {
                dedupeKeys.add(dedupeKey);
            }
            const active = activeStateMap.has(key) ? activeStateMap.get(key) : true;
            resistors.push({
                id: index,
                key,
                value: parsed.value,
                tolerance: parsed.tolerance,
                powerRating: parsed.powerRating,
                powerCode: parsed.powerCode,
                series: seriesName,
                debug: parsed.debug,
                formatted: ResistorUtils.formatResistorValue(parsed.value),
                input: value,
                source: parsed.source,
                active
            });
            conversions.push({
                id: index,
                key,
                input: value,
                value: parsed.value,
                formatted: ResistorUtils.formatResistorValue(parsed.value),
                series: seriesName,
                tolerance: parsed.tolerance,
                powerRating: parsed.powerRating,
                powerCode: parsed.powerCode,
                debug: parsed.debug,
                active
            });
        } catch (error) {
            warnings.push(`Resistor ${index + 1} ${value} ignored: ${error.message}`);
        }
    });

    return { resistors, warnings, conversions };
}

async function calculateResults(options = {}) {
    const { resetSort = true, allowRecalc = true } = options;
    const warnings = [];
    const calculationStart = performance.now();
    const resistorInputsRaw = resistorValuesInput.value.split(',').map(v => v.trim());
    const uniqueInputMap = new Map();
    const resistorInputs = [];
    resistorInputsRaw.forEach(input => {
        if (!input) return;
        const normalized = normalizeResistorInput(input);
        if (uniqueInputMap.has(normalized)) {
            return;
        }
        uniqueInputMap.set(normalized, true);
        resistorInputs.push(input);
    });
    if (resistorInputs.length !== resistorInputsRaw.filter(Boolean).length) {
        resistorValuesInput.value = resistorInputs.join(', ');
    }
    const snapToSeries = document.getElementById('snapToSeries')?.checked;
    const snapSeries = document.getElementById('autofillSeries')?.value || 'E24';
    const activeStateMap = getActiveKeyMap();

    const { resistors, warnings: parseWarnings, conversions } = parseResistorList(resistorInputs, {
        snapToSeries,
        snapSeries,
        activeStateMap
    });
    warnings.push(...parseWarnings);

    const activeResistors = resistors.filter(resistor => resistor.active !== false);
    const activeKeysForCache = activeResistors.map(resistor => resistor.key).filter(Boolean);
    const cacheKey = buildCacheKey(resistorInputs, targetResistanceInput.value, snapToSeries, snapSeries, activeKeysForCache);

    if (!activeResistors.length) {
        warnings.push('At least one valid resistor value is required');
    }

    let targetValue;
    const targetInputValue = targetResistanceInput.value.trim();
    if (!targetInputValue) {
        warnings.push('Target resistance value required');
    } else {
        try {
            const parsedTarget = ResistorUtils.parseResistorInput(targetInputValue, {
                snapToSeries,
                snapSeries
            });
            targetValue = parsedTarget.value;
            if (parsedTarget.warnings && parsedTarget.warnings.length > 0) {
                parsedTarget.warnings.forEach(warning => warnings.push(`Target resistance: ${warning}`));
            }
        } catch (error) {
            warnings.push(`Target resistance: ${error.message}`);
        }
    }

    if (!targetValue || targetValue <= 0) {
        resultsContainer.innerHTML = `
            <div class="warning">
                <h3>Warnings</h3>
                <ul>${warnings.map(w => `<li>${w}</li>`).join('')}</ul>
            </div>`;
        return;
    }

    if (resetSort && sortBySelect) {
        sortBySelect.value = 'error';
    }
    const sortByInitial = sortBySelect?.value || 'error';
    let results = [];
    let calcStats = {
        inputCount: resistors.length,
        activeCount: activeResistors.length,
        filteredCount: activeResistors.length,
        filteredByHeuristic: false,
        removedByHeuristic: 0,
        blockCount: null,
        comboCount: null,
        prunedBlocks: 0,
        prunedCombos: 0,
        errorFilterFallback: false,
        maxParallel: LIMITS.maxParallel,
        maxSeriesBlocks: LIMITS.maxSeriesBlocks,
        maxBlocks: LIMITS.maxBlocks,
        maxCombos: LIMITS.maxCombos,
        workerUsed: false,
        workerCount: 0,
        calculationTimeMs: null
    };

    const { resistors: filteredResistors, trimmed, removedCount } = applyResistorHeuristic(
        activeResistors,
        targetValue,
        LIMITS.maxInputResistors
    );
    const effectiveLimits = getEffectiveLimits(filteredResistors.length);
    calcStats.filteredCount = filteredResistors.length;
    calcStats.filteredByHeuristic = trimmed;
    calcStats.removedByHeuristic = removedCount;
    calcStats.maxParallel = effectiveLimits.maxParallel;
    calcStats.maxSeriesBlocks = effectiveLimits.maxSeriesBlocks;
    calcStats.maxBlocks = effectiveLimits.maxBlocks;
    calcStats.maxCombos = effectiveLimits.maxCombos;

    let cachedEntry = resultsCache.get(cacheKey);
    let useCache = cachedEntry && Array.isArray(cachedEntry.allResults);
    if (!useCache && inflightCalculations.has(cacheKey)) {
        try {
            await inflightCalculations.get(cacheKey);
        } catch (error) {
            warnings.push(`Calculation failed: ${error.message}`);
        }
        cachedEntry = resultsCache.get(cacheKey);
        useCache = cachedEntry && Array.isArray(cachedEntry.allResults);
    }
    if (!useCache && !allowRecalc) {
        return;
    }

    if (useCache) {
        results = cachedEntry.allResults.slice();
        calcStats.workerUsed = cachedEntry.workerUsed;
        calcStats.workerCount = cachedEntry.workerCount ?? (cachedEntry.workerUsed ? 1 : 0);
    } else {
        showLoadingSpinner();
        await new Promise(resolve => setTimeout(resolve, 0));
        const inflightPromise = (async () => {
            const workerCount = getWorkerCount(filteredResistors.length);
            if (workerCount > 0) {
                calcStats.workerUsed = true;
                calcStats.workerCount = workerCount;
                try {
                    const workerResult = workerCount > 1
                        ? await runWorkerCalculationParallel(filteredResistors, targetValue, sortByInitial, effectiveLimits, workerCount)
                        : await runWorkerCalculation(filteredResistors, targetValue, sortByInitial, effectiveLimits);
                    results = workerResult.results;
                    if (workerResult.stats) {
                        calcStats.blockCount = workerResult.stats.blockCount ?? null;
                        calcStats.comboCount = workerResult.stats.comboCount ?? null;
                        calcStats.prunedBlocks = workerResult.stats.prunedBlocks ?? 0;
                        calcStats.prunedCombos = workerResult.stats.prunedCombos ?? 0;
                    }
                } catch (error) {
                    warnings.push(`Worker failed: ${error.message}. Falling back to local calculation.`);
                } finally {
                    hideLoadingSpinner();
                }
            }
            if (results.length === 0) {
                const { combinations, stats } = generateCombinations(filteredResistors, {
                    maxParallel: effectiveLimits.maxParallel,
                    maxSeriesBlocks: effectiveLimits.maxSeriesBlocks,
                    maxBlocks: effectiveLimits.maxBlocks,
                    maxCombos: effectiveLimits.maxCombos,
                    targetValue
                });
                calcStats.blockCount = stats.blockCount;
                calcStats.comboCount = stats.comboCount;
                calcStats.prunedBlocks = stats.prunedBlocks ?? 0;
                calcStats.prunedCombos = stats.prunedCombos ?? 0;
                results = combinations.map(combo => {
                    const totalResistance = resistanceOf(combo);
                    const errorPercent = ((totalResistance - targetValue) / targetValue) * 100;
                    return {
                        combo,
                        comboLabel: formatCombination(combo),
                        totalResistance,
                        error: totalResistance - targetValue,
                        errorPercent,
                        componentCount: countComponents(combo)
                    };
                });
                hideLoadingSpinner();
            }
        })();
        inflightCalculations.set(cacheKey, inflightPromise);
        try {
            await inflightPromise;
        } finally {
            inflightCalculations.delete(cacheKey);
        }
    }

    results = dedupeResults(results);
    const sortBy = sortBySelect?.value || sortByInitial;
    results = sortResults(results, sortBy);
    const filtered = applyErrorFilter(results, 20);
    results = filtered.results;
    calcStats.errorFilterFallback = filtered.fallbackUsed;
    const fullResults = results.slice();
    const activeKeys = activeResistors.map(resistor => resistor.key).filter(Boolean);
    results = filterResultsByActiveKeys(results, activeKeys);

    resultsCache.set(cacheKey, {
        allResults: fullResults,
        workerUsed: calcStats.workerUsed,
        workerCount: calcStats.workerCount
    });

    const topResults = results.slice(0, 5).map(result => {
        if (!result.combo) return result;
        return {
            ...result,
            resistanceRange: getSafeResistanceRange(result.combo)
        };
    });
    calcStats.calculationTimeMs = Math.round(performance.now() - calculationStart);
    const workerLabel = calcStats.workerUsed
        ? `Yes${calcStats.workerCount > 1 ? ` (${calcStats.workerCount} workers)` : ''}`
        : 'No';
    const cutoffLabel = calcStats.errorFilterFallback ? 'Yes' : 'No';

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

    if (conversions.length > 0 && window.CommonUI?.renderParsedValuesGrid) {
        output += window.CommonUI.renderParsedValuesGrid({
            conversions,
            resistorTolerances,
            onClickHandler: 'toggleResistorValue',
            tooltipText: 'Click a value to temporarily exclude/include it from the calculation. Colours indicate the E series of the value'
        });
    }

    // Add snap to E-series toggle
    const snapChecked = document.getElementById('snapToSeries')?.checked ? 'checked' : '';
    output += `
        <div class="snap-toggle-section">
            <div class="theme-switch-wrapper">
                <label class="theme-switch" for="snapToSeries">
                    <input type="checkbox" id="snapToSeries" ${snapChecked} onchange="calculateResults()" />
                    <div class="slider round"></div>
                </label>
                <span class="theme-label">Snap to E-series values</span>
                <div class="help-tooltip">
                    ?
                    <span class="tooltip-text">
                        When enabled, parsed values are snapped to the nearest E-series value. If a tolerance is specified,
                        the closest matching E-series is used. When disabled, inputs are used as-is, including non-standard values.
                    </span>
                </div>
            </div>
        </div>`;

    if (calcStats.errorFilterFallback) {
        output += `
            <div class="warning">
                <strong>No matches within 20%.</strong> Showing the closest results based on the current limits
                (${calcStats.maxSeriesBlocks} series blocks, ${calcStats.maxParallel} parallel entries, max ${calcStats.maxCombos.toLocaleString()} combinations).
                A closer match may require more resistors than this limit allows.
            </div>`;
    }

    output += `
        <div class="results-section">
            <h3>Closest Matches</h3>
            <div id="resultsList">
                ${topResults.map((result, index) => {
                    const comboText = result.comboLabel || formatCombination(result.combo);
                    const comboLabel = encodeURIComponent(comboText);
                    const errorPercentAbs = Math.abs(result.errorPercent);
                    const errorClass = errorPercentAbs > 20 ? 'error-high' : '';
                    return `
                    <div class="result-item">
                        <div class="result-content">
                            <table class="result-table">
                                <tbody>
                                    <tr>
                                        <td><strong>Combination</strong></td>
                                        <td>${comboText}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Total Resistance</strong></td>
                                        <td>${ResistorUtils.formatResistorValue(result.totalResistance)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Error (abs)</strong></td>
                                        <td class="${errorClass}">${ResistorUtils.formatResistorValue(Math.abs(result.error))} (${errorPercentAbs.toFixed(2)}%)</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Real World Resistance Range</strong></td>
                                        <td>${result.resistanceRange ? `${ResistorUtils.formatResistorValue(result.resistanceRange.lower)} to ${ResistorUtils.formatResistorValue(result.resistanceRange.upper)}` : '—'}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Components</strong></td>
                                        <td>${result.componentCount}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="result-diagram" id="diagram-${index}" data-combo="${comboLabel}" data-total="${result.totalResistance}" data-target="${targetValue}">
                            <button class="diagram-download-btn" onclick="downloadTargetDiagram(${index})" title="Download diagram as PNG">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </div>
                `;
                }).join('')}
            </div>
        </div>`;

    output += `
        <div class="details-section">
            <h3>Calculation Stats</h3>
            <div class="details-content">
                <div class="combination-stats">
                    <p>Inputs: ${calcStats.inputCount} total, ${calcStats.activeCount} active</p>
                    <p>Filtered inputs used: ${calcStats.filteredCount}${calcStats.filteredByHeuristic ? ` (reduced by ${calcStats.removedByHeuristic}, cap ${LIMITS.maxInputResistors})` : ''}</p>
                    <p>Parallel limit: ${calcStats.maxParallel}, Series blocks: ${calcStats.maxSeriesBlocks}, Parallel blocks: ${calcStats.maxBlocks}</p>
                    <p>Max combos: ${calcStats.maxCombos.toLocaleString()}, Combos generated: ${calcStats.comboCount != null ? calcStats.comboCount.toLocaleString() : 'n/a'}</p>
                    <p>Worker used: ${workerLabel}, Block count: ${calcStats.blockCount != null ? calcStats.blockCount.toLocaleString() : 'n/a'}</p>
                    <p>Pruned blocks: ${calcStats.prunedBlocks.toLocaleString()}, Pruned combos: ${calcStats.prunedCombos.toLocaleString()}</p>
                    <p>20% cutoff fallback: ${cutoffLabel}</p>
                    <p>Calculation time: ${calcStats.calculationTimeMs != null ? `${calcStats.calculationTimeMs}ms` : 'n/a'}</p>
                </div>
            </div>
        </div>`;

    resultsContainer.innerHTML = output;
    if (window.CommonUI?.normalizeParsedValueWidths) {
        requestAnimationFrame(() => window.CommonUI.normalizeParsedValueWidths(resultsContainer));
    }
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
        diagram.renderTextDiagram(lines, '');
    });
}

function downloadTargetDiagram(index) {
    const diagramElement = document.getElementById(`diagram-${index}`);
    if (!diagramElement) return;
    const svgElement = diagramElement.querySelector('svg');
    if (!svgElement) return;

    const targetValue = targetResistanceInput.value;
    const comboLabel = decodeURIComponent(diagramElement.dataset.combo || '');
    const totalValue = parseFloat(diagramElement.dataset.total || '0');
    const targetNumeric = parseFloat(diagramElement.dataset.target || '');
    const formattedTotal = ResistorUtils.formatResistorValue(totalValue).replace(/[^\w]/g, '');
    const sanitizedCombo = comboLabel.replace(/[^\w]+/g, '-').slice(0, 40);
    const filename = `target-${targetValue}-${formattedTotal}-${sanitizedCombo}.png`;
    const targetLine = Number.isFinite(targetNumeric)
        ? [`Target: ${ResistorUtils.formatResistorValue(targetNumeric)}`]
        : [];

    convertSVGtoPNG(svgElement, filename, 2, targetLine);
}

function convertSVGtoPNG(svgElement, filename, scale = 2, extraLines = []) {
    const svgClone = svgElement.cloneNode(true);
    const originalWidth = svgElement.viewBox?.baseVal?.width || 300;
    const originalHeight = svgElement.viewBox?.baseVal?.height || 160;
    const lineHeight = 16;
    const padding = 16;
    const extraHeight = extraLines.length ? padding + lineHeight * extraLines.length : 0;
    const updatedHeight = originalHeight + extraHeight;
    const scaledWidth = originalWidth * scale;
    const scaledHeight = updatedHeight * scale;

    svgClone.setAttribute('width', scaledWidth);
    svgClone.setAttribute('height', scaledHeight);
    svgClone.setAttribute('viewBox', `0 0 ${originalWidth} ${updatedHeight}`);

    if (extraLines.length) {
        extraLines.forEach((line, index) => {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', padding);
            text.setAttribute('y', originalHeight + padding + lineHeight * (index + 1));
            text.setAttribute('font-size', '12px');
            text.textContent = line;
            svgClone.appendChild(text);
        });
    }

    const canvas = document.createElement('canvas');
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, scaledWidth, scaledHeight);

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = function() {
        ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);
        canvas.toBlob(function(blob) {
            const downloadUrl = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = downloadUrl;
            downloadLink.download = filename;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(downloadUrl);
            URL.revokeObjectURL(svgUrl);
        }, 'image/png');
    };

    img.onerror = function() {
        URL.revokeObjectURL(svgUrl);
    };

    img.src = svgUrl;
}

async function toggleResistorValue(element) {
    if (!element) return;
    element.classList.toggle('disabled');
    element.classList.toggle('active');
    await calculateResults();
}

calculateBtn.addEventListener('click', calculateResults);
if (sortBySelect) {
    sortBySelect.addEventListener('change', () => {
        calculateResults({ resetSort: false, allowRecalc: false });
    });
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

// Tooltip positioning
function positionTooltip(tooltip) {
    const tooltipText = tooltip.querySelector('.tooltip-text');
    if (!tooltipText) return;
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
