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
        }
    };

    vm.createContext(context);
    const utilsCode = fs.readFileSync(path.resolve(__dirname, '..', 'resistor-utils.js'), 'utf8');
    vm.runInContext(`${utilsCode}\nthis.ResistorUtils = ResistorUtils;`, context);

    const workerCode = fs.readFileSync(path.resolve(__dirname, '..', 'resistor-worker.js'), 'utf8');
    vm.runInContext(
        `${workerCode}
this.calculateTotalResistance = calculateTotalResistance;
this.calculateVoltageRange = calculateVoltageRange;
this.calculateOutputVoltage = calculateOutputVoltage;
this.findResistorSeries = findResistorSeries;
this.calculateSectionBounds = calculateSectionBounds;`,
        context
    );

    context.ResistorUtils = context.ResistorUtils || context.ResistorUtils;
    context.resistorTolerances = context.ResistorUtils.resistorTolerances;
    return context;
}

module.exports = function runVoltageDividerWorkerTests() {
    const context = loadWorkerContext();

    {
        const r1 = { value: 10000, series: 'E24' };
        const r2 = { value: 10000, series: 'E24' };
        const range = context.calculateVoltageRange(r1, r2, 10);
        assert.ok(Math.abs(range.min - 4.75) < 0.01, 'Expected min ~4.75V for equal 10k at 5%');
        assert.ok(Math.abs(range.max - 5.25) < 0.01, 'Expected max ~5.25V for equal 10k at 5%');
    }

    {
        const r1 = [{ value: 10000 }, { value: 10000 }];
        r1.type = 'series';
        const r2 = [{ value: 10000 }, { value: 10000 }];
        r2.type = 'parallel';
        const totalR1 = context.calculateTotalResistance(r1);
        const totalR2 = context.calculateTotalResistance(r2);
        assert.strictEqual(totalR1, 20000, 'Expected series total 20k');
        assert.ok(Math.abs(totalR2 - 5000) < 0.0001, 'Expected parallel total 5k');
    }

    {
        const output = context.calculateOutputVoltage(10000, 10000, 12);
        assert.ok(Math.abs(output - 6) < 0.0001, 'Expected 12V divider midpoint at 6V');
    }
};
