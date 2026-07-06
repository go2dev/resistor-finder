const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Drives the real resistor-worker.js search the same way script.js does
// (combination generation, resistance-sorted indices, chunked processChunk calls),
// then applies the shared display ranking from ResistorUtils.

function loadContext() {
    const context = {
        console,
        self: {
            addEventListener: () => {},
            postMessage: () => {}
        }
    };
    vm.createContext(context);
    const utilsCode = fs.readFileSync(path.resolve(__dirname, '..', 'resistor-utils.js'), 'utf8');
    vm.runInContext(`${utilsCode}\nthis.ResistorUtils = ResistorUtils;`, context);
    const workerCode = fs.readFileSync(path.resolve(__dirname, '..', 'resistor-worker.js'), 'utf8');
    vm.runInContext(
        `${workerCode}
this.processChunk = processChunk;
this.calculateTotalResistance = calculateTotalResistance;`,
        context
    );
    context.resistorTolerances = context.ResistorUtils.resistorTolerances;
    return context;
}

// Mirrors script.js generateCombinations (singles, series pairs, parallel pairs)
function generateCombinations(resistors) {
    const combinations = [];
    for (const r of resistors) combinations.push(r);
    for (let i = 0; i < resistors.length; i++) {
        for (let j = i; j < resistors.length; j++) {
            const s = [resistors[i], resistors[j]];
            s.type = 'series';
            combinations.push(s);
        }
    }
    for (let i = 0; i < resistors.length; i++) {
        for (let j = i; j < resistors.length; j++) {
            const p = [resistors[i], resistors[j]];
            p.type = 'parallel';
            combinations.push(p);
        }
    }
    return combinations;
}

function runDividerSearch(context, valuesOhms, supplyVoltage, targetVoltage, { allowOvershoot = true, numChunks = 8 } = {}) {
    const resistors = valuesOhms.map((v, i) => ({ id: i, value: v }));
    const combinations = generateCombinations(resistors);
    const resistanceCache = new Map();
    for (let i = 0; i < combinations.length; i++) {
        resistanceCache.set(i, context.calculateTotalResistance(combinations[i]));
    }
    const sortedIndices = Array.from({ length: combinations.length }, (_, i) => i)
        .sort((a, b) => resistanceCache.get(a) - resistanceCache.get(b));
    const targetRatio = targetVoltage / supplyVoltage;
    const resistanceCacheArray = Array.from(resistanceCache.entries());

    const chunkSize = Math.ceil(sortedIndices.length / numChunks);
    let allResults = [];
    for (let c = 0; c < numChunks; c++) {
        const start = c * chunkSize;
        const end = Math.min(start + chunkSize, sortedIndices.length);
        if (start >= end) continue;
        const r2Indices = Array.from({ length: end - start }, (_, j) => start + j);
        const { results } = context.processChunk({
            r2Indices,
            combinations,
            resistanceCacheArray,
            sortedIndices,
            supplyVoltage,
            targetVoltage,
            allowOvershoot,
            targetRatio
        });
        allResults = allResults.concat(results);
    }
    return allResults;
}

function isTwoPart(result, r1, r2) {
    return !Array.isArray(result.r1) && !Array.isArray(result.r2)
        && result.r1Value === r1 && result.r2Value === r2;
}

module.exports = function runDividerRankingTests() {
    const context = loadContext();
    const Ru = context.ResistorUtils;
    const values = [100, 220, 470, 1000, 2200, 3300, 4700, 5100, 10000, 22000, 47000, 100000];
    const supply = 3.3;
    const target = 2.76;

    const allResults = runDividerSearch(context, values, supply, target);

    // The plain two-resistor answer must survive the search itself.
    assert.ok(
        allResults.some(r => isTwoPart(r, 1000, 5100)),
        'search should produce the plain 1k/5k1 two-resistor divider'
    );

    // Display ranking: dedupe identical ratios across chunks, then rank for the
    // default "Lowest Error" mode. The 1k/5k1 answer (~2.759V, error < 0.1% of
    // supply) must appear in the displayed top 5 instead of being buried under
    // 3-4 part combinations with physically meaningless nominal-error advantages.
    const deduped = Ru.dedupeDividerRatios(allResults);
    const ranked = Ru.sortDividerResultsForDisplay(deduped, 'error', { supplyVoltage: supply });
    const top5 = ranked.slice(0, 5);

    assert.ok(
        top5.some(r => isTwoPart(r, 1000, 5100)),
        `top 5 should include the 1k/5k1 two-resistor divider, got: ${top5
            .map(r => `${r.componentCount}-part ${r.outputVoltage.toFixed(4)}V`)
            .join(', ')}`
    );

    // Dedupe must collapse same-ratio duplicates to the fewest-component network:
    // 1k||1k over 5k1||5k1 has exactly the ratio of 1k over 5k1 but twice the parts.
    const sameRatioDupes = deduped.filter(
        r => (r.r2Value / (r.r1Value + r.r2Value)).toFixed(10) === (5100 / 6100).toFixed(10)
    );
    assert.strictEqual(sameRatioDupes.length, 1, 'identical ratios should be collapsed');
    assert.strictEqual(sameRatioDupes[0].componentCount, 2, 'dedupe should keep the fewest-part network');

    // Bucketed error ranking stays a real error sort: results a full bucket apart
    // must not be reordered by component count.
    const coarse = [
        { error: 0.2, componentCount: 2, totalResistance: 1000, outputVoltage: 2.96 },
        { error: 0.0005, componentCount: 4, totalResistance: 5000, outputVoltage: 2.7605 }
    ];
    const coarseSorted = Ru.sortDividerResultsForDisplay(coarse, 'error', { supplyVoltage: supply });
    assert.strictEqual(coarseSorted[0].componentCount, 4, 'clearly closer result must rank first regardless of parts');

    // Non-error sort modes keep their existing behaviour.
    const byParts = Ru.sortDividerResultsForDisplay(deduped, 'components', { supplyVoltage: supply });
    for (let i = 1; i < byParts.length; i++) {
        assert.ok(byParts[i].componentCount >= byParts[i - 1].componentCount, 'components sort must be by part count');
    }
    const byAsc = Ru.sortDividerResultsForDisplay(deduped, 'totalResistanceAsc', { supplyVoltage: supply });
    for (let i = 1; i < byAsc.length; i++) {
        assert.ok(byAsc[i].totalResistance >= byAsc[i - 1].totalResistance, 'asc sort must be by total resistance');
    }
};
