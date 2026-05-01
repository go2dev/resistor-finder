// Function to check if Web Workers are supported
function checkWebWorkerSupport() {
    try {
        // Check if Worker is available
        if (typeof Worker === 'undefined') {
            return false;
        }
        
        // Try to create a simple worker to ensure it actually works
        const testWorker = new Worker('data:text/javascript,self.postMessage("test");');
        testWorker.terminate();
        return true;
    } catch (e) {
        return false;
    }
}

// Global flag for Web Worker support
const webWorkerSupported = checkWebWorkerSupport();

function getDividerMode() {
    const fromBody = document.body?.dataset?.dividerMode;
    if (fromBody === 'upad') return 'upad';
    return 'divider';
}

function upadLoadedTapRatio(rLeg, rMid, zLoad) {
    if (!Number.isFinite(rLeg) || !Number.isFinite(rMid) || rLeg <= 0 || rMid <= 0) return 0;
    if (!Number.isFinite(zLoad) || zLoad <= 0) {
        const denom = 2 * rLeg + rMid;
        return denom > 0 ? (rMid + rLeg) / denom : 0;
    }
    const sumMidBot = rMid + rLeg;
    const req = (sumMidBot * zLoad) / (sumMidBot + zLoad);
    const den = rLeg + req;
    return den > 0 ? req / den : 0;
}

function idealUpadLegForMid(rMid, targetRatio, zLoad) {
    if (!Number.isFinite(rMid) || rMid <= 0 || !Number.isFinite(targetRatio) || targetRatio <= 0 || targetRatio >= 1) {
        return NaN;
    }
    const t = targetRatio;
    const M = rMid;
    if (!Number.isFinite(zLoad) || zLoad <= 0) {
        return (M / 2) * (1 / t - 1);
    }
    const Z = zLoad;
    const a = t;
    const b = t * M + 2 * t * Z - Z;
    const c = -Z * M * (1 - t);
    if (Math.abs(a) < 1e-30) return NaN;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return NaN;
    const sqrtD = Math.sqrt(disc);
    const r1 = (-b + sqrtD) / (2 * a);
    const r2 = (-b - sqrtD) / (2 * a);
    const pick = (x) => (Number.isFinite(x) && x > 0 ? x : NaN);
    const x1 = pick(r1);
    const x2 = pick(r2);
    if (Number.isFinite(x1) && Number.isFinite(x2)) return Math.min(x1, x2);
    return Number.isFinite(x1) ? x1 : x2;
}

function dbToVoltageRatio(db) {
    if (!Number.isFinite(db)) return NaN;
    return Math.pow(10, -db / 20);
}

function voltageRatioToDb(ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return NaN;
    return -20 * Math.log10(ratio);
}

function parallelTwo(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return NaN;
    return (a * b) / (a + b);
}

function computeUpadAnalysis(rLeg, rMid, vin, zLoad) {
    const Rt = rLeg;
    const Rm = rMid;
    const Rb = rLeg;
    const zInOpen = 2 * Rt + Rm;
    const zOutThevenin = parallelTwo(Rt, Rm + Rb);
    let vTap = 0;
    let iTop = 0;
    let iMid = 0;
    let iBot = 0;
    let iLoad = 0;
    let zInLoaded = zInOpen;
    let pTop = 0;
    let pMid = 0;
    let pBot = 0;
    let pLoad = 0;

    if (!Number.isFinite(vin) || vin <= 0) {
        return {
            zInOpen,
            zInLoaded: NaN,
            zOutThevenin,
            vTap: 0,
            vMidNode: 0,
            iTop: 0,
            iMid: 0,
            iBot: 0,
            iLoad: 0,
            pTop: 0,
            pMid: 0,
            pBot: 0,
            pLoad: 0,
            insertionLossDb: NaN
        };
    }

    let vMidNode = 0;
    if (!Number.isFinite(zLoad) || zLoad <= 0) {
        vTap = upadLoadedTapRatio(Rt, Rm, 0) * vin;
        iTop = iMid = iBot = vin / zInOpen;
        zInLoaded = zInOpen;
        vMidNode = vTap * (Rb / (Rm + Rb));
        pTop = iTop * iTop * Rt;
        pMid = iMid * iMid * Rm;
        pBot = iBot * iBot * Rb;
        pLoad = 0;
    } else {
        const sumMidBot = Rm + Rb;
        const req = (sumMidBot * zLoad) / (sumMidBot + zLoad);
        zInLoaded = Rt + req;
        iTop = vin / zInLoaded;
        vTap = iTop * req;
        iLoad = vTap / zLoad;
        vMidNode = vTap * (Rb / sumMidBot);
        iBot = vMidNode / Rb;
        iMid = iTop - iLoad;
        pTop = iTop * iTop * Rt;
        pMid = (vTap - vMidNode) * (vTap - vMidNode) / Rm;
        pBot = iBot * iBot * Rb;
        pLoad = vTap * vTap / zLoad;
    }

    const ratio = vTap / vin;
    const insertionLossDb = voltageRatioToDb(ratio);
    return {
        zInOpen,
        zInLoaded,
        zOutThevenin,
        vTap,
        vMidNode,
        iTop,
        iMid,
        iBot,
        iLoad,
        pTop,
        pMid,
        pBot,
        pLoad,
        insertionLossDb
    };
}

function formatUpadCurrent(a) {
    if (!Number.isFinite(a)) return '—';
    const abs = Math.abs(a);
    if (abs >= 1) return `${a.toFixed(4)} A`;
    if (abs >= 0.001) return `${(a * 1000).toFixed(3)} mA`;
    return `${(a * 1e6).toFixed(1)} µA`;
}

function formatImpedanceOhms(ohms, calculator) {
    if (!Number.isFinite(ohms) || ohms <= 0) return '—';
    return `${calculator.formatResistorValue(ohms)}Ω`;
}

function enrichUpadResults(results, ctx) {
    if (!Array.isArray(results) || !ctx) return results;
    const {
        calculator,
        zLoad,
        targetZIn,
        targetZOut,
        targetAttenuationDb,
        minPowerFloorW
    } = ctx;
    const vin = calculator.supplyVoltage;
    const hasZIn = Number.isFinite(targetZIn) && targetZIn > 0;
    const hasZOut = Number.isFinite(targetZOut) && targetZOut > 0;
    const hasTargetDb = Number.isFinite(targetAttenuationDb);

    return results.map(result => {
        if (result.r3 == null) return result;
        const ua = computeUpadAnalysis(result.r1Value, result.r2Value, vin, zLoad);
        const errZIn = hasZIn ? Math.log(ua.zInLoaded / targetZIn) : 0;
        const errZOut = hasZOut ? Math.log(ua.zOutThevenin / targetZOut) : 0;
        const impedanceMatchScore = (hasZIn ? errZIn * errZIn : 0) + (hasZOut ? errZOut * errZOut : 0);
        const errDb = hasTargetDb ? (ua.insertionLossDb - targetAttenuationDb) : 0;
        const errDbHz = hasTargetDb ? (errDb * Math.LN10 / 20) : 0;
        const errZInPct = hasZIn ? (100 * (Math.exp(errZIn) - 1)) : 0;
        const errZOutPct = hasZOut ? (100 * (Math.exp(errZOut) - 1)) : 0;

        const r1Stats = {
            total: ua.pTop,
            components: [{ resistor: result.r1, power: ua.pTop }],
            maxComponentPower: ua.pTop
        };
        const r2Stats = {
            total: ua.pMid,
            components: [{ resistor: result.r2, power: ua.pMid }],
            maxComponentPower: ua.pMid
        };
        const r3Stats = {
            total: ua.pBot,
            components: [{ resistor: result.r3, power: ua.pBot }],
            maxComponentPower: ua.pBot
        };
        const loadDissipation = (!Number.isFinite(zLoad) || zLoad <= 0) ? 0 : ua.pLoad;
        const totalDissipatedInNetwork = ua.pTop + ua.pMid + ua.pBot;
        const maxResistorPower = Math.max(ua.pTop, ua.pMid, ua.pBot);
        const maxComponentPowerSizing = Math.max(
            maxResistorPower,
            Number.isFinite(minPowerFloorW) && minPowerFloorW > 0 ? minPowerFloorW : 0
        );

        return {
            ...result,
            targetTapVoltage: calculator.targetVoltage,
            upad: ua,
            upadZLoad: zLoad,
            insertionLossDb: ua.insertionLossDb,
            impedanceMatchScore,
            errDb,
            errDbHz,
            errZIn,
            errZOut,
            errZInPct,
            errZOutPct,
            upadPowerStats: {
                r1Stats,
                r2Stats,
                r3Stats,
                loadDissipation,
                totalDissipatedInNetwork,
                maxResistorPower,
                maxComponentPowerSizing
            }
        };
    });
}

// Utility object for resistor calculations and formatting is loaded from resistor-utils.js
const resistorTolerances = ResistorUtils.resistorTolerances;

// Global cache for results to avoid recalculation on sort changes
let resultsCache = {
    allResults: null,
    calculatorState: null,
    isValid: false
};

let activeStateCache = new Map();

// Global variables to store current resistance filter range
let currentResistanceRange = {
    min: 0,
    max: Infinity
};

// Function to generate a state key for cache validation
function generateStateKey(calculator, resistorValues, supplyVoltage, targetVoltage, allowOvershoot, mode = getDividerMode()) {
    const resistorKey = resistorValues
        .map(resistor => `${resistor.value}|${resistor.tolerance ?? ''}|${resistor.powerRating ?? ''}|${resistor.powerCode ?? ''}`)
        .sort();
    const base = {
        mode,
        resistorValues: resistorKey,
        supplyVoltage,
        targetVoltage,
        allowOvershoot
    };
    if (mode === 'upad') {
        const zLoadEl = document.getElementById('upadZLoad');
        const dbEl = document.getElementById('upadAttenuationDb');
        const zInEl = document.getElementById('upadZInTarget');
        const zOutEl = document.getElementById('upadZOutTarget');
        const minPowEl = document.getElementById('upadMinPowerW');
        base.upadZLoad = zLoadEl ? zLoadEl.value : '';
        base.upadAttenuationDb = dbEl ? dbEl.value : '';
        base.upadZInTarget = zInEl ? zInEl.value : '';
        base.upadZOutTarget = zOutEl ? zOutEl.value : '';
        base.upadMinPowerW = minPowEl ? minPowEl.value : '';
    }
    return JSON.stringify(base);
}

// Function to check if cache is valid for current state
function isCacheValid(calculator, resistorValues, supplyVoltage, targetVoltage, allowOvershoot) {
    if (!resultsCache.isValid || !resultsCache.allResults) {
        return false;
    }
    
    const currentState = generateStateKey(calculator, resistorValues, supplyVoltage, targetVoltage, allowOvershoot);
    return resultsCache.calculatorState === currentState;
}

// Function to invalidate the cache
function invalidateCache() {
    resultsCache.isValid = false;
    resultsCache.allResults = null;
    resultsCache.calculatorState = null;
}

function sectionToStringForDiagram(section) {
    if (Array.isArray(section)) {
        const type = section.type || 'series';
        return section.map(v => v.value ?? v).join(',') + ',' + type;
    }
    return (section.value ?? section) + ',series';
}

function renderResultDiagram(diagramContainer, result, supplyVoltage, targetVoltage) {
    const diagram = new Diagram(diagramContainer.id, 300, 220);
    if (result.r3 != null) {
        diagram.renderUpad(
            sectionToStringForDiagram(result.r1),
            sectionToStringForDiagram(result.r2),
            sectionToStringForDiagram(result.r3),
            supplyVoltage,
            targetVoltage
        );
    } else {
        diagram.renderCustom(
            sectionToStringForDiagram(result.r1),
            sectionToStringForDiagram(result.r2),
            supplyVoltage,
            targetVoltage
        );
    }
}

function logDividerDebug(...args) {
    if (window.DEBUG_RESISTOR_FINDER) {
        console.log('[divider]', ...args);
    }
}

function getNumericInputValue(input, label) {
    if (!input) {
        return { valid: false, error: `${label} input not found` };
    }
    const raw = input.value !== '' ? input.value : input.defaultValue;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) {
        return { valid: false, error: `Invalid ${label} value` };
    }
    if (parsed <= 0) {
        return { valid: false, error: `${label} must be positive` };
    }
    return { valid: true, value: parsed };
}

function normalizeResistorInput(value) {
    return value.trim().toLowerCase();
}

function getActiveKeyMap() {
    const map = new Map();
    document.querySelectorAll('.parsed-value-box').forEach(box => {
        const key = box.dataset.key || box.dataset.input || box.dataset.id;
        if (!key) return;
        map.set(key, box.classList.contains('active'));
    });
    return map;
}

function resultUsesResistorKey(result, resistorKey) {
    const sectionHasResistor = (section) => {
        if (Array.isArray(section)) {
            return section.some(resistor => (resistor?.key ?? resistor?.id ?? null) === resistorKey);
        }
        return (section?.key ?? section?.id ?? null) === resistorKey;
    };

    if (result.r3 != null) {
        return sectionHasResistor(result.r1) || sectionHasResistor(result.r2) || sectionHasResistor(result.r3);
    }
    return sectionHasResistor(result.r1) || sectionHasResistor(result.r2);
}

function filterResultsByActiveResistors(allResults, activeKeys) {
    const activeSet = new Set(activeKeys);
    const allKeys = Array.from(document.querySelectorAll('.parsed-value-box'))
        .map(box => box.dataset.key || box.dataset.input || box.dataset.id)
        .filter(Boolean);

    const excludedKeys = allKeys.filter(key => !activeSet.has(key));
    if (excludedKeys.length === 0) return allResults;

    return allResults.filter(result => {
        for (const excludedKey of excludedKeys) {
            if (resultUsesResistorKey(result, excludedKey)) {
                return false;
            }
        }
        return true;
    });
}

class ResistorCalculator {
    constructor() {
        this.resistorValues = [];
        this.supplyVoltage = 0;
        this.targetVoltage = 0;
        this.upadZLoad = 0;
        this.results = [];
        this.allowOvershoot = false;
        this.calculationStats = {
            totalCombinations: 0,
            validCombinations: 0,
            inputConversions: [],
            voltageStats: {
                above: 0,
                below: 0,
                exact: 0
            },
            processingInfo: {
                calculationTime: 0,
                cpuCoresUsed: 1,
                processingMode: 'single-threaded'
            }
        };
    }

    // Delegate to utility functions
    parseResistorValue(value) {
        return ResistorUtils.parseResistorValue(value);
    }

    formatResistorValue(value) {
        return ResistorUtils.formatResistorValue(value);
    }

    calculateSeriesResistance(resistors) {
        return ResistorUtils.calculateSeriesResistance(resistors);
    }

    calculateParallelResistance(resistors) {
        return ResistorUtils.calculateParallelResistance(resistors);
    }

    calculateTotalResistance(resistors) {
        return ResistorUtils.calculateTotalResistance(resistors);
    }

    // Format an array of resistor values
    formatResistorArray(resistors) {
        if (!Array.isArray(resistors)) {
            return this.formatResistorValue(resistors.value ?? resistors);
        }
        const type = resistors.type || 'series';
        const values = resistors.map(r => this.formatResistorValue(r.value ?? r)).join(type === 'parallel' ? ' || ' : ' + ');
        return type === 'parallel' ? `(${values})` : values;
    }

    // Calculate output voltage for a voltage divider
    calculateOutputVoltage(r1, r2, supplyVoltage) {
        return (r2 / (r1 + r2)) * supplyVoltage;
    }

    /** Symmetric U-pad: Vout = Vin * (Rmid + Rleg) / (2*Rleg + Rmid) with equal leg resistances Rtop = Rbot = Rleg. */
    calculateUpadOutputVoltage(rLeg, rMid, supplyVoltage) {
        const ratio = upadLoadedTapRatio(rLeg, rMid, this.upadZLoad ?? 0);
        return ratio * supplyVoltage;
    }

    /** Worst-case Vout over independent leg/mid tolerance boxes (monotone in each leg/mid scalar). */
    calculateUpadVoltageRange(rLegTop, rMid, rLegBot, supplyVoltage) {
        const b1 = this.calculateSectionBounds(rLegTop);
        const b2 = this.calculateSectionBounds(rMid);
        const b3 = this.calculateSectionBounds(rLegBot);
        const vmax = supplyVoltage * (b2.upper + b3.upper) / (b1.lower + b2.upper + b3.upper);
        const vmin = supplyVoltage * (b2.lower + b3.lower) / (b1.upper + b2.lower + b3.lower);
        return { min: vmin, max: vmax };
    }

    // Generate all possible combinations of resistors
    generateCombinations(resistors, maxResistors = 4) {
        const combinations = [];
        
        // Single resistor combinations
        for (let r of resistors) {
            combinations.push(r);
        }

        // Series combinations (avoid duplicates by using j = i)
        for (let i = 0; i < resistors.length; i++) {
            for (let j = i; j < resistors.length; j++) {
                const series = [resistors[i], resistors[j]];
                series.type = 'series';
                combinations.push(series);
            }
        }

        // Parallel combinations (avoid duplicates by using j = i)
        for (let i = 0; i < resistors.length; i++) {
            for (let j = i; j < resistors.length; j++) {
                const parallel = [resistors[i], resistors[j]];
                parallel.type = 'parallel';
                combinations.push(parallel);
            }
        }

        return combinations;
    }

    // Parallel version using Web Workers
    async findVoltageDividerCombinationsParallel(progressCallback) {
        const combinations = this.generateCombinations(this.resistorValues);
        
        // Pre-calculate all resistance values
        const resistanceCache = new Map();
        for (let i = 0; i < combinations.length; i++) {
            const combo = combinations[i];
            const resistance = this.calculateTotalResistance(combo);
            resistanceCache.set(i, resistance);
        }
        
        // Sort combinations by resistance
        const sortedIndices = Array.from({length: combinations.length}, (_, i) => i)
            .sort((a, b) => resistanceCache.get(a) - resistanceCache.get(b));
        
        const targetRatio = this.targetVoltage / this.supplyVoltage;
        
        // Determine number of workers based on available cores
        const numWorkers = navigator.hardwareConcurrency || 4;
        
        // Split work into chunks
        const chunkSize = Math.ceil(sortedIndices.length / numWorkers);
        const chunks = [];
        
        for (let i = 0; i < numWorkers; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, sortedIndices.length);
            if (start < end) {
                chunks.push(Array.from({length: end - start}, (_, j) => start + j));
            }
        }
        
        // Create workers
        const workers = [];
        const workerPromises = [];
        
        // Convert Map to array for serialization
        const resistanceCacheArray = Array.from(resistanceCache.entries());
        
        // Initialize stats
        this.calculationStats.totalCombinations = combinations.length * Math.min(combinations.length, 100);
        this.calculationStats.validCombinations = 0;
        this.calculationStats.voltageStats = {
            above: 0,
            below: 0,
            exact: 0
        };
        
        const startTime = Date.now();
        let processedChunks = 0;
        let allResults = [];
        
        // Process chunks in parallel
        for (let i = 0; i < chunks.length; i++) {
            const worker = new Worker('resistor-worker.js');
            workers.push(worker);
            
            const promise = new Promise((resolve, reject) => {
                let initialized = false;
                
                worker.onmessage = (e) => {
                    const { type } = e.data;
                    
                    if (type === 'initialized') {
                        initialized = true;
                        // Send chunk to process
                        worker.postMessage({
                            type: 'processChunk',
                            data: {
                                r2Indices: chunks[i],
                                combinations: combinations,
                                resistanceCacheArray: resistanceCacheArray,
                                sortedIndices: sortedIndices,
                                supplyVoltage: this.supplyVoltage,
                                targetVoltage: this.targetVoltage,
                                allowOvershoot: this.allowOvershoot,
                                targetRatio: targetRatio
                            }
                        });
                    } else if (type === 'chunkComplete') {
                        const { results, stats } = e.data;
                        
                        // Use concat instead of spread to avoid stack overflow with large arrays
                        if (results && results.length > 0) {
                            allResults = allResults.concat(results);
                        }
                        
                        // Update global stats
                        this.calculationStats.validCombinations += stats.validCombinations;
                        this.calculationStats.voltageStats.above += stats.voltageStats.above;
                        this.calculationStats.voltageStats.below += stats.voltageStats.below;
                        this.calculationStats.voltageStats.exact += stats.voltageStats.exact;
                        
                        processedChunks++;
                        
                        // Update progress
                        if (progressCallback) {
                            const progress = (processedChunks / chunks.length) * 100;
                            progressCallback(Math.floor(progress), 100);
                        }
                        
                        worker.terminate();
                        resolve();
                    } else if (type === 'error') {
                        worker.terminate();
                        reject(new Error(e.data.error));
                    }
                };
                
                worker.onerror = (error) => {
                    worker.terminate();
                    reject(error);
                };
                
                // Initialize worker - only send data, not functions
                worker.postMessage({
                    type: 'init',
                    data: {
                        ResistorUtils: {
                            series: ResistorUtils.series  // Only send the series data
                        },
                        resistorTolerances: resistorTolerances
                    }
                });
            });
            
            workerPromises.push(promise);
        }
        
        // Wait for all workers to complete
        try {
            await Promise.all(workerPromises);
        } catch (error) {
            console.error('Worker error:', error);
            // Terminate all workers on error
            workers.forEach(w => w.terminate());
            throw error;
        }
        
        const elapsed = (Date.now() - startTime) / 1000;
        
        // Update processing info
        this.calculationStats.processingInfo = {
            calculationTime: elapsed,
            cpuCoresUsed: numWorkers,
            processingMode: 'multi-core parallel'
        };
        
        // Final progress update
        if (progressCallback) {
            progressCallback(100, 100);
        }
        
        return allResults;
    }

    // Async version of findVoltageDividerCombinations for better performance
    async findVoltageDividerCombinationsAsync(progressCallback) {
        const combinations = this.generateCombinations(this.resistorValues);
        const results = [];
        
        // Pre-calculate all resistance values to avoid recalculation
        const resistanceCache = new Map();
        for (let i = 0; i < combinations.length; i++) {
            const combo = combinations[i];
            const resistance = this.calculateTotalResistance(combo);
            resistanceCache.set(i, resistance);
        }
        
        // Sort combinations by resistance for more efficient searching
        const sortedIndices = Array.from({length: combinations.length}, (_, i) => i)
            .sort((a, b) => resistanceCache.get(a) - resistanceCache.get(b));
        
        // Track unique voltage divider ratios to eliminate duplicates
        const seenRatios = new Map();
        
        // For large datasets, we need a smarter approach
        // Instead of testing all NxN combinations, we can use the fact that
        // for a target voltage Vout and supply Vsupply, we need R2/(R1+R2) = Vout/Vsupply
        // So for each R2, we can calculate the ideal R1 and search nearby values
        const targetRatio = this.targetVoltage / this.supplyVoltage;
        
        let processed = 0;
        let skipped = 0;
        const batchSize = 1000;
        const startTime = Date.now();
        
        // Set a more realistic total for progress reporting
        // We'll actually test far fewer combinations
        this.calculationStats.totalCombinations = combinations.length * Math.min(combinations.length, 100);
        this.calculationStats.validCombinations = 0;
        this.calculationStats.voltageStats = {
            above: 0,
            below: 0,
            exact: 0
        };

        try {
            // For each possible R2 value
            for (let j = 0; j < sortedIndices.length; j++) {
                const r2Idx = sortedIndices[j];
                const r2Value = resistanceCache.get(r2Idx);
                
                if (!r2Value || r2Value === 0) continue;
                
                // Calculate ideal R1 for this R2
                // From R2/(R1+R2) = targetRatio, we get R1 = R2 * (1/targetRatio - 1)
                const idealR1 = r2Value * (1/targetRatio - 1);
                
                // Find R1 values close to the ideal using binary search
                let searchRange = Math.min(combinations.length, 100); // Limit search range
                
                // Binary search for closest R1
                let left = 0, right = sortedIndices.length - 1;
                let closestIdx = 0;
                let minDiff = Infinity;
                
                while (left <= right) {
                    const mid = Math.floor((left + right) / 2);
                    const midValue = resistanceCache.get(sortedIndices[mid]);
                    const diff = Math.abs(midValue - idealR1);
                    
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestIdx = mid;
                    }
                    
                    if (midValue < idealR1) {
                        left = mid + 1;
                    } else {
                        right = mid - 1;
                    }
                }
                
                // Test combinations around the closest value
                const testRange = Math.min(50, Math.floor(sortedIndices.length / 10)); // Test nearby values
                const startIdx = Math.max(0, closestIdx - testRange);
                const endIdx = Math.min(sortedIndices.length - 1, closestIdx + testRange);
                
                for (let k = startIdx; k <= endIdx; k++) {
                    const r1Idx = sortedIndices[k];
                    const r1Value = resistanceCache.get(r1Idx);
                    
                    if (!r1Value || r1Value === 0) continue;
                    
                    // Create a unique key based on the voltage divider ratio
                    const ratio = r2Value / (r1Value + r2Value);
                    const ratioKey = ratio.toFixed(10);
                    
                    // Check if we've already seen this exact ratio
                    const existingEntry = seenRatios.get(ratioKey);
                    if (existingEntry) {
                        const totalR = r1Value + r2Value;
                        const componentCount = this.getComponentCount({ r1: combinations[r1Idx], r2: combinations[r2Idx] });
                        if (
                            componentCount > existingEntry.componentCount
                            || (componentCount === existingEntry.componentCount && totalR >= existingEntry.totalR)
                        ) {
                            processed++;
                            skipped++;
                            continue;
                        }
                    }
                    
                    const outputVoltage = ratio * this.supplyVoltage;
                    const error = outputVoltage - this.targetVoltage;
                    
                    // Only include results that are within bounds or if overshoot is allowed
                    if (this.allowOvershoot || error <= 0) {
                        this.calculationStats.validCombinations++;
                        
                        // Update voltage statistics
                        if (Math.abs(error) < 0.0001) {
                            this.calculationStats.voltageStats.exact++;
                        } else if (error > 0) {
                            this.calculationStats.voltageStats.above++;
                        } else {
                            this.calculationStats.voltageStats.below++;
                        }
                        
                        // Calculate voltage range considering tolerances
                        const voltageRange = this.calculateVoltageRange(combinations[r1Idx], combinations[r2Idx], this.supplyVoltage);
                        
                        const result = {
                            r1: combinations[r1Idx],
                            r2: combinations[r2Idx],
                            r1Value: r1Value,
                            r2Value: r2Value,
                            outputVoltage: outputVoltage,
                            error: error,
                            componentCount: this.getComponentCount({ r1: combinations[r1Idx], r2: combinations[r2Idx] }),
                            voltageRange: voltageRange,
                            totalResistance: r1Value + r2Value
                        };
                        
                        results.push(result);
                        
                        // Update our tracking map
                        seenRatios.set(ratioKey, {
                            totalR: r1Value + r2Value,
                            componentCount: result.componentCount,
                            result: result
                        });
                    }
                    
                    processed++;
                }
                
                // Update progress periodically
                if (j % 10 === 0) {
                    if (progressCallback) {
                        const progress = (j / sortedIndices.length) * 100;
                        progressCallback(Math.floor(progress), 100);
                    }
                    await new Promise(resolve => setTimeout(resolve, 0));
                    
                    // Progress tracking handled by progress callback
                }
            }
        } catch (error) {
            console.error('Error during calculation:', error);
            throw error;
        }
        
        // Update stats
        const elapsed = (Date.now() - startTime) / 1000;
        
        // Update processing info
        this.calculationStats.processingInfo = {
            calculationTime: elapsed,
            cpuCoresUsed: 1,
            processingMode: 'single-threaded'
        };
        
        // Final progress update
        if (progressCallback) {
            progressCallback(100, 100);
        }

        return results;
    }

    async findUpadCombinationsAsync(progressCallback) {
        const combinations = this.generateCombinations(this.resistorValues);
        const results = [];
        const resistanceCache = new Map();
        for (let i = 0; i < combinations.length; i++) {
            resistanceCache.set(i, this.calculateTotalResistance(combinations[i]));
        }
        const sortedIndices = Array.from({ length: combinations.length }, (_, i) => i)
            .sort((a, b) => resistanceCache.get(a) - resistanceCache.get(b));
        const seenRatios = new Map();
        const targetRatio = this.targetVoltage / this.supplyVoltage;
        const zLoad = this.upadZLoad ?? 0;
        const startTime = Date.now();
        this.calculationStats.totalCombinations = combinations.length * Math.min(combinations.length, 100);
        this.calculationStats.validCombinations = 0;
        this.calculationStats.voltageStats = { above: 0, below: 0, exact: 0 };

        for (let j = 0; j < sortedIndices.length; j++) {
            const rMidIdx = sortedIndices[j];
            const rMidValue = resistanceCache.get(rMidIdx);
            if (!rMidValue || rMidValue === 0) continue;

            const idealLeg = idealUpadLegForMid(rMidValue, targetRatio, zLoad);
                if (!Number.isFinite(idealLeg) || idealLeg <= 0) continue;
            let left = 0;
            let right = sortedIndices.length - 1;
            let closestIdx = 0;
            let minDiff = Infinity;
            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const midValue = resistanceCache.get(sortedIndices[mid]);
                const diff = Math.abs(midValue - idealLeg);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = mid;
                }
                if (midValue < idealLeg) {
                    left = mid + 1;
                } else {
                    right = mid - 1;
                }
            }

            const testRange = Math.min(50, Math.floor(sortedIndices.length / 10));
            const startIdx = Math.max(0, closestIdx - testRange);
            const endIdx = Math.min(sortedIndices.length - 1, closestIdx + testRange);

            for (let k = startIdx; k <= endIdx; k++) {
                const rLegIdx = sortedIndices[k];
                const rLegValue = resistanceCache.get(rLegIdx);
                if (!rLegValue || rLegValue === 0) continue;

                const ratio = upadLoadedTapRatio(rLegValue, rMidValue, zLoad);
                const ratioKey = ratio.toFixed(10);
                const existingEntry = seenRatios.get(ratioKey);
                if (existingEntry) {
                    const totalR = 2 * rLegValue + rMidValue;
                    const componentCount = this.getComponentCount({
                        r1: combinations[rLegIdx],
                        r2: combinations[rMidIdx],
                        r3: combinations[rLegIdx]
                    });
                    if (
                        componentCount > existingEntry.componentCount
                        || (componentCount === existingEntry.componentCount && totalR >= existingEntry.totalR)
                    ) {
                        continue;
                    }
                }

                const outputVoltage = ratio * this.supplyVoltage;
                const error = outputVoltage - this.targetVoltage;
                if (this.allowOvershoot || error <= 0) {
                    this.calculationStats.validCombinations++;
                    if (Math.abs(error) < 0.0001) {
                        this.calculationStats.voltageStats.exact++;
                    } else if (error > 0) {
                        this.calculationStats.voltageStats.above++;
                    } else {
                        this.calculationStats.voltageStats.below++;
                    }
                    const rLegCombo = combinations[rLegIdx];
                    const voltageRange = this.calculateUpadVoltageRange(
                        rLegCombo,
                        combinations[rMidIdx],
                        rLegCombo,
                        this.supplyVoltage
                    );
                    const result = {
                        r1: rLegCombo,
                        r2: combinations[rMidIdx],
                        r3: rLegCombo,
                        r1Value: rLegValue,
                        r2Value: rMidValue,
                        r3Value: rLegValue,
                        outputVoltage,
                        error,
                        componentCount: this.getComponentCount({
                            r1: rLegCombo,
                            r2: combinations[rMidIdx],
                            r3: rLegCombo
                        }),
                        voltageRange,
                        totalResistance: 2 * rLegValue + rMidValue
                    };
                    results.push(result);
                    seenRatios.set(ratioKey, {
                        totalR: result.totalResistance,
                        componentCount: result.componentCount,
                        result
                    });
                }
            }

            if (j % 10 === 0 && progressCallback) {
                progressCallback(Math.floor((j / sortedIndices.length) * 100), 100);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        const elapsed = (Date.now() - startTime) / 1000;
        this.calculationStats.processingInfo = {
            calculationTime: elapsed,
            cpuCoresUsed: 1,
            processingMode: 'single-threaded'
        };
        if (progressCallback) {
            progressCallback(100, 100);
        }
        return results;
    }

    async findUpadCombinationsParallel(progressCallback) {
        const combinations = this.generateCombinations(this.resistorValues);
        const resistanceCache = new Map();
        for (let i = 0; i < combinations.length; i++) {
            resistanceCache.set(i, this.calculateTotalResistance(combinations[i]));
        }
        const sortedIndices = Array.from({ length: combinations.length }, (_, i) => i)
            .sort((a, b) => resistanceCache.get(a) - resistanceCache.get(b));
        const targetRatio = this.targetVoltage / this.supplyVoltage;
        const zLoad = this.upadZLoad ?? 0;
        const numWorkers = navigator.hardwareConcurrency || 4;
        const chunkSize = Math.ceil(sortedIndices.length / numWorkers);
        const chunks = [];
        for (let i = 0; i < numWorkers; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, sortedIndices.length);
            if (start < end) {
                chunks.push(Array.from({ length: end - start }, (_, j) => start + j));
            }
        }
        const resistanceCacheArray = Array.from(resistanceCache.entries());
        this.calculationStats.totalCombinations = combinations.length * Math.min(combinations.length, 100);
        this.calculationStats.validCombinations = 0;
        this.calculationStats.voltageStats = { above: 0, below: 0, exact: 0 };
        const startTime = Date.now();
        const workers = [];
        const workerPromises = [];
        let allResults = [];
        let processedChunks = 0;

        for (let i = 0; i < chunks.length; i++) {
            const worker = new Worker('resistor-worker.js');
            workers.push(worker);
            const promise = new Promise((resolve, reject) => {
                worker.onmessage = (e) => {
                    const { type } = e.data;
                    if (type === 'initialized') {
                        worker.postMessage({
                            type: 'processUpadChunk',
                            data: {
                                rMidIndices: chunks[i],
                                combinations,
                                resistanceCacheArray,
                                sortedIndices,
                                supplyVoltage: this.supplyVoltage,
                                targetVoltage: this.targetVoltage,
                                allowOvershoot: this.allowOvershoot,
                                targetRatio,
                                upadZLoad: zLoad
                            }
                        });
                    } else if (type === 'upadChunkComplete') {
                        const { results, stats } = e.data;
                        if (results && results.length > 0) {
                            allResults = allResults.concat(results);
                        }
                        this.calculationStats.validCombinations += stats.validCombinations;
                        this.calculationStats.voltageStats.above += stats.voltageStats.above;
                        this.calculationStats.voltageStats.below += stats.voltageStats.below;
                        this.calculationStats.voltageStats.exact += stats.voltageStats.exact;
                        processedChunks++;
                        if (progressCallback) {
                            progressCallback(Math.floor((processedChunks / chunks.length) * 100), 100);
                        }
                        worker.terminate();
                        resolve();
                    } else if (type === 'error') {
                        worker.terminate();
                        reject(new Error(e.data.error));
                    }
                };
                worker.onerror = (error) => {
                    worker.terminate();
                    reject(error);
                };
                worker.postMessage({
                    type: 'init',
                    data: {
                        ResistorUtils: { series: ResistorUtils.series },
                        resistorTolerances
                    }
                });
            });
            workerPromises.push(promise);
        }

        try {
            await Promise.all(workerPromises);
        } catch (error) {
            console.error('Worker error:', error);
            workers.forEach(w => w.terminate());
            throw error;
        }

        const elapsed = (Date.now() - startTime) / 1000;
        this.calculationStats.processingInfo = {
            calculationTime: elapsed,
            cpuCoresUsed: numWorkers,
            processingMode: 'multi-core parallel'
        };
        if (progressCallback) {
            progressCallback(100, 100);
        }
        return allResults;
    }

    findUpadCombinations() {
        const combinations = this.generateCombinations(this.resistorValues);
        const results = [];
        this.calculationStats.totalCombinations = combinations.length * combinations.length;
        this.calculationStats.validCombinations = 0;
        this.calculationStats.voltageStats = { above: 0, below: 0, exact: 0 };

        const zLoad = this.upadZLoad ?? 0;
        for (let i = 0; i < combinations.length; i++) {
            const rLeg = combinations[i];
            const rLegValue = this.calculateTotalResistance(rLeg);
            if (!rLegValue || rLegValue === 0) continue;
            for (let j = 0; j < combinations.length; j++) {
                const rMid = combinations[j];
                const rMidValue = this.calculateTotalResistance(rMid);
                if (!rMidValue || rMidValue === 0) continue;
                const ratio = upadLoadedTapRatio(rLegValue, rMidValue, zLoad);
                const outputVoltage = ratio * this.supplyVoltage;
                const error = outputVoltage - this.targetVoltage;
                if (this.allowOvershoot || error <= 0) {
                    this.calculationStats.validCombinations++;
                    if (Math.abs(error) < 0.0001) {
                        this.calculationStats.voltageStats.exact++;
                    } else if (error > 0) {
                        this.calculationStats.voltageStats.above++;
                    } else {
                        this.calculationStats.voltageStats.below++;
                    }
                    const voltageRange = this.calculateUpadVoltageRange(rLeg, rMid, rLeg, this.supplyVoltage);
                    results.push({
                        r1: rLeg,
                        r2: rMid,
                        r3: rLeg,
                        r1Value: rLegValue,
                        r2Value: rMidValue,
                        r3Value: rLegValue,
                        outputVoltage,
                        error,
                        componentCount: this.getComponentCount({ r1: rLeg, r2: rMid, r3: rLeg }),
                        voltageRange,
                        totalResistance: 2 * rLegValue + rMidValue
                    });
                }
            }
        }
        return results;
    }

    // Calculate total number of components in a result
    getComponentCount(result) {
        if (result.r3 != null) {
            const r1Count = Array.isArray(result.r1) ? result.r1.length : 1;
            const r2Count = Array.isArray(result.r2) ? result.r2.length : 1;
            const r3Count = Array.isArray(result.r3) ? result.r3.length : 1;
            return r1Count + r2Count + r3Count;
        }
        const r1Count = Array.isArray(result.r1) ? result.r1.length : 1;
        const r2Count = Array.isArray(result.r2) ? result.r2.length : 1;
        return r1Count + r2Count;
    }

    // Calculate bounds for a resistor value based on tolerance/series
    calculateResistorBounds(resistor) {
        const value = resistor.value ?? resistor;
        let tolerance = resistor.tolerance;
        if (tolerance == null) {
            const seriesName = resistor.series || ResistorUtils.findResistorSeries(value);
            tolerance = seriesName ? resistorTolerances[seriesName] : 0;
        }
        const multiplier = tolerance / 100;
        return {
            lower: value * (1 - multiplier),
            upper: value * (1 + multiplier)
        };
    }

    // Calculate bounds for a series/parallel section
    calculateSectionBounds(section) {
        if (!Array.isArray(section)) {
            return this.calculateResistorBounds(section);
        }

        const type = section.type || 'series';
        const bounds = section.map(resistor => this.calculateResistorBounds(resistor));

        if (type === 'parallel') {
            const min = 1 / bounds.reduce((sum, b) => sum + (1 / b.lower), 0);
            const max = 1 / bounds.reduce((sum, b) => sum + (1 / b.upper), 0);
            return { lower: min, upper: max };
        }

        const lower = bounds.reduce((sum, b) => sum + b.lower, 0);
        const upper = bounds.reduce((sum, b) => sum + b.upper, 0);
        return { lower, upper };
    }

    // Calculate voltage range for a voltage divider considering tolerances
    calculateVoltageRange(r1, r2, supplyVoltage) {
        const r1Bounds = this.calculateSectionBounds(r1);
        const r2Bounds = this.calculateSectionBounds(r2);

        const combinations = [
            { r1: r1Bounds.lower, r2: r2Bounds.lower },
            { r1: r1Bounds.lower, r2: r2Bounds.upper },
            { r1: r1Bounds.upper, r2: r2Bounds.lower },
            { r1: r1Bounds.upper, r2: r2Bounds.upper }
        ];

        const voltages = combinations.map(combo =>
            this.calculateOutputVoltage(combo.r1, combo.r2, supplyVoltage)
        );

        return {
            min: Math.min(...voltages),
            max: Math.max(...voltages)
        };
    }

    // Find voltage divider combinations
    findVoltageDividerCombinations() {
        const combinations = this.generateCombinations(this.resistorValues);
        const results = [];
        this.calculationStats.totalCombinations = combinations.length * combinations.length;
        this.calculationStats.validCombinations = 0;
        this.calculationStats.voltageStats = {
            above: 0,
            below: 0,
            exact: 0
        };

        // Store all valid combinations for debugging
        const allValidCombinations = [];

        for (let r1 of combinations) {
            for (let r2 of combinations) {
                const r1Value = this.calculateTotalResistance(r1);
                const r2Value = this.calculateTotalResistance(r2);
                
                const outputVoltage = this.calculateOutputVoltage(r1Value, r2Value, this.supplyVoltage);
                const error = outputVoltage - this.targetVoltage;
                
                // Only include results that are within bounds or if overshoot is allowed
                if (this.allowOvershoot || error <= 0) {
                    this.calculationStats.validCombinations++;
                    
                    // Update voltage statistics
                    if (Math.abs(error) < 0.0001) {
                        this.calculationStats.voltageStats.exact++;
                    } else if (error > 0) {
                        this.calculationStats.voltageStats.above++;
                    } else {
                        this.calculationStats.voltageStats.below++;
                    }
                    
                    // Calculate voltage range considering tolerances
                    const voltageRange = this.calculateVoltageRange(r1, r2, this.supplyVoltage);
                    
                    const result = {
                        r1: r1,
                        r2: r2,
                        r1Value: r1Value,
                        r2Value: r2Value,
                        outputVoltage: outputVoltage,
                        error: error,
                        componentCount: this.getComponentCount({ r1, r2 }),
                        voltageRange: voltageRange,
                        totalResistance: r1Value + r2Value
                    };
                    
                    results.push(result);
                    allValidCombinations.push(result);
                }
            }
        }

        return results;
    }

    validateResistorValue(value) {
        try {
            const parsed = ResistorUtils.parseResistorInput(value, {
                snapToSeries: document.getElementById('snapToSeries')?.checked,
                snapSeries: document.getElementById('autofillSeries')?.value || 'E24'
            });
            if (parsed.value <= 0) {
                return { valid: false, error: 'Resistor value must be positive' };
            }
            return { valid: true, parsed };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    validateVoltage(value, isSupply = false) {
        const num = parseFloat(value);
        if (isNaN(num)) {
            return { valid: false, error: 'Invalid voltage value' };
        }
        if (num <= 0) {
            return { valid: false, error: 'Voltage must be positive' };
        }
        if (!isSupply && num > this.supplyVoltage) {
            return { valid: false, error: 'Target voltage cannot exceed supply voltage' };
        }
        return { valid: true, value: num };
    }
}

// DOM Elements
const resistorValuesInput = document.getElementById('resistorValues');
const supplyVoltageInput = document.getElementById('supplyVoltage');
const targetVoltageInput = document.getElementById('targetVoltage');
const calculateBtn = document.getElementById('calculateBtn');
const resultsContainer = document.getElementById('results');
const overshootSwitch = document.getElementById('overshoot');

// Legacy functions removed - now using nogui slider

// Event Listeners for supply voltage
if (supplyVoltageInput) {
    supplyVoltageInput.addEventListener('input', () => {
        invalidateCache();
        calculateAndDisplayResults();
    });
}

function wireUpadInputListeners() {
    if (getDividerMode() !== 'upad') return;
    ['upadAttenuationDb', 'upadZLoad', 'upadZInTarget', 'upadZOutTarget', 'upadMinPowerW'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                invalidateCache();
                calculateAndDisplayResults();
            });
        }
    });
}
wireUpadInputListeners();

// Loading spinner helper functions
function showLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    loadingSpinner.style.display = 'block';
    document.body.classList.add('calculating');
    
    // Add multi-core status message
    const existingStatus = loadingSpinner.querySelector('.multicore-status');
    if (!existingStatus && !webWorkerSupported) {
        const statusElement = document.createElement('p');
        statusElement.className = 'multicore-status';
        statusElement.style.color = 'var(--text-secondary)';
        statusElement.style.fontSize = '0.85rem';
        statusElement.style.marginTop = '0.5rem';
        statusElement.textContent = 'Multi-core processing not supported by this browser';
        loadingSpinner.appendChild(statusElement);
    }
}

function hideLoadingSpinner() {
    document.getElementById('loadingSpinner').style.display = 'none';
    document.body.classList.remove('calculating');
}

function updateLoadingProgress(processed, total) {
    const progressText = document.querySelector('.progress-text');
    if (progressText) {
        if (total === 100) {
            // Percentage mode
            progressText.textContent = `${processed}% complete`;
        } else {
            // Count mode
            const percentage = ((processed / total) * 100).toFixed(1);
            progressText.textContent = `${processed.toLocaleString()} / ${total.toLocaleString()} (${percentage}%)`;
        }
    }
}

// Function to perform calculation and update results
async function calculateAndDisplayResults() {
    const calculator = new ResistorCalculator();
    const errors = [];
    const warnings = [];
    const snapToSeries = document.getElementById('snapToSeries')?.checked;
    const dividerMode = getDividerMode();
    let upadZLoad = 0;
    let upadTargetDb = NaN;
    let upadTargetZIn = NaN;
    let upadTargetZOut = NaN;
    let upadMinPowerFloorW = NaN;
    
    // Parse and validate resistor values
    const resistorInputsRaw = resistorValuesInput.value.split(',').map(v => v.trim());
    const uniqueInputMap = new Map();
    const resistorInputs = [];
    resistorInputsRaw.forEach(input => {
        if (!input) return;
        const normalized = normalizeResistorInput(input);
        if (uniqueInputMap.has(normalized)) {
            return;
        }
        uniqueInputMap.set(normalized, true);
        resistorInputs.push(input);
    });
    if (resistorInputs.length !== resistorInputsRaw.filter(Boolean).length) {
        resistorValuesInput.value = resistorInputs.join(', ');
    }
    const validResistors = [];
    
    // Store current active states
    const domActiveMap = getActiveKeyMap();
    const activeStateMap = domActiveMap.size > 0 ? domActiveMap : activeStateCache;
    const occurrenceMap = new Map();
    const dedupeKeys = snapToSeries ? new Set() : null;
    
    resistorInputs.forEach((value, index) => {
        if (!value) return; // Skip empty values
        const normalizedInput = normalizeResistorInput(value);
        const occurrence = (occurrenceMap.get(normalizedInput) || 0) + 1;
        occurrenceMap.set(normalizedInput, occurrence);
        const key = `${normalizedInput}::${occurrence}`;
        const result = calculator.validateResistorValue(value);
        if (result.valid) {
            const parsed = result.parsed;
            const toleranceSeries = parsed.tolerance != null
                ? ResistorUtils.getSeriesForTolerance(parsed.tolerance)
                : null;
            const seriesName = toleranceSeries || parsed.series || ResistorUtils.findResistorSeries(parsed.value);
            const dedupeKey = dedupeKeys
                ? `${parsed.value}|${parsed.tolerance ?? ''}|${parsed.powerRating ?? ''}|${parsed.powerCode ?? ''}|${seriesName ?? ''}`
                : null;
            if (dedupeKey && dedupeKeys.has(dedupeKey)) {
                return;
            }
            if (dedupeKey) {
                dedupeKeys.add(dedupeKey);
            }
            const resistorEntry = {
                id: index,
                key,
                value: parsed.value,
                tolerance: parsed.tolerance,
                powerRating: parsed.powerRating,
                powerCode: parsed.powerCode,
                series: seriesName,
                debug: parsed.debug,
                formatted: calculator.formatResistorValue(parsed.value),
                input: value,
                source: parsed.source,
                active: activeStateMap.has(key) ? activeStateMap.get(key) : true
            };
            validResistors.push(resistorEntry);
            if (parsed.warnings && parsed.warnings.length > 0) {
                parsed.warnings.forEach(warning => warnings.push(`Resistor ${index + 1} ${value}: ${warning}`));
            }
            calculator.calculationStats.inputConversions.push({
                id: index,
                key,
                input: value,
                value: parsed.value,
                formatted: calculator.formatResistorValue(parsed.value),
                series: seriesName,
                tolerance: parsed.tolerance,
                powerRating: parsed.powerRating,
                powerCode: parsed.powerCode,
                debug: parsed.debug,
                active: activeStateMap.has(key) ? activeStateMap.get(key) : true
            });
        } else {
            warnings.push(`Resistor ${index + 1} ${value} ignored: ${result.error}`);
        }
    });

    // Validate supply voltage
    const supplyResult = getNumericInputValue(supplyVoltageInput, 'Supply Voltage');
    if (!supplyResult.valid) {
        errors.push(supplyResult.error);
    } else {
        calculator.supplyVoltage = supplyResult.value;
    }

    if (dividerMode === 'upad') {
        const dbEl = document.getElementById('upadAttenuationDb');
        const zLoadEl = document.getElementById('upadZLoad');
        const zInEl = document.getElementById('upadZInTarget');
        const zOutEl = document.getElementById('upadZOutTarget');
        const minPowEl = document.getElementById('upadMinPowerW');

        const dbRaw = dbEl ? (dbEl.value !== '' ? dbEl.value : dbEl.defaultValue) : '';
        const dbParsed = parseFloat(dbRaw);
        if (!Number.isFinite(dbParsed) || dbParsed < 0) {
            errors.push('Target attenuation (dB) must be a non-negative number');
        } else {
            upadTargetDb = dbParsed;
        }

        const zLoadRes = getNumericInputValue(zLoadEl, 'Z load');
        if (!zLoadRes.valid) {
            errors.push(zLoadRes.error);
        } else {
            upadZLoad = zLoadRes.value;
        }

        if (zInEl && zInEl.value.trim() !== '') {
            const zInRes = getNumericInputValue(zInEl, 'Target Z in');
            if (!zInRes.valid) {
                errors.push(zInRes.error);
            } else {
                upadTargetZIn = zInRes.value;
            }
        }
        if (zOutEl && zOutEl.value.trim() !== '') {
            const zOutRes = getNumericInputValue(zOutEl, 'Target Z out');
            if (!zOutRes.valid) {
                errors.push(zOutRes.error);
            } else {
                upadTargetZOut = zOutRes.value;
            }
        }
        if (minPowEl && minPowEl.value.trim() !== '') {
            const mp = parseFloat(minPowEl.value);
            if (!Number.isFinite(mp) || mp < 0) {
                errors.push('Minimum power for package sizing must be a non-negative number');
            } else {
                upadMinPowerFloorW = mp;
            }
        }

        if (errors.length === 0 && calculator.supplyVoltage) {
            const ratio = dbToVoltageRatio(upadTargetDb);
            calculator.targetVoltage = ratio * calculator.supplyVoltage;
            calculator.upadZLoad = upadZLoad;
            if (targetVoltageInput) {
                targetVoltageInput.value = String(calculator.targetVoltage);
            }
        }
    } else {
        const targetResult = getNumericInputValue(targetVoltageInput, 'Target Voltage');
        if (!targetResult.valid) {
            errors.push(targetResult.error);
        } else if (calculator.supplyVoltage && targetResult.value > calculator.supplyVoltage) {
            errors.push('Target voltage cannot exceed supply voltage');
        } else {
            calculator.targetVoltage = targetResult.value;
        }
    }

    // Set overshoot option
    calculator.allowOvershoot = overshootSwitch.checked;

    const activeResistors = validResistors.filter(resistor => resistor.active !== false);

    // Check if we have enough valid inputs to proceed
    if (activeResistors.length === 0) {
        errors.push('At least one active resistor value is required');
    }

    // If there are critical errors, show them and stop
    if (errors.length > 0) {
        let output = `
            <div class="error">
                <h3>Errors:</h3>
                <ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>
            </div>`;

        if (calculator.calculationStats.inputConversions.length > 0 && window.CommonUI?.renderParsedValuesGrid) {
            output += window.CommonUI.renderParsedValuesGrid({
                conversions: calculator.calculationStats.inputConversions,
                resistorTolerances,
                onClickHandler: 'toggleResistorValue',
                tooltipText: 'Click a value to temporarily exclude/include it from the calculation. Colours indicate the E series of the value'
            });
        }

    resultsContainer.innerHTML = output;
    activeStateCache = new Map(
        calculator.calculationStats.inputConversions.map(conv => [conv.key, conv.active])
    );
    if (window.CommonUI?.normalizeParsedValueWidths) {
        requestAnimationFrame(() => window.CommonUI.normalizeParsedValueWidths(resultsContainer));
    }
        return;
    }

    // Proceed with calculation using valid inputs
    calculator.resistorValues = activeResistors;
    
    // Check if we can use cached results
    let allResults;
    const useCache = isCacheValid(calculator, activeResistors, calculator.supplyVoltage, calculator.targetVoltage, calculator.allowOvershoot);
    
    if (useCache) {
        // Use cached results - no need to recalculate
        allResults = resultsCache.allResults;
    } else {
        // Show loading spinner for large datasets
        const needsSpinner = validResistors.length > 20;
        if (needsSpinner) {
            showLoadingSpinner();
        }
        
                try {
            // Use parallel processing if supported and we have a large dataset
            const useParallel = webWorkerSupported && validResistors.length > 10;
            
            if (dividerMode === 'upad') {
                if (useParallel) {
                    allResults = await calculator.findUpadCombinationsParallel((processed, total) => {
                        updateLoadingProgress(processed, total);
                    });
                } else {
                    allResults = await calculator.findUpadCombinationsAsync((processed, total) => {
                        updateLoadingProgress(processed, total);
                    });
                }
            } else if (useParallel) {
                allResults = await calculator.findVoltageDividerCombinationsParallel((processed, total) => {
                    updateLoadingProgress(processed, total);
                });
            } else {
                allResults = await calculator.findVoltageDividerCombinationsAsync((processed, total) => {
                    updateLoadingProgress(processed, total);
                });
            }
            
            // Update cache
            resultsCache.allResults = allResults;
            resultsCache.calculatorState = generateStateKey(calculator, activeResistors, calculator.supplyVoltage, calculator.targetVoltage, calculator.allowOvershoot);
            resultsCache.isValid = true;
        } finally {
            if (needsSpinner) {
                hideLoadingSpinner();
            }
        }
    }

    if (dividerMode === 'upad' && Array.isArray(allResults) && allResults.length) {
        allResults = enrichUpadResults(allResults, {
            calculator,
            zLoad: upadZLoad,
            targetZIn: upadTargetZIn,
            targetZOut: upadTargetZOut,
            targetAttenuationDb: upadTargetDb,
            minPowerFloorW: upadMinPowerFloorW
        });
        resultsCache.allResults = allResults;
    }
    
    // Apply filtering and sorting to get display results
    let displayResults = filterAndSortResults(allResults, currentResistanceRange.min, currentResistanceRange.max);
    if (displayResults.length === 0 && allResults.length > 0) {
        const resistances = allResults.map(r => r.totalResistance);
        const minRes = Math.min(...resistances);
        const maxRes = Math.max(...resistances);
        currentResistanceRange.min = minRes;
        currentResistanceRange.max = maxRes;
        const slider = document.getElementById('resistance-slider');
        if (slider && slider.noUiSlider) {
            slider.noUiSlider.updateOptions({
                range: {
                    min: minRes,
                    max: maxRes
                }
            });
            slider.noUiSlider.set([minRes, maxRes]);
            formatResistanceSliderPips(slider);
        }
        logDividerDebug('Reset filter range due to empty results', { minRes, maxRes });
        displayResults = filterAndSortResults(allResults, currentResistanceRange.min, currentResistanceRange.max);
    }

    // Display results with warnings if any
    let output = '';
    if (warnings.length > 0) {
        output += `
            <div class="warnings-section">
                <h3>Warnings</h3>
                <table class="warnings-table">
                    <thead>
                        <tr>
                            <th>Input</th>
                            <th>Value</th>
                            <th>Issue</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${warnings.map(w => {
                            const [input, issue] = w.split(' ignored: ');
                            const value = input.split(' ').pop();
                            const inputLabel = input.substring(0, input.lastIndexOf(' '));
                            return `
                                <tr>
                                    <td>${inputLabel}</td>
                                    <td>${value}</td>
                                    <td>${issue}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // Add parsed values display
    if (calculator.calculationStats.inputConversions.length > 0 && window.CommonUI?.renderParsedValuesGrid) {
        output += window.CommonUI.renderParsedValuesGrid({
            conversions: calculator.calculationStats.inputConversions,
            resistorTolerances,
            onClickHandler: 'toggleResistorValue',
            tooltipText: 'Click a value to temporarily exclude/include it from the calculation. Colours indicate the E series of the value'
        });
    }

    // Add snap to E-series toggle
    const snapChecked = document.getElementById('snapToSeries')?.checked ? 'checked' : '';
    output += `
        <div class="snap-toggle-section">
            <div class="theme-switch-wrapper">
                <label class="theme-switch" for="snapToSeries">
                    <input type="checkbox" id="snapToSeries" ${snapChecked} onchange="calculateAndDisplayResults()" />
                    <div class="slider round"></div>
                </label>
                <span class="theme-label">Snap to E-series values</span>
                <div class="help-tooltip">
                    ?
                    <span class="tooltip-text">
                        When enabled, parsed values are snapped to the nearest E-series value. If a tolerance is specified,
                        the closest matching E-series is used. When disabled, inputs are used as-is, including non-standard values.
                    </span>
                </div>
            </div>
        </div>`;

    output += renderResults(displayResults, calculator);

    // Add calculation details if enabled
        output += `
            <div class="details-section">
                <h3>Calculation Details</h3>
                <div class="details-content">
                    <div class="input-conversions">
                        <h4>Input Value Conversions</h4>
                        <table class="details-table">
                            <thead>
                                <tr>
                                    <th>Input</th>
                                    <th>Value (Ω)</th>
                                    <th>Formatted</th>
                                    <th>Series</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${calculator.calculationStats.inputConversions.map(conv => `
                                    <tr>
                                        <td>${conv.input}</td>
                                        <td>${conv.value}</td>
                                        <td>${conv.formatted}</td>
                                        <td>${conv.series || 'None'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="combination-stats">
                        <h4>Combination Statistics</h4>
                        <p>Total combinations tested: ${calculator.calculationStats.totalCombinations.toLocaleString()}</p>
                        <p>Valid combinations: ${calculator.calculationStats.validCombinations.toLocaleString()}</p>
                        <p>Calculation time: ${calculator.calculationStats.processingInfo.calculationTime.toFixed(2)}s</p>
                        <p>Processing mode: ${calculator.calculationStats.processingInfo.processingMode}</p>
                        <p>CPU cores used: ${calculator.calculationStats.processingInfo.cpuCoresUsed}</p>
                        <div class="voltage-stats">
                            <h4>Voltage Distribution</h4>
                            <p>Above target: ${calculator.calculationStats.voltageStats.above.toLocaleString()}</p>
                            <p>Below target: ${calculator.calculationStats.voltageStats.below.toLocaleString()}</p>
                            <p>Exactly at target: ${calculator.calculationStats.voltageStats.exact.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>`;

    resultsContainer.innerHTML = output;
    logDividerDebug('Results updated', {
        allResults: allResults.length,
        displayResults: displayResults.length,
        filterRange: currentResistanceRange
    });
    activeStateCache = new Map(
        calculator.calculationStats.inputConversions.map(conv => [conv.key, conv.active])
    );

    // Initialize diagrams for each result
    document.querySelectorAll('.result-diagram').forEach((diagramContainer, idx) => {
        const result = displayResults[idx];
        renderResultDiagram(
            diagramContainer,
            result,
            calculator.supplyVoltage,
            result.outputVoltage
        );
    });

    // Initialize resistance filter slider with all results
    initializeResistanceFilter(allResults);
    
    // Initialize per-card sliders and power displays
    initializeResultCardSliders(displayResults, calculator);
}

// Event Listeners
calculateBtn.addEventListener('click', calculateAndDisplayResults);
if (overshootSwitch) {
    overshootSwitch.addEventListener('change', calculateAndDisplayResults);
}
document.getElementById('sortBy').addEventListener('change', calculateAndDisplayResults);

// Theme Switcher
const toggleSwitch = document.getElementById('checkbox');
const appVersionEl = document.getElementById('appVersion');

// Function to detect system dark mode preference
function getSystemThemePreference() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Function to set theme
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (toggleSwitch) {
        toggleSwitch.checked = theme === 'dark';
    }
}

// Initialize theme
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme) {
        // User has manually set a theme preference
        setTheme(savedTheme);
    } else {
        // No saved preference, use system preference
        const systemTheme = getSystemThemePreference();
        setTheme(systemTheme);
    }
}

function initializeAppVersion() {
    if (!appVersionEl) return;
    const cacheBust = Date.now();
    fetch(`version.json?cb=${cacheBust}`)
        .then(response => response.ok ? response.json() : null)
        .then(data => {
            if (data && data.version) {
                appVersionEl.textContent = data.version;
            }
        })
        .catch(() => {});
}

// Listen for system theme changes
function handleSystemThemeChange(e) {
    const savedTheme = localStorage.getItem('theme');
    // Only auto-switch if user hasn't manually set a preference
    if (!savedTheme) {
        const newTheme = e.matches ? 'dark' : 'light';
        setTheme(newTheme);
    }
}

// Initialize theme on load
initializeTheme();
initializeAppVersion();

// Set up system theme change listener
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handleSystemThemeChange);
}

function switchTheme(e) {
    if (e.target.checked) {
        setTheme('dark');
    } else {
        setTheme('light');
    }    
}

toggleSwitch.addEventListener('change', switchTheme, false);

// Tooltip positioning
function positionTooltip(tooltip) {
    const tooltipText = tooltip.querySelector('.tooltip-text');
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipTextRect = tooltipText.getBoundingClientRect();
    
    // Reset any previous positioning
    tooltipText.style.bottom = '';
    tooltipText.style.top = '';
    tooltipText.style.left = '';
    tooltipText.style.right = '';
    tooltipText.style.transform = '';
    
    // Check if tooltip would go off the top of the screen
    if (tooltipRect.top - tooltipTextRect.height < 0) {
        tooltipText.style.top = '125%';
        tooltipText.style.bottom = 'auto';
        // Adjust arrow position
        tooltipText.style.setProperty('--arrow-top', 'auto');
        tooltipText.style.setProperty('--arrow-bottom', '100%');
        tooltipText.style.setProperty('--arrow-border-color', 'transparent transparent var(--input-border) transparent');
    } else {
        tooltipText.style.bottom = '125%';
        tooltipText.style.top = 'auto';
        // Adjust arrow position
        tooltipText.style.setProperty('--arrow-top', '100%');
        tooltipText.style.setProperty('--arrow-bottom', 'auto');
        tooltipText.style.setProperty('--arrow-border-color', 'var(--input-border) transparent transparent transparent');
    }
    
    // Check if tooltip would go off the left of the screen
    if (tooltipRect.left + (tooltipTextRect.width / 2) < 0) {
        tooltipText.style.left = '0';
        tooltipText.style.transform = 'none';
    }
    // Check if tooltip would go off the right of the screen
    else if (tooltipRect.right + (tooltipTextRect.width / 2) > window.innerWidth) {
        tooltipText.style.right = '0';
        tooltipText.style.left = 'auto';
        tooltipText.style.transform = 'none';
    }
    else {
        tooltipText.style.left = '50%';
        tooltipText.style.transform = 'translateX(-50%)';
    }
}

// Initialize tooltips
document.addEventListener('DOMContentLoaded', () => {
    const tooltips = document.querySelectorAll('.help-tooltip');
    
    tooltips.forEach(tooltip => {
        // Position on load
        positionTooltip(tooltip);
        
        // Position on hover/touch
        tooltip.addEventListener('mouseenter', () => positionTooltip(tooltip));
        tooltip.addEventListener('touchstart', () => positionTooltip(tooltip));
    });
    
    // Reposition on window resize
    window.addEventListener('resize', () => {
        tooltips.forEach(tooltip => positionTooltip(tooltip));
    });
});

// Add this function at the end of the file, before the last closing brace
async function toggleResistorValue(element) {
    element.classList.toggle('disabled');
    element.classList.toggle('active');
    const key = element.dataset.key || element.dataset.input || element.dataset.id;
    if (key) {
        activeStateCache.set(key, element.classList.contains('active'));
    }

    // Recalculate using only active inputs to avoid ratio dedupe removing valid alternatives
    invalidateCache();
    await calculateAndDisplayResults();
}

// New function to update only the results display without regenerating the entire UI
function updateResultsDisplay(displayResults) {
    const resultsSection = document.querySelector('.results-section');
    if (!resultsSection) return;

    const calculator = new ResistorCalculator();
    const supplyResult = getNumericInputValue(supplyVoltageInput, 'Supply Voltage');
    calculator.supplyVoltage = supplyResult.valid ? supplyResult.value : 0;

    if (getDividerMode() === 'upad') {
        const dbEl = document.getElementById('upadAttenuationDb');
        const dbRaw = dbEl ? (dbEl.value !== '' ? dbEl.value : dbEl.defaultValue) : '';
        const dbParsed = parseFloat(dbRaw);
        if (Number.isFinite(dbParsed) && calculator.supplyVoltage) {
            calculator.targetVoltage = dbToVoltageRatio(dbParsed) * calculator.supplyVoltage;
        }
    } else {
        const targetResult = getNumericInputValue(targetVoltageInput, 'Target Voltage');
        calculator.targetVoltage = targetResult.valid ? targetResult.value : 0;
    }

    resultsSection.outerHTML = renderResults(displayResults, calculator);

    document.querySelectorAll('.result-diagram').forEach((diagramContainer, idx) => {
        const result = displayResults[idx];
        if (result) {
            renderResultDiagram(
                diagramContainer,
                result,
                calculator.supplyVoltage,
                result.outputVoltage
            );
        }
    });

    initializeResultCardSliders(displayResults, calculator);

    const activeResistors = Array.from(document.querySelectorAll('.parsed-value-box.active'))
        .map(box => box.dataset.key || box.dataset.input || box.dataset.id)
        .filter(Boolean);
    const filteredAllResults = filterResultsByActiveResistors(resultsCache.allResults, activeResistors);
    const shouldResetRange = displayResults.length === 0 && filteredAllResults.length > 0;
    updateResistanceFilterRange(filteredAllResults, shouldResetRange);
}

// Function to update the resistance filter range based on filtered results
function updateResistanceFilterRange(filteredResults, forceReset = false) {
    const slider = document.getElementById('resistance-slider');
    if (!slider || !slider.noUiSlider) return;
    
    if (filteredResults.length === 0) {
        // No results, disable the slider
        slider.setAttribute('disabled', true);
        logDividerDebug('Filter range update: no results');
        return;
    } else {
        // Re-enable the slider if it was disabled
        slider.removeAttribute('disabled');
    }
    
    // Calculate new min and max from filtered results
    const resistances = filteredResults.map(r => r.totalResistance);
    const minRes = Math.min(...resistances);
    const maxRes = Math.max(...resistances);
    
    // Only update if the range has changed significantly
    const currentRange = slider.noUiSlider.options.range;
    if (forceReset || Math.abs(currentRange.min - minRes) > 0.01 || Math.abs(currentRange.max - maxRes) > 0.01) {
        // Reset current filter range to include all results
        currentResistanceRange.min = minRes;
        currentResistanceRange.max = maxRes;
        
        // Update slider range
        slider.noUiSlider.updateOptions({
            range: {
                'min': minRes,
                'max': maxRes
            }
        });
        
        // Reset slider position to full range
        slider.noUiSlider.set([minRes, maxRes]);
        formatResistanceSliderPips(slider);
        logDividerDebug('Filter range reset', { minRes, maxRes, forceReset });
    }
}

function formatResistanceSliderPips(slider) {
    const pips = slider.querySelectorAll('.noUi-value');
    pips.forEach(pip => {
        const value = parseFloat(pip.getAttribute('data-value'));
        if (!isNaN(value)) {
            pip.textContent = ResistorUtils.formatResistanceLabel(value);
        }
    });
}

// Test function for resistor value parsing
function testResistorParsing() {
    const calculator = new ResistorCalculator();
    const testCases = [
        // Decimal notation tests
        { input: "2.2k", expected: 2200, description: "Decimal notation with k" },
        { input: "43.2k", expected: 43200, description: "Decimal notation with larger number" },
        { input: "1.5M", expected: 1500000, description: "Decimal notation with M" },
        { input: "0.1k", expected: 100, description: "Decimal notation with leading zero" },
        { input: "2.2m", expected: 0.0022, description: "Decimal notation with m" },
        
        // Letter notation tests
        { input: "2k2", expected: 2200, description: "Letter notation with k" },
        { input: "43k2", expected: 43200, description: "Letter notation with larger number" },
        { input: "1M5", expected: 1500000, description: "Letter notation with M" },
        { input: "0k1", expected: 100, description: "Letter notation with leading zero" },
        { input: "2m2", expected: 0.0022, description: "Letter notation with m" },
        
        // Plain number tests
        { input: "2200", expected: 2200, description: "Plain number" },
        { input: "100", expected: 100, description: "Plain number" },
        
        // Edge cases
        { input: "1k", expected: 1000, description: "Simple k notation" },
        { input: "1M", expected: 1000000, description: "Simple M notation" },
        { input: "1R", expected: 1, description: "Simple R notation" },
        { input: "1m", expected: 0.001, description: "Simple m notation" }
    ];

    console.log("Testing resistor value parsing...");
    let passed = 0;
    let failed = 0;

    testCases.forEach(test => {
        try {
            const result = calculator.parseResistorValue(test.input);
            const success = Math.abs(result - test.expected) < 0.0001; // Use small epsilon for floating point comparison
            
            if (success) {
                console.log(`✅ PASS: ${test.description} - ${test.input} = ${result}`);
                passed++;
            } else {
                console.log(`❌ FAIL: ${test.description} - ${test.input} = ${result} (expected ${test.expected})`);
                failed++;
            }
        } catch (error) {
            console.log(`❌ ERROR: ${test.description} - ${test.input} - ${error.message}`);
            failed++;
        }
    });

    console.log(`\nTest Summary: ${passed} passed, ${failed} failed`);
}

// Run tests when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // ... existing DOMContentLoaded code ...
    
    // Run the tests
    // testResistorParsing(); // Commented out to prevent automatic test execution
});

// Initialize resistance filter slider
function initializeResistanceFilter(results) {
    if (results.length === 0) return;
    
    // Find min and max total resistance values efficiently
    let minResistance = Infinity;
    let maxResistance = -Infinity;
    
    for (const result of results) {
        if (result.totalResistance < minResistance) {
            minResistance = result.totalResistance;
        }
        if (result.totalResistance > maxResistance) {
            maxResistance = result.totalResistance;
        }
    }
    
    // Show the filter section
    const filterSection = document.querySelector('.resistance-filter-section');
    if (filterSection) {
    filterSection.style.display = 'block';
    }
    
    // Get the slider element
    const slider = document.getElementById('resistance-slider');
    if (!slider) {
        return;
    }
    
    // Check if slider already exists and preserve current values
    let currentMin = minResistance;
    let currentMax = maxResistance;
    let sliderExists = false;
    
    if (slider.noUiSlider) {
        // Slider exists - preserve current values if they're within the new range
        const currentValues = slider.noUiSlider.get();
        const currentMinVal = parseInt(currentValues[0]);
        const currentMaxVal = parseInt(currentValues[1]);
        
        // Only preserve values if they're within the new valid range
        if (currentMinVal >= minResistance && currentMaxVal <= maxResistance) {
            currentMin = currentMinVal;
            currentMax = currentMaxVal;
        }
        
        sliderExists = true;
        slider.noUiSlider.destroy();
    } else {
        // New slider - update global resistance range to full range initially
        currentResistanceRange.min = minResistance;
        currentResistanceRange.max = maxResistance;
    }
    
    // Create the range slider
    noUiSlider.create(slider, {
        start: [currentMin, currentMax],
        behaviour: 'drag-smooth-steps-tap',
        connect: true,
        range: {
            'min': minResistance,
            'max': maxResistance
        },
        step: 1,
        format: {
            to: function (value) {
                return Math.round(value);
            },
            from: function (value) {
                return Number(value);
            }
        },
        pips: {
            mode: 'count',
            values: 5,
            density: 4
        }
    });

    formatResistanceSliderPips(slider);
    
    // Update the global range if we're preserving slider position
    if (sliderExists) {
        currentResistanceRange.min = currentMin;
        currentResistanceRange.max = currentMax;
    }
    
    // Update the display values
    const calculator = new ResistorCalculator();
    document.getElementById('resistance-min').textContent = calculator.formatResistorValue(currentMin);
    document.getElementById('resistance-max').textContent = calculator.formatResistorValue(currentMax);
    
    // Add event listener for slider changes - real-time filtering
    slider.noUiSlider.on('update', function (values, handle) {
        const minVal = parseInt(values[0]);
        const maxVal = parseInt(values[1]);
        
        // Update display values
        document.getElementById('resistance-min').textContent = calculator.formatResistorValue(minVal);
        document.getElementById('resistance-max').textContent = calculator.formatResistorValue(maxVal);
        
        // Update global range
        currentResistanceRange.min = minVal;
        currentResistanceRange.max = maxVal;
        
        // Apply real-time filtering if we have cached results
        if (resultsCache.isValid && resultsCache.allResults) {
            const filteredResults = filterAndSortResults(resultsCache.allResults, minVal, maxVal);
            
            // Update only the results section
            const resultsSection = document.querySelector('.results-section');
            if (resultsSection) {
                const supplyResult = getNumericInputValue(supplyVoltageInput, 'Supply Voltage');
                const supplyV = supplyResult.valid ? supplyResult.value : 0;
                resultsSection.outerHTML = renderResults(filteredResults, calculator);
                
                // Reinitialize diagrams for the new results
                document.querySelectorAll('.result-diagram').forEach((diagramContainer, idx) => {
                    const result = filteredResults[idx];
                    if (result) {
                        renderResultDiagram(
                            diagramContainer,
                            result,
                            supplyV,
                            result.outputVoltage
                        );
                    }
                });

                initializeResultCardSliders(filteredResults, calculator);
            }
        }
    });
}

// Function to filter and sort results based on resistance range
function filterAndSortResults(allResults, minResistance, maxResistance) {
    const filteredResults = allResults.filter(result =>
        result.totalResistance >= minResistance && result.totalResistance <= maxResistance
    );

    const sortBy = document.getElementById('sortBy').value;
    const sortedResults = [...filteredResults];
    const isUpad = getDividerMode() === 'upad';

    if (sortBy === 'components') {
        sortedResults.sort((a, b) => {
            if (a.componentCount !== b.componentCount) {
                return a.componentCount - b.componentCount;
            }
            return Math.abs(a.error) - Math.abs(b.error);
        });
    } else if (sortBy === 'totalResistanceAsc') {
        sortedResults.sort((a, b) => a.totalResistance - b.totalResistance);
    } else if (sortBy === 'totalResistanceDesc') {
        sortedResults.sort((a, b) => b.totalResistance - a.totalResistance);
    } else if (sortBy === 'upadImpedanceMatch' && isUpad) {
        sortedResults.sort((a, b) => {
            const sa = a.impedanceMatchScore ?? 0;
            const sb = b.impedanceMatchScore ?? 0;
            if (sa !== sb) return sa - sb;
            return Math.abs(a.errDb ?? 0) - Math.abs(b.errDb ?? 0);
        });
    } else {
        sortedResults.sort((a, b) => {
            if (isUpad) {
                const da = Math.abs(a.errDb ?? 0);
                const db = Math.abs(b.errDb ?? 0);
                if (da !== db) return da - db;
            }
            return Math.abs(a.error) - Math.abs(b.error);
        });
    }

    return sortedResults.slice(0, 5);
}

const packagePowerRatings = [
    { imperial: '01005', metric: '0402', rating: 0.031 },
    { imperial: '0201', metric: '0603', rating: 0.05 },
    { imperial: '0402', metric: '1005', rating: 0.062 },
    { imperial: '0603', metric: '1608', rating: 0.1 },
    { imperial: '0805', metric: '2012', rating: 0.125 },
    { imperial: '1206', metric: '3216', rating: 0.25 },
    { imperial: '1210', metric: '3225', rating: 0.33 },
    { imperial: '2010', metric: '5025', rating: 0.5 },
    { imperial: '1812', metric: '4532', rating: 0.75 },
    { imperial: '2512', metric: '6332', rating: 1 }
];

function formatWatts(value) {
    if (value < 1) {
        return `${(value * 1000).toFixed(1)}mW`;
    }
    return `${value.toFixed(2)}W`;
}

function getPackageRecommendation(power) {
    const match = packagePowerRatings.find(entry => power <= entry.rating);
    return match || packagePowerRatings[packagePowerRatings.length - 1];
}

function gcdInt(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
        const temp = y;
        y = x % y;
        x = temp;
    }
    return x || 1;
}

function formatRatio(r1Value, r2Value) {
    if (!Number.isFinite(r1Value) || !Number.isFinite(r2Value) || r2Value === 0) {
        return '—';
    }
    const scale = 1000;
    const r1Int = Math.round(r1Value * scale);
    const r2Int = Math.round(r2Value * scale);
    const divisor = gcdInt(r1Int, r2Int);
    const left = r1Int / divisor;
    const right = r2Int / divisor;
    const exact = Number.isInteger(r1Value) && Number.isInteger(r2Value);
    return `${exact ? '' : '≈'}${left}:${right}`;
}
function getSectionPowerStats(section, current, voltageDrop) {
    if (!Array.isArray(section)) {
        const value = section.value ?? section;
        const power = current * current * value;
        return {
            total: power,
            components: [{ resistor: section, power }],
            maxComponentPower: power
        };
    }

    const type = section.type || 'series';
    let components = [];
    if (type === 'parallel') {
        components = section.map(resistor => {
            const value = resistor.value ?? resistor;
            const power = (voltageDrop * voltageDrop) / value;
            return { resistor, power };
        });
    } else {
        components = section.map(resistor => {
            const value = resistor.value ?? resistor;
            const power = current * current * value;
            return { resistor, power };
        });
    }

    const total = components.reduce((sum, entry) => sum + entry.power, 0);
    const maxComponentPower = Math.max(...components.map(entry => entry.power));
    return { total, components, maxComponentPower };
}

function getPowerStatsForResult(result, supplyVoltage) {
    if (result.r3 != null && result.upadPowerStats) {
        const u = result.upadPowerStats;
        return {
            current: result.upad?.iTop ?? 0,
            totalPower: u.totalDissipatedInNetwork + (u.loadDissipation || 0),
            maxComponentPower: u.maxResistorPower,
            maxResistorPower: u.maxResistorPower,
            r1Stats: u.r1Stats,
            r2Stats: u.r2Stats,
            r3Stats: u.r3Stats,
            loadDissipation: u.loadDissipation,
            totalDissipatedInNetwork: u.totalDissipatedInNetwork,
            maxComponentPowerSizing: u.maxComponentPowerSizing
        };
    }
    const totalResistance = result.totalResistance ?? (result.r1Value + result.r2Value);
    const current = supplyVoltage / totalResistance;
    const vDropR1 = current * result.r1Value;
    const vDropR2 = current * result.r2Value;
    const r1Stats = getSectionPowerStats(result.r1, current, vDropR1);
    const r2Stats = getSectionPowerStats(result.r2, current, vDropR2);
    let r3Stats = null;
    let totalPower = r1Stats.total + r2Stats.total;
    let maxComponentPower = Math.max(r1Stats.maxComponentPower, r2Stats.maxComponentPower);
    if (result.r3 != null) {
        const vDropR3 = current * (result.r3Value ?? result.r1Value);
        r3Stats = getSectionPowerStats(result.r3, current, vDropR3);
        totalPower += r3Stats.total;
        maxComponentPower = Math.max(maxComponentPower, r3Stats.maxComponentPower);
    }

    return {
        current,
        totalPower,
        maxComponentPower,
        r1Stats,
        r2Stats,
        r3Stats
    };
}

function getPowerWarnings(powerStats, calculator) {
    const warnings = [];
    const pushWarnings = (entries) => {
        entries.forEach(entry => {
            const rating = entry.resistor?.powerRating;
            if (rating && entry.power > rating) {
                const label = entry.resistor?.formatted || calculator.formatResistorValue(entry.resistor?.value ?? entry.resistor);
                warnings.push(`${label} exceeds ${formatWatts(rating)}`);
            }
        });
    };
    pushWarnings(powerStats.r1Stats.components);
    pushWarnings(powerStats.r2Stats.components);
    if (powerStats.r3Stats) {
        pushWarnings(powerStats.r3Stats.components);
    }
    return warnings;
}

// Function to render the results display
function renderResults(displayResults, calculator) {
    const isUpad = getDividerMode() === 'upad';
    if (displayResults.length === 0) {
        return `
            <div class="results-section">
                <h3>Solutions</h3>
                <div class="no-results-message">
                    <p>No results found in the selected resistance range.</p>
                    <p>Try adjusting the resistance filter or changing your input parameters.</p>
                </div>
            </div>`;
    }
    
    return `
        <div class="results-section">
            <h3>Solutions <div class="help-tooltip" style="display: inline-block; margin-left: 8px;">
                ?
                <span class="tooltip-text">
                    'Error' indicates how far this solution is away from the target V<sub>out</sub><br><br>
                    'Real world range' indicates the possible range which V<sub>out</sub> may fall in when accounting for the tolerances of real life resistors. This assumes the worst case for a given value e.g. a 1% tolerance 1K3 may exist but they are typically no worse than 5% tolerance as an E24 value
                </span>
            </div></h3>
            <div id="resultsList">
                ${displayResults.map((result, index) => {
                    const powerStats = getPowerStatsForResult(result, calculator.supplyVoltage);
                    const sizingPower = powerStats.maxComponentPowerSizing ?? powerStats.maxComponentPower;
                    const packageRec = getPackageRecommendation(sizingPower);
                    const warnings = getPowerWarnings(powerStats, calculator);
                    const warningHtml = warnings.length
                        ? `<div class="result-warning">Power warning: ${warnings.join(', ')}</div>`
                        : '';
                    const ua = isUpad ? result.upad : null;
                    const zErrStr = isUpad
                        ? (Number.isFinite(result.errZInPct) || Number.isFinite(result.errZOutPct)
                            ? `${Number.isFinite(result.errZInPct) ? `${result.errZInPct >= 0 ? '+' : ''}${result.errZInPct.toFixed(2)}%` : '—'} / ${Number.isFinite(result.errZOutPct) ? `${result.errZOutPct >= 0 ? '+' : ''}${result.errZOutPct.toFixed(2)}%` : '—'}`
                            : '— (no Z targets)')
                        : '';
                    const upadExtraRows = isUpad && ua ? `
                                    <tr>
                                        <td><strong>Z<sub>in</sub> (open)</strong></td>
                                        <td>${formatImpedanceOhms(ua.zInOpen, calculator)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Z<sub>in</sub> (loaded)</strong></td>
                                        <td class="upad-zin-loaded">${formatImpedanceOhms(ua.zInLoaded, calculator)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Z<sub>out</sub> (Thévenin at tap)</strong></td>
                                        <td class="upad-zout">${formatImpedanceOhms(ua.zOutThevenin, calculator)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>I<sub>TOP</sub> (from source)</strong></td>
                                        <td class="upad-i-top">${formatUpadCurrent(ua.iTop)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>I<sub>MID</sub></strong></td>
                                        <td class="upad-i-mid">${formatUpadCurrent(ua.iMid)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>I<sub>BOT</sub></strong></td>
                                        <td class="upad-i-bot">${formatUpadCurrent(ua.iBot)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>I<sub>LOAD</sub></strong></td>
                                        <td class="upad-i-load">${formatUpadCurrent(ua.iLoad)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Insertion loss</strong></td>
                                        <td class="upad-insertion-db">${Number.isFinite(result.insertionLossDb) ? `${result.insertionLossDb.toFixed(3)} dB` : '—'}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Δ attenuation vs target</strong></td>
                                        <td class="upad-err-db">${Number.isFinite(result.errDb) ? `${result.errDb >= 0 ? '+' : ''}${result.errDb.toFixed(3)} dB` : '—'}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Δ frequency vs target</strong></td>
                                        <td class="upad-err-hz">${Number.isFinite(result.errDbHz) ? `${result.errDbHz >= 0 ? '+' : ''}${result.errDbHz.toExponential(2)} × f` : '—'}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Z match error (in / out)</strong></td>
                                        <td class="upad-z-err">${zErrStr}</td>
                                    </tr>` : '';
                    const rTopRow = `
                                    <tr>
                                        <td><strong>R<sub>TOP</sub></strong></td>
                                        <td>${Array.isArray(result.r1) ? `${calculator.formatResistorArray(result.r1)} = ${calculator.formatResistorValue(result.r1Value)}` : calculator.formatResistorValue(result.r1Value)}</td>
                                    </tr>`;
                    const rMidRow = isUpad ? `
                                    <tr>
                                        <td><strong>R<sub>MID</sub></strong></td>
                                        <td>${Array.isArray(result.r2) ? `${calculator.formatResistorArray(result.r2)} = ${calculator.formatResistorValue(result.r2Value)}` : calculator.formatResistorValue(result.r2Value)}</td>
                                    </tr>` : '';
                    const rBotRow = isUpad ? `
                                    <tr>
                                        <td><strong>R<sub>BOT</sub></strong></td>
                                        <td>${Array.isArray(result.r3) ? `${calculator.formatResistorArray(result.r3)} = ${calculator.formatResistorValue(result.r3Value)}` : calculator.formatResistorValue(result.r3Value)} <span class="upad-match-note">(nominal match to R<sub>TOP</sub>)</span></td>
                                    </tr>` : `
                                    <tr>
                                        <td><strong>R<sub>BOT</sub></strong></td>
                                        <td>${Array.isArray(result.r2) ? `${calculator.formatResistorArray(result.r2)} = ${calculator.formatResistorValue(result.r2Value)}` : calculator.formatResistorValue(result.r2Value)}</td>
                                    </tr>`;
                    const ratioLabel = isUpad
                        ? '<strong>R<sub>TOP</sub>:R<sub>MID</sub> ratio</strong>'
                        : '<strong>R<sub>TOP</sub>:R<sub>BOT</sub> ratio</strong>';
                    const ratioValue = isUpad ? formatRatio(result.r1Value, result.r2Value) : formatRatio(result.r1Value, result.r2Value);
                    const powerRow = isUpad
                        ? `R<sub>TOP</sub>: ${formatWatts(powerStats.r1Stats.total)}, R<sub>MID</sub>: ${formatWatts(powerStats.r2Stats.total)}, R<sub>BOT</sub>: ${formatWatts(powerStats.r3Stats.total)}, Z<sub>load</sub>: ${formatWatts(powerStats.loadDissipation || 0)}, Resistors total: ${formatWatts(powerStats.totalDissipatedInNetwork ?? (powerStats.r1Stats.total + powerStats.r2Stats.total + powerStats.r3Stats.total))}, All sinks: ${formatWatts(powerStats.totalPower)}`
                        : `R<sub>TOP</sub>: ${formatWatts(powerStats.r1Stats.total)}, R<sub>BOT</sub>: ${formatWatts(powerStats.r2Stats.total)}, Total: ${formatWatts(powerStats.totalPower)}`;
                    const errorRowLabel = isUpad ? '<strong>Δ V<sub>tap</sub> vs target</strong>' : '<strong>Error</strong>';
                    const errorRowValue = isUpad
                        ? `<span class="error-value">${result.error > 0 ? '+' : ''}${result.error.toFixed(3)}</span> V <span class="upad-match-note">(from attenuation target)</span>`
                        : `<span class="error-value">${result.error > 0 ? '+' : ''}${result.error.toFixed(2)}</span> V`;
                    const vTapDecimals = isUpad ? 3 : 2;
                    const packageNote = isUpad && Number.isFinite(sizingPower) && sizingPower > (powerStats.maxResistorPower ?? powerStats.maxComponentPower)
                        ? ` <span class="upad-match-note">(floor ${formatWatts(sizingPower)})</span>`
                        : '';
                    return `
                    <div class="result-item" data-index="${index}" data-r1="${result.r1Value}" data-r2="${result.r2Value}">
                       <div class="result-content">
                            <table class="result-table">
                                <tbody>
                                    ${rTopRow}
                                    ${isUpad ? rMidRow + rBotRow : rBotRow}
                                    ${isUpad ? upadExtraRows : ''}
                                    <tr>
                                        <td>${ratioLabel}</td>
                                        <td>${ratioValue}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Total Resistance</strong></td>
                                        <td class="total-resistance">${calculator.formatResistorValue(result.totalResistance)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>${isUpad ? 'Tap voltage (loaded)' : 'Nominal Output Voltage'}</strong></td>
                                        <td><span class="output-voltage">${result.outputVoltage.toFixed(vTapDecimals)}</span> V</td>
                                    </tr>
                                    <tr>
                                        <td>${errorRowLabel}</td>
                                        <td>${errorRowValue}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Components</strong></td>
                                        <td>${result.componentCount}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Real World Range for Vout</strong></td>
                                        <td><span class="voltage-range">${result.voltageRange.min.toFixed(2)} V to ${result.voltageRange.max.toFixed(2)} V</span></td>
                                    </tr>
                                    <tr>
                                        <td><strong>Power Dissipation</strong></td>
                                        <td class="power-values">${powerRow}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Min package size recommendation</strong></td>
                                        <td class="package-recommendation">${packageRec.imperial}/${packageRec.metric} (min ${formatWatts(packageRec.rating)})${packageNote}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div class="solution-slider">
                                <label>Supply Voltage: <span class="solution-slider-value">${calculator.supplyVoltage.toFixed(1)}</span> V</label>
                                <div class="solution-slider-control" id="solution-slider-${index}"></div>
                            </div>
                            ${warningHtml}
                        </div>
                        <div class="result-diagram" id="diagram-${index}">
                            <button class="diagram-download-btn" onclick="downloadDiagram(${index}, ${result.r1Value}, ${result.r2Value}, ${result.outputVoltage}, ${isUpad})" title="Download diagram as PNG">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </div>
                `;
                }).join('')}
            </div>
        </div>`;
}

function applyUpadLoadedAnalysis(result, vin, zLoad, minPowerFloorW) {
    if (!result || result.r3 == null) return;
    const ua = computeUpadAnalysis(result.r1Value, result.r2Value, vin, zLoad);
    const r1Stats = {
        total: ua.pTop,
        components: [{ resistor: result.r1, power: ua.pTop }],
        maxComponentPower: ua.pTop
    };
    const r2Stats = {
        total: ua.pMid,
        components: [{ resistor: result.r2, power: ua.pMid }],
        maxComponentPower: ua.pMid
    };
    const r3Stats = {
        total: ua.pBot,
        components: [{ resistor: result.r3, power: ua.pBot }],
        maxComponentPower: ua.pBot
    };
    const loadDissipation = (!Number.isFinite(zLoad) || zLoad <= 0) ? 0 : ua.pLoad;
    const totalDissipatedInNetwork = ua.pTop + ua.pMid + ua.pBot;
    const maxResistorPower = Math.max(ua.pTop, ua.pMid, ua.pBot);
    const floor = Number.isFinite(minPowerFloorW) && minPowerFloorW > 0 ? minPowerFloorW : 0;
    result.upad = ua;
    result.outputVoltage = ua.vTap;
    result.error = ua.vTap - (result.targetTapVoltage ?? ua.vTap);
    result.insertionLossDb = ua.insertionLossDb;
    result.upadPowerStats = {
        r1Stats,
        r2Stats,
        r3Stats,
        loadDissipation,
        totalDissipatedInNetwork,
        maxResistorPower,
        maxComponentPowerSizing: Math.max(maxResistorPower, floor)
    };
}

function initializeResultCardSliders(displayResults, calculator) {
    const isUpad = getDividerMode() === 'upad';
    displayResults.forEach((result, index) => {
        const slider = document.getElementById(`solution-slider-${index}`);
        if (!slider) return;

        if (slider.noUiSlider) {
            slider.noUiSlider.destroy();
        }

        const supplyResult = getNumericInputValue(supplyVoltageInput, 'Supply Voltage');
        const baseSupply = supplyResult.valid ? supplyResult.value : calculator.supplyVoltage;
        const sliderSupply = Number.isFinite(baseSupply) && baseSupply > 0 ? baseSupply : 0.1;

        noUiSlider.create(slider, {
            start: [sliderSupply],
            connect: [true, false],
            range: {
                min: 0,
                max: sliderSupply * 2
            },
            step: 0.1,
            format: {
                to: value => parseFloat(value).toFixed(1),
                from: value => Number(value)
            }
        });

        slider.noUiSlider.on('update', function(values) {
            const newVoltage = parseFloat(values[0]);
            const card = slider.closest('.result-item');
            if (!card) return;

            const sliderValue = card.querySelector('.solution-slider-value');
            if (sliderValue) {
                sliderValue.textContent = newVoltage.toFixed(1);
            }

            let outputVoltage;
            let range;
            if (isUpad && result.r3 != null) {
                const zLoadEl = document.getElementById('upadZLoad');
                const zLoadRes = getNumericInputValue(zLoadEl, 'Z load');
                const zLoad = zLoadRes.valid ? zLoadRes.value : 0;
                const minPowEl = document.getElementById('upadMinPowerW');
                const minFloor = minPowEl && minPowEl.value.trim() !== '' ? parseFloat(minPowEl.value) : NaN;
                applyUpadLoadedAnalysis(
                    result,
                    newVoltage,
                    zLoad,
                    Number.isFinite(minFloor) && minFloor >= 0 ? minFloor : 0
                );
                outputVoltage = result.outputVoltage;
                range = calculator.calculateUpadVoltageRange(result.r1, result.r2, result.r3, newVoltage);

                const ua = result.upad;
                const setText = (sel, text) => {
                    const el = card.querySelector(sel);
                    if (el) el.textContent = text;
                };
                setText('.upad-zin-loaded', formatImpedanceOhms(ua.zInLoaded, calculator));
                setText('.upad-zout', formatImpedanceOhms(ua.zOutThevenin, calculator));
                setText('.upad-i-top', formatUpadCurrent(ua.iTop));
                setText('.upad-i-mid', formatUpadCurrent(ua.iMid));
                setText('.upad-i-bot', formatUpadCurrent(ua.iBot));
                setText('.upad-i-load', formatUpadCurrent(ua.iLoad));
                setText('.upad-insertion-db', Number.isFinite(result.insertionLossDb) ? `${result.insertionLossDb.toFixed(3)} dB` : '—');

                const dbEl = document.getElementById('upadAttenuationDb');
                const dbRaw = dbEl ? (dbEl.value !== '' ? dbEl.value : dbEl.defaultValue) : '';
                const targetDb = parseFloat(dbRaw);
                const errDb = Number.isFinite(targetDb) ? (result.insertionLossDb - targetDb) : NaN;
                setText('.upad-err-db', Number.isFinite(errDb) ? `${errDb >= 0 ? '+' : ''}${errDb.toFixed(3)} dB` : '—');
                const errHz = Number.isFinite(errDb) ? (errDb * Math.LN10 / 20) : NaN;
                setText('.upad-err-hz', Number.isFinite(errHz) ? `${errHz >= 0 ? '+' : ''}${errHz.toExponential(2)} × f` : '—');

                const zInEl = document.getElementById('upadZInTarget');
                const zOutEl = document.getElementById('upadZOutTarget');
                let zStr = '— (no Z targets)';
                if (zInEl?.value.trim() || zOutEl?.value.trim()) {
                    const tIn = zInEl?.value.trim() ? parseFloat(zInEl.value) : NaN;
                    const tOut = zOutEl?.value.trim() ? parseFloat(zOutEl.value) : NaN;
                    const eIn = Number.isFinite(tIn) && tIn > 0 ? (100 * (ua.zInLoaded / tIn - 1)) : NaN;
                    const eOut = Number.isFinite(tOut) && tOut > 0 ? (100 * (ua.zOutThevenin / tOut - 1)) : NaN;
                    zStr = `${Number.isFinite(eIn) ? `${eIn >= 0 ? '+' : ''}${eIn.toFixed(2)}%` : '—'} / ${Number.isFinite(eOut) ? `${eOut >= 0 ? '+' : ''}${eOut.toFixed(2)}%` : '—'}`;
                }
                setText('.upad-z-err', zStr);

                const errEl = card.querySelector('.error-value');
                if (errEl) {
                    errEl.textContent = `${result.error > 0 ? '+' : ''}${result.error.toFixed(3)}`;
                }

                const diagramContainer = document.getElementById(`diagram-${index}`);
                if (diagramContainer) {
                    diagramContainer.innerHTML = `
                            <button class="diagram-download-btn" onclick="downloadDiagram(${index}, ${result.r1Value}, ${result.r2Value}, ${result.outputVoltage}, true)" title="Download diagram as PNG">
                                <i class="fas fa-download"></i>
                            </button>`;
                    renderResultDiagram(diagramContainer, result, newVoltage, result.outputVoltage);
                }
            } else {
                outputVoltage = (result.r2Value / (result.r1Value + result.r2Value)) * newVoltage;
                range = calculator.calculateVoltageRange(result.r1, result.r2, newVoltage);
            }
            const outputElement = card.querySelector('.output-voltage');
            if (outputElement) {
                outputElement.textContent = outputVoltage.toFixed(isUpad && result.r3 != null ? 3 : 2);
            }

            const rangeElement = card.querySelector('.voltage-range');
            if (rangeElement) {
                rangeElement.textContent = `${range.min.toFixed(2)} V to ${range.max.toFixed(2)} V`;
            }

            const powerStats = getPowerStatsForResult(result, newVoltage);
            const powerElement = card.querySelector('.power-values');
            if (powerElement) {
                if (isUpad && result.r3 != null) {
                    powerElement.innerHTML = `R<sub>TOP</sub>: ${formatWatts(powerStats.r1Stats.total)}, R<sub>MID</sub>: ${formatWatts(powerStats.r2Stats.total)}, R<sub>BOT</sub>: ${formatWatts(powerStats.r3Stats.total)}, Z<sub>load</sub>: ${formatWatts(powerStats.loadDissipation || 0)}, Resistors total: ${formatWatts(powerStats.totalDissipatedInNetwork ?? 0)}, All sinks: ${formatWatts(powerStats.totalPower)}`;
                } else {
                    powerElement.innerHTML = `R<sub>TOP</sub>: ${formatWatts(powerStats.r1Stats.total)}, R<sub>BOT</sub>: ${formatWatts(powerStats.r2Stats.total)}, Total: ${formatWatts(powerStats.totalPower)}`;
                }
            }

            const sizingPower = powerStats.maxComponentPowerSizing ?? powerStats.maxComponentPower;
            const packageRec = getPackageRecommendation(sizingPower);
            const packageElement = card.querySelector('.package-recommendation');
            if (packageElement) {
                const maxR = powerStats.maxResistorPower ?? powerStats.maxComponentPower;
                const note = isUpad && result.r3 != null && Number.isFinite(sizingPower) && sizingPower > maxR
                    ? ` (floor ${formatWatts(sizingPower)})`
                    : '';
                packageElement.textContent = `${packageRec.imperial}/${packageRec.metric} (min ${formatWatts(packageRec.rating)})${note}`;
            }

            const warnings = getPowerWarnings(powerStats, calculator);
            let warningElement = card.querySelector('.result-warning');
            if (warnings.length) {
                if (!warningElement) {
                    warningElement = document.createElement('div');
                    warningElement.className = 'result-warning';
                    card.querySelector('.result-content')?.appendChild(warningElement);
                }
                warningElement.textContent = `Power warning: ${warnings.join(', ')}`;
            } else if (warningElement) {
                warningElement.remove();
            }
        });
    });
}

// Function to convert SVG to PNG and download
function downloadDiagram(index, r1Value, r2Value, outputVoltage, isUpad = false) {
    const diagramElement = document.getElementById(`diagram-${index}`);
    const svgElement = diagramElement.querySelector('svg');
    
    if (!svgElement) {
        console.error('SVG element not found');
        return;
    }
    
    const card = diagramElement.closest('.result-item');

    // Get supply voltage and target voltage from inputs
    const supplyVoltage = parseFloat(document.getElementById('supplyVoltage').value);
    let targetVoltage = NaN;
    if (isUpad) {
        const dbEl = document.getElementById('upadAttenuationDb');
        const dbRaw = dbEl ? (dbEl.value !== '' ? dbEl.value : dbEl.defaultValue) : '';
        const dbParsed = parseFloat(dbRaw);
        if (Number.isFinite(dbParsed) && Number.isFinite(supplyVoltage)) {
            targetVoltage = dbToVoltageRatio(dbParsed) * supplyVoltage;
        }
    } else {
        const tvEl = document.getElementById('targetVoltage');
        targetVoltage = tvEl ? parseFloat(tvEl.value) : NaN;
    }
    
    const calculator = new ResistorCalculator();
    const r1Formatted = calculator.formatResistorValue(r1Value).replace(/[^\w]/g, '');
    const r2Formatted = calculator.formatResistorValue(r2Value).replace(/[^\w]/g, '');
    const prefix = isUpad ? 'upad' : 'voltagedivider';
    const filename = `${prefix}-${supplyVoltage}V-${targetVoltage}V-${r1Formatted}-${r2Formatted}.png`;
    
    const annotations = [];
    if (card) {
        const totalResistance = card.querySelector('.total-resistance')?.textContent?.trim();
        const errorValue = card.querySelector('.error-value')?.textContent?.trim();
        const rangeValue = card.querySelector('.voltage-range')?.textContent?.trim();
        if (totalResistance) annotations.push(`Total resistance: ${totalResistance}`);
        if (errorValue) annotations.push(`Error: ${errorValue} V`);
        if (rangeValue) annotations.push(`Real world Vout range: ${rangeValue}`);
    }

    // Convert SVG to PNG with scaling and white background
    convertSVGtoPNG(svgElement, filename, 2, annotations); // 2x scaling for better quality
}

// Function to convert SVG to PNG with scaling and white background
function convertSVGtoPNG(svgElement, filename, scale = 2, annotations = []) {
    // Clone the SVG to avoid modifying the original
    const svgClone = svgElement.cloneNode(true);
    
    // Get original dimensions
    const originalWidth = svgElement.viewBox?.baseVal?.width || 300;
    const originalHeight = svgElement.viewBox?.baseVal?.height || 220;
    const scaledWidth = originalWidth * scale;
    const scaledHeight = originalHeight * scale;
    const annotationHeight = annotations.length ? (annotations.length * 22 + 12) * scale : 0;
    
    // Set explicit dimensions on the clone
    svgClone.setAttribute('width', scaledWidth);
    svgClone.setAttribute('height', scaledHeight);
    
    // Create a canvas
    const canvas = document.createElement('canvas');
    canvas.width = scaledWidth;
    canvas.height = scaledHeight + annotationHeight;
    const ctx = canvas.getContext('2d');
    
    // Fill with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, scaledWidth, scaledHeight + annotationHeight);
    
    // Convert SVG to data URL
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    
    // Create an image element and load the SVG
    const img = new Image();
    img.onload = function() {
        // Draw the image on the canvas
        ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

        if (annotations.length) {
            ctx.fillStyle = '#000000';
            ctx.font = `${12 * scale}px Arial`;
            let textY = scaledHeight + (18 * scale);
            annotations.forEach(line => {
                ctx.fillText(line, 12 * scale, textY);
                textY += 18 * scale;
            });
        }
        
        // Convert canvas to PNG blob
        canvas.toBlob(function(blob) {
            // Create download link
            const downloadUrl = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = downloadUrl;
            downloadLink.download = filename;
            
            // Trigger download
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            // Clean up URLs
            URL.revokeObjectURL(downloadUrl);
            URL.revokeObjectURL(svgUrl);
        }, 'image/png');
    };
    
    img.onerror = function() {
        console.error('Failed to load SVG for conversion');
        URL.revokeObjectURL(svgUrl);
    };
    
    img.src = svgUrl;
}

// Add event listener for the autofill button
document.getElementById('autofillBtn').addEventListener('click', () => {
    // Get the multiplier from the dropdown
    const multiplier = parseFloat(document.getElementById('autofillRange').value);
    // Get the selected series from the dropdown
    const seriesSelect = document.getElementById('autofillSeries');
    const selectedSeries = seriesSelect ? seriesSelect.value : 'E24';
    // Get the values for the selected series, fallback to E24 if not found
    const seriesValues = ResistorUtils.series[selectedSeries] || ResistorUtils.series.E24;
    const formattedValues = seriesValues.map(value => {
        const scaledValue = value * multiplier;
        // Use custom formatter for autofill that uses "R" instead of "Ω"
        const formatted = ResistorUtils.formatResistorValue(scaledValue);
        return formatted.replace('Ω', 'R');
    });
    resistorValuesInput.value = formattedValues.join(', ');
    calculateAndDisplayResults();
});

document.getElementById('autofillJlcBtn').addEventListener('click', () => {
    resistorValuesInput.value = ResistorUtils.luts.JLC_BASIC.join(', ');
    calculateAndDisplayResults();
});
