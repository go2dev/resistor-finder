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

    resistors.forEach(resistor => blocks.push(resistor));

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

    return {
        combinations,
        stats: {
            blockCount: filteredBlocks.length,
            comboCount: combinations.length,
            maxParallel,
            maxSeriesBlocks,
            maxBlocks,
            maxCombos
        }
    };
}

self.addEventListener('message', (event) => {
    const { type, data } = event.data || {};
    if (type !== 'calculate') return;

    try {
        const { resistors, targetValue, options, sortBy } = data;
        const { combinations, stats } = generateCombinations(resistors, {
            ...options,
            targetValue
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

        self.postMessage({ type: 'result', results: results.slice(0, 5), stats });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
});
