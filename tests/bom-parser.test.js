const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.join(__dirname, '..');
const resistorUtilsSrc = fs.readFileSync(path.join(projectRoot, 'resistor-utils.js'), 'utf8');
const kicadSchSrc = fs.readFileSync(path.join(projectRoot, 'kicad-sch.js'), 'utf8');
const bomParserSrc = fs.readFileSync(path.join(projectRoot, 'bom-parser.js'), 'utf8');

function loadBomParser() {
    const sandbox = { console };
    vm.createContext(sandbox);
    vm.runInContext(resistorUtilsSrc, sandbox);
    vm.runInContext(kicadSchSrc, sandbox);
    vm.runInContext(bomParserSrc, sandbox);
    return { BomParser: sandbox.BomParser, KicadSchParser: sandbox.KicadSchParser };
}

module.exports = function runBomParserTests() {
    const { BomParser, KicadSchParser } = loadBomParser();

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

    const ctxRu = { console: {} };
    vm.createContext(ctxRu);
    vm.runInContext(`${resistorUtilsSrc}\nthis.ResistorUtils = ResistorUtils;`, ctxRu);
    assert.strictEqual(ctxRu.ResistorUtils.parseToleranceInput('E24', null), 5);
    assert.strictEqual(ctxRu.ResistorUtils.parseToleranceInput('e96', null), 1);

    const hBom1 = ['Qty', 'Part Designators', 'Value', 'Description'];
    const rowL = {
        Qty: '',
        'Part Designators': 'L1',
        Value: '75R',
        Description: 'SMD EMI Suppression Ferrite Beads'
    };
    const txtL = Object.values(rowL).join(' | ');
    assert.strictEqual(BomParser._test.isResistorRow(rowL, hBom1, txtL).match, false, 'L ferrite row excluded');

    const rowR33 = {
        Qty: '',
        'Part Designators': 'R1',
        Value: '33R',
        Description: 'Current limit resistor'
    };
    const exR = BomParser.extractResistorsFromRows({ rows: [rowR33], headers: hBom1, includeDnp: false });
    assert.ok(/33R\(5%\)/i.test(exR.csv) || /33\(5%\)/i.test(exR.csv), 'E24 standard -> 5% bracket not E24 label');

    const csvQty = [
        'Designator,Quantity,Description,Footprint',
        '"R1, R2",2,100R 0.5W 5% 1210 SMD,RESC1210_L'
    ].join('\n');
    const tq = BomParser.csvTextToTable(csvQty);
    const oq = BomParser.tableToObjects(tq);
    const exQ = BomParser.extractResistorsFromRows({ rows: oq.rows, headers: oq.headers, includeDnp: false });
    assert.ok(/100R/i.test(exQ.csv) || /100\b/i.test(exQ.csv), 'Quantity column must not be parsed as ohms');
    assert.ok(/\(5%\)/i.test(exQ.csv), 'Tolerance from description');

    const schText = [
        '(kicad_sch (version 20231120) (generator test)',
        '  (symbol "Device:R" (at 0 0 0)',
        '    (in_bom yes) (on_board yes)',
        '    (uuid 11111111-1111-1111-1111-111111111111)',
        '    (property "Reference" "R1" (at 0 0 0) (effects (font (size 1.27 1.27))))',
        '    (property "Value" "10k" (at 0 0 0) (effects (font (size 1.27 1.27))))',
        '    (property "Footprint" "Resistor_SMD:R_0603_1608Metric" (at 0 0 0) (effects (font (size 1.27 1.27))))',
        '    (instances (project "" (path "/123" (reference "R1") (unit 1))))',
        '  )',
        '  (symbol "Device:R" (at 0 0 0)',
        '    (in_bom yes) (on_board yes)',
        '    (uuid 22222222-2222-2222-2222-222222222222)',
        '    (property "Reference" "R2" (at 0 0 0) (effects (font (size 1.27 1.27))))',
        '    (property "Value" "10k" (at 0 0 0) (effects (font (size 1.27 1.27))))',
        '    (property "Footprint" "Resistor_SMD:R_0805_2012Metric" (at 0 0 0) (effects (font (size 1.27 1.27))))',
        '    (instances (project "" (path "/456" (reference "R2") (unit 1))))',
        '  )',
        ')'
    ].join('\n');
    const sch = KicadSchParser.schematicToResistorRows(schText);
    const exSch = BomParser.extractResistorsFromRows({
        rows: sch.rows,
        headers: sch.headers,
        includeDnp: false
    });
    assert.strictEqual((exSch.csv.match(/10k/gi) || []).length, 2, 'Different footprints should keep two 10k entries');
};
