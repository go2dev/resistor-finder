const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadResistorUtils() {
    const utilsCode = fs.readFileSync(path.resolve(__dirname, '..', 'resistor-utils.js'), 'utf8');
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${utilsCode}\nthis.ResistorUtils = ResistorUtils;`, context);
    return context.ResistorUtils;
}

function runTest() {
    const ResistorUtils = loadResistorUtils();

    assert.strictEqual(ResistorUtils.isJlcBasicResistance(10000), true, '10k nominal');
    assert.strictEqual(ResistorUtils.isJlcBasicResistance(10000 + 1e-12), true, 'within float tol');
    assert.strictEqual(ResistorUtils.isJlcBasicResistance(9999), false, 'off-list value');
    assert.strictEqual(ResistorUtils.isJlcBasicResistance(ResistorUtils.parseResistorValue('100m')), true, '100m token');
    assert.strictEqual(ResistorUtils.isJlcBasicResistance(0), false);
    assert.strictEqual(ResistorUtils.isJlcBasicResistance(NaN), false);
}

module.exports = runTest;
