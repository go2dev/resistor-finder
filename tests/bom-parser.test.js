const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.join(__dirname, '..');
const resistorUtilsSrc = fs.readFileSync(path.join(projectRoot, 'resistor-utils.js'), 'utf8');
const bomParserSrc = fs.readFileSync(path.join(projectRoot, 'bom-parser.js'), 'utf8');

function loadBomParser() {
    const sandbox = { console };
    vm.createContext(sandbox);
    vm.runInContext(resistorUtilsSrc, sandbox);
    vm.runInContext(bomParserSrc, sandbox);
    return sandbox.BomParser;
}

module.exports = function runBomParserTests() {
    const BomParser = loadBomParser();

    assert.strictEqual(BomParser._test.rowHasDnp('R1 10k DNP'), true);
    assert.strictEqual(BomParser._test.rowHasDnp('R1 10k fitted'), false);

    const headers = ['Designator', 'Comment', 'Description'];
    const row1 = { Designator: 'R1', Comment: '10k', Description: 'Resistor 1%' };
    const rowText1 = Object.values(row1).join(' | ');
    assert.strictEqual(BomParser._test.isResistorRow(row1, headers, rowText1).match, true);

    const rowCap = { Designator: 'C1', Comment: '100nF', Description: 'Capacitor' };
    const rowTextCap = Object.values(rowCap).join(' | ');
    assert.strictEqual(BomParser._test.isResistorRow(rowCap, headers, rowTextCap).match, false);

    const csv = [
        'Designator,Value,Footprint,Comment',
        'R1,10k,0603,Resistor 1%',
        'R2,4k7,0603,Resistor',
        'C1,100n,0603,Capacitor',
        'R3,0R,0603,Jumper',
        'R4,22k,0603,DNF'
    ].join('\n');
    const table = BomParser.csvTextToTable(csv);
    const { headers: h2, rows } = BomParser.tableToObjects(table);
    const ex = BomParser.extractResistorsFromRows({ rows, headers: h2, includeDnp: false });
    assert.ok(/10k/i.test(ex.csv));
    assert.ok(/4k7/i.test(ex.csv));
    assert.ok(!ex.csv.includes('100n'));
    assert.ok(!/0r/i.test(ex.csv));
    assert.ok(!/22k/i.test(ex.csv));

    const exDnp = BomParser.extractResistorsFromRows({ rows, headers: h2, includeDnp: true });
    assert.ok(/22k/i.test(exDnp.csv));

    const csvTol = 'Ref,Value,Tolerance\nR10,1k,0.1%\nR11,1k,1%\n';
    const t2 = BomParser.csvTextToTable(csvTol);
    const o2 = BomParser.tableToObjects(t2);
    const ex2 = BomParser.extractResistorsFromRows({ rows: o2.rows, headers: o2.headers, includeDnp: false });
    assert.ok(/\(0\.1%\)/i.test(ex2.csv));
    assert.ok(/\(1%\)/i.test(ex2.csv));
};
