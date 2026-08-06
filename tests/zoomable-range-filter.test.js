const assert = require('assert');
const Z = require('../zoomable-range-filter.js');

function runTest() {
    const c1 = Z.constrainViewDomain(250, 500, 15, 50000, 10);
    assert.strictEqual(c1.viewMin, 250);
    assert.strictEqual(c1.viewMax, 500);

    const c2 = Z.constrainViewDomain(49990, 50010, 15, 50000, 100);
    assert(c2.viewMax <= 50000);
    assert(c2.viewMin >= 15);
    assert(c2.viewMax - c2.viewMin >= 100);

    const z = Z.zoomViewAround(250, 500, 375, 2, 15, 50000, 10);
    const spanBefore = 250;
    const spanAfter = z.viewMax - z.viewMin;
    assert.ok(Math.abs(spanAfter - spanBefore / 2) < 1e-6, 'zoom in halves span');

    const p = Z.panViewByFraction(100, 200, 0.1, 0, 1000, 1);
    assert.strictEqual(p.viewMax - p.viewMin, 100);

    const fit = Z.constrainViewDomain(0, 100000, 15, 50000, 10);
    assert.strictEqual(fit.viewMin, 15);
    assert.strictEqual(fit.viewMax, 50000);

    const step = Z.stepForView(250, 500);
    assert.ok(step >= 1 && Number.isInteger(step));

    const iv = Z.initialViewForFilter(15, 50000, 300, 400, 10);
    assert(iv.viewMin < 300);
    assert(iv.viewMax > 400);
    assert(iv.viewMin >= 15);
    assert(iv.viewMax <= 50000);

    const empty = Z.deriveFullDomain([], null, null);
    assert.strictEqual(empty.fullMin, 0);
    assert.strictEqual(empty.fullMax, 1);

    const single = Z.deriveFullDomain([42], null, null);
    assert.strictEqual(single.fullMin, 41);
    assert.strictEqual(single.fullMax, 43);
}

module.exports = runTest;
