importScripts('resistor-utils.js');

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

function calculateResistorBounds(resistor) {
    const value = resistor.value ?? resistor;
    let tolerance = resistor.tolerance;
    if (tolerance == null) {
        const seriesName = resistor.series || ResistorUtils.findResistorSeries(value);
        tolerance = seriesName ? ResistorUtils.resistorTolerances[seriesName] : 0;
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

function buildSingleBounds(resistors) {
    return resistors.map(resistor => ({
        lower: calculateResistorBounds(resistor).lower,
        upper: calculateResistorBounds(resistor).upper
    }));
}

function overlapsSingle(bounds, singleBounds) {
    return singleBounds.some(single => bounds.lower <= single.upper && bounds.upper >= single.lower);
}

function getChunkRange(total, chunkIndex, chunkCount) {
    if (chunkCount <= 1 || total <= 0) return [0, total];
    const size = Math.ceil(total / chunkCount);
    const start = chunkIndex * size;
    const end = Math.min(start + size, total);
    return [start, end];
}


function generateCombinations(resistors, options = {}) {
    const maxParallel = options.maxParallel ?? 5;
    const maxSeriesBlocks = options.maxSeriesBlocks ?? 5;
    const maxBlocks = options.maxBlocks ?? 250;
    const maxCombos = options.maxCombos ?? 20000;
    const targetValue = options.targetValue ?? null;
    const chunkIndex = options.chunkIndex ?? 0;
    const chunkCount = options.chunkCount ?? 1;
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

    resistors.forEach(resistor => blocks.push(resistor));

    for (let size = 2; size <= maxParallel; size++) {
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

    const singleIndices = [];
    filteredBlocks.forEach((block, index) => {
        if (!Array.isArray(block)) {
            singleIndices.push(index);
        }
    });
    const [singleStart, singleEnd] = getChunkRange(singleIndices.length, chunkIndex, chunkCount);
    for (let idx = singleStart; idx < singleEnd; idx++) {
        if (comboCount >= maxCombos) break;
        const block = filteredBlocks[singleIndices[idx]];
        if (Array.isArray(block)) continue;
        for (let size = 2; size <= maxSeriesBlocks; size++) {
            if (comboCount >= maxCombos) break;
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
    }

    const comboBlockCount = Math.min(filteredBlocks.length, resistors.length);
    const [comboStart, comboEnd] = getChunkRange(comboBlockCount, chunkIndex, chunkCount);
    for (let size = 1; size <= maxSeriesBlocks; size++) {
        if (comboCount >= maxCombos) break;
        for (let firstIndex = comboStart; firstIndex < comboEnd; firstIndex++) {
            if (comboCount >= maxCombos) break;
            if (size === 1) {
                combinations.push(filteredBlocks[firstIndex]);
                comboCount += 1;
                continue;
            }
            const combos = [];
            buildIndexCombos(firstIndex, 1, size, [firstIndex], combos);
            combos.forEach(indices => {
                if (comboCount >= maxCombos) return;
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
        }
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

self.addEventListener('message', (event) => {
    const { type, data } = event.data || {};
    if (type !== 'calculate' && type !== 'calculateChunk') return;

    try {
        const { resistors, targetValue, options, sortBy, chunkIndex, chunkCount } = data;
        const { combinations, stats } = generateCombinations(resistors, {
            ...options,
            targetValue,
            chunkIndex: chunkIndex ?? 0,
            chunkCount: chunkCount ?? 1
        });
        const results = combinations.map(combo => {
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

        self.postMessage({
            type: 'result',
            results,
            stats
        });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
});
