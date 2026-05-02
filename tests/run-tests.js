const tests = [
    require('./target-resistance-worker.test'),
    require('./voltage-divider-worker.test'),
    require('./bom-parser.test')
];

tests.forEach((runTest) => runTest());
console.log('All tests passed.');
