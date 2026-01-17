const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadWorkerContext() {
    const context = {
        console,
        self: {
            addEventListener: () => {},
            postMessage: () => {}
        },
        importScripts: (...scripts) => {
            scripts.forEach(script => {
                const fullPath = path.resolve(__dirname, '..', script);
                const code = fs.readFileSync(fullPath, 'utf8');
                vm.runInContext(`${code}\nthis.ResistorUtils = ResistorUtils;`, context);
            });
        }
    };

    vm.createContext(context);
    const workerCode = fs.readFileSync(path.resolve(__dirname, '..', 'target-resistance-worker.js'), 'utf8');
    vm.runInContext(
        `${workerCode}
this.generateCombinations = generateCombinations;
this.calculateSectionBounds = calculateSectionBounds;
this.calculateResistorBounds = calculateResistorBounds;`,
        context
    );
    return context;
}

function isSeriesOfValue(combo, value) {
    return Array.isArray(combo)
        && (combo.type || 'series') === 'series'
        && combo.length === 2
        && combo.every(item => (item.value ?? item) === value);
}

module.exports = function runTargetResistanceWorkerTests() {
    const context = loadWorkerContext();

    {
        const resistors = [
            { id: 0, value: 4990, series: 'E96' },
            { id: 1, value: 10000, series: 'E24' }
        ];
        const { combinations, stats } = context.generateCombinations(resistors, {
            maxParallel: 2,
            maxSeriesBlocks: 2,
            maxBlocks: 50,
            maxCombos: 500,
            targetValue: 10000
        });

        assert.ok(stats.prunedCombos >= 1, 'Expected series combos to be pruned');
        const hasSeries = combinations.some(combo => isSeriesOfValue(combo, 4990));
        assert.ok(!hasSeries, 'Series 4k99+4k99 should be pruned');
    }

    {
        const resistors = [
            { id: 0, value: 10000, series: 'E24' },
            { id: 1, value: 4990, series: 'E96' }
        ];
        const { stats } = context.generateCombinations(resistors, {
            maxParallel: 2,
            maxSeriesBlocks: 1,
            maxBlocks: 50,
            maxCombos: 500,
            targetValue: 5000
        });

        assert.ok(stats.prunedBlocks >= 1, 'Expected parallel blocks to be pruned');
    }

    {
        const resistors = [
            { id: 0, value: 1000, series: 'E24' },
            { id: 1, value: 2000, series: 'E24' }
        ];
        const { stats } = context.generateCombinations(resistors, {
            maxParallel: 2,
            maxSeriesBlocks: 2,
            maxBlocks: 50,
            maxCombos: 500,
            targetValue: 3000
        });

        assert.strictEqual(stats.prunedBlocks, 0, 'Expected no blocks to be pruned');
        assert.strictEqual(stats.prunedCombos, 0, 'Expected no combos to be pruned');
    }

    {
        const resistors = [
            { id: 0, value: 10, series: 'E24' },
            { id: 1, value: 22, series: 'E24' },
            { id: 2, value: 47, series: 'E24' }
        ];
        const { combinations } = context.generateCombinations(resistors, {
            maxParallel: 1,
            maxSeriesBlocks: 2,
            maxBlocks: 50,
            maxCombos: 50,
            targetValue: 1e9
        });

        const maxTotal = combinations.reduce((max, combo) => {
            const total = Array.isArray(combo)
                ? combo.reduce((sum, item) => sum + (item.value ?? item), 0)
                : (combo.value ?? combo);
            return Math.max(max, total);
        }, 0);
        assert.ok(maxTotal < 1000, 'Expected max total to be far below target');
    }

    {
        const resistors = Array.from({ length: 12 }, (_, idx) => ({
            id: idx,
            value: 10 + idx,
            series: 'E24'
        }));
        const { combinations, stats } = context.generateCombinations(resistors, {
            maxParallel: 3,
            maxSeriesBlocks: 5,
            maxBlocks: 200,
            maxCombos: 30,
            targetValue: 100
        });

        assert.ok(combinations.length <= 30, 'Expected combinations to respect maxCombos');
        assert.ok(stats.comboCount <= 30, 'Expected stats comboCount to respect maxCombos');
    }

    {
        const combo = [
            { value: 4990, tolerance: 1 },
            { value: 4990, tolerance: 1 }
        ];
        combo.type = 'series';
        const target = { value: 10000, tolerance: 5 };
        const comboRange = context.calculateSectionBounds(combo);
        const targetRange = context.calculateResistorBounds(target);
        const overlaps = comboRange.lower <= targetRange.upper && comboRange.upper >= targetRange.lower;
        assert.ok(overlaps, 'Expected series tolerance range to overlap target tolerance range');
    }
};
