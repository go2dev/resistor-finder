const tests = [
    require('./jlc-basic-utils.test'),
    require('./target-resistance-worker.test'),
    require('./voltage-divider-worker.test'),
    require('./divider-ranking.test'),
    require('./zoomable-range-filter.test')
];

tests.forEach((runTest) => runTest());
console.log('All tests passed.');
