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
function generateStateKey(calculator, resistorValues, supplyVoltage, targetVoltage, allowOvershoot) {
    const resistorKey = resistorValues
        .map(resistor => `${resistor.value}|${resistor.tolerance ?? ''}|${resistor.powerRating ?? ''}|${resistor.powerCode ?? ''}`)
        .sort();
    return JSON.stringify({
        resistorValues: resistorKey,
        supplyVoltage,
        targetVoltage,
        allowOvershoot
    });
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

    // Calculate total number of components in a result
    getComponentCount(result) {
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
supplyVoltageInput.addEventListener('input', (e) => {
    invalidateCache(); // Cache is invalid when supply voltage changes
    calculateAndDisplayResults();
});

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
            const resistorEntry = {
                id: index,
                key,
                value: parsed.value,
                tolerance: parsed.tolerance,
                powerRating: parsed.powerRating,
                powerCode: parsed.powerCode,
                series: seriesName,
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

    // Validate target voltage
    const targetResult = getNumericInputValue(targetVoltageInput, 'Target Voltage');
    if (!targetResult.valid) {
        errors.push(targetResult.error);
    } else if (calculator.supplyVoltage && targetResult.value > calculator.supplyVoltage) {
        errors.push('Target voltage cannot exceed supply voltage');
    } else {
        calculator.targetVoltage = targetResult.value;
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
            
            if (useParallel) {
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
        // Helper to convert r1/r2 array to string for renderCustom
        function sectionToString(section) {
            if (Array.isArray(section)) {
                // Use the .type property if present, otherwise default to 'series'
                const type = section.type || 'series';
                return section.map(v => v.value ?? v).join(',') + ',' + type;
            } else {
                // Single resistor, treat as series
                return (section.value ?? section) + ',series';
            }
        }
        const topSection = sectionToString(result.r1);
        const bottomSection = sectionToString(result.r2);
        const diagram = new Diagram(diagramContainer.id, 300, 220);
        diagram.renderCustom(topSection, bottomSection, supplyVoltageInput.value, targetVoltageInput.value);
    });

    // Initialize resistance filter slider with all results
    initializeResistanceFilter(allResults);
    
    // Initialize per-card sliders and power displays
    initializeResultCardSliders(displayResults, calculator);
}

// Event Listeners
calculateBtn.addEventListener('click', calculateAndDisplayResults);
overshootSwitch.addEventListener('change', calculateAndDisplayResults);
document.getElementById('sortBy').addEventListener('change', calculateAndDisplayResults);
document.getElementById('snapToSeries').addEventListener('change', calculateAndDisplayResults);

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
    // Find the results section
    const resultsSection = document.querySelector('.results-section');
    if (!resultsSection) return;
    
    // Create a dummy calculator for formatting
    const calculator = new ResistorCalculator();
    const supplyResult = getNumericInputValue(supplyVoltageInput, 'Supply Voltage');
    const targetResult = getNumericInputValue(targetVoltageInput, 'Target Voltage');
    calculator.supplyVoltage = supplyResult.valid ? supplyResult.value : 0;
    calculator.targetVoltage = targetResult.valid ? targetResult.value : 0;
    
    // Replace just the results section
    resultsSection.outerHTML = renderResults(displayResults, calculator);
    
    // Reinitialize diagrams for the new results
    document.querySelectorAll('.result-diagram').forEach((diagramContainer, idx) => {
        const result = displayResults[idx];
        if (result) {
        // Helper to convert r1/r2 array to string for renderCustom
        function sectionToString(section) {
            if (Array.isArray(section)) {
                const type = section.type || 'series';
                return section.map(v => v.value ?? v).join(',') + ',' + type;
            } else {
                return (section.value ?? section) + ',series';
            }
        }
        const topSection = sectionToString(result.r1);
        const bottomSection = sectionToString(result.r2);
        const diagram = new Diagram(diagramContainer.id, 300, 220);
            diagram.renderCustom(topSection, bottomSection, calculator.supplyVoltage, calculator.targetVoltage);
        }
    });

    initializeResultCardSliders(displayResults, calculator);
    
    // Update the resistance filter to reflect the new filtered results
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
                resultsSection.outerHTML = renderResults(filteredResults, calculator);
                
                // Reinitialize diagrams for the new results
                document.querySelectorAll('.result-diagram').forEach((diagramContainer, idx) => {
                    const result = filteredResults[idx];
                    if (result) {
                        // Helper to convert r1/r2 array to string for renderCustom
                        function sectionToString(section) {
                            if (Array.isArray(section)) {
                                const type = section.type || 'series';
                                return section.map(v => v.value ?? v).join(',') + ',' + type;
                            } else {
                                return (section.value ?? section) + ',series';
                            }
                        }
                        const topSection = sectionToString(result.r1);
                        const bottomSection = sectionToString(result.r2);
                        const diagram = new Diagram(diagramContainer.id, 300, 220);
                        diagram.renderCustom(topSection, bottomSection, supplyVoltageInput.value, targetVoltageInput.value);
                    }
                });

                initializeResultCardSliders(filteredResults, calculator);
            }
        }
    });
}

// Function to filter and sort results based on resistance range
function filterAndSortResults(allResults, minResistance, maxResistance) {
    // Filter results by resistance range
    const filteredResults = allResults.filter(result => 
        result.totalResistance >= minResistance && result.totalResistance <= maxResistance
    );
    
    // Apply sorting to filtered results
    const sortBy = document.getElementById('sortBy').value;
    let sortedResults = [...filteredResults]; // Create a copy
    
    if (sortBy === 'components') {
        // Sort by component count first, then by absolute error
        sortedResults.sort((a, b) => {
            if (a.componentCount !== b.componentCount) {
                return a.componentCount - b.componentCount;
            }
            return Math.abs(a.error) - Math.abs(b.error);
        });
    } else if (sortBy === 'totalResistanceAsc') {
        // Sort by total resistance ascending
        sortedResults.sort((a, b) => a.totalResistance - b.totalResistance);
    } else if (sortBy === 'totalResistanceDesc') {
        // Sort by total resistance descending
        sortedResults.sort((a, b) => b.totalResistance - a.totalResistance);
    } else {
        // Sort by absolute error (default)
        sortedResults.sort((a, b) => Math.abs(a.error) - Math.abs(b.error));
    }
    
    return sortedResults.slice(0, 5); // Return top 5
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
    const totalResistance = result.r1Value + result.r2Value;
    const current = supplyVoltage / totalResistance;
    const vDropR1 = current * result.r1Value;
    const vDropR2 = current * result.r2Value;
    const r1Stats = getSectionPowerStats(result.r1, current, vDropR1);
    const r2Stats = getSectionPowerStats(result.r2, current, vDropR2);
    const totalPower = r1Stats.total + r2Stats.total;
    const maxComponentPower = Math.max(r1Stats.maxComponentPower, r2Stats.maxComponentPower);

    return {
        current,
        totalPower,
        maxComponentPower,
        r1Stats,
        r2Stats
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
    return warnings;
}

// Function to render the results display
function renderResults(displayResults, calculator) {
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
                    'Error' indicates how far this divider is away from the target Vout<br><br>
                    'Real world range' Indicates the possible range which Vout may fall in when accounting for the tolerances of real life resistors. This assumes the worst case for a given value e.g. a 1% tolerance 1K3 may exists but they are typically no worse then 5% tolerance as an E24 value
                </span>
            </div></h3>
            <div id="resultsList">
                ${displayResults.map((result, index) => {
                    const powerStats = getPowerStatsForResult(result, calculator.supplyVoltage);
                    const packageRec = getPackageRecommendation(powerStats.maxComponentPower);
                    const warnings = getPowerWarnings(powerStats, calculator);
                    const warningHtml = warnings.length
                        ? `<div class="result-warning">Power warning: ${warnings.join(', ')}</div>`
                        : '';
                    return `
                    <div class="result-item" data-index="${index}" data-r1="${result.r1Value}" data-r2="${result.r2Value}">
                       <div class="result-content">
                            <table class="result-table">
                                <tbody>
                                    <tr>
                                        <td><strong>R<sub>TOP</sub>:</strong></td>
                                        <td>${Array.isArray(result.r1) ? `${calculator.formatResistorArray(result.r1)} = ${calculator.formatResistorValue(result.r1Value)}` : calculator.formatResistorValue(result.r1Value)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>R<sub>BOTTOM</sub>:</strong></td>
                                        <td>${Array.isArray(result.r2) ? `${calculator.formatResistorArray(result.r2)} = ${calculator.formatResistorValue(result.r2Value)}` : calculator.formatResistorValue(result.r2Value)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>R<sub>TOP</sub>:R<sub>BOTTOM</sub> ratio:</strong></td>
                                        <td>${Number.isFinite(result.r2Value) && result.r2Value !== 0 ? `${(result.r1Value / result.r2Value).toFixed(3)}:1` : '—'}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Total Resistance:</strong></td>
                                        <td class="total-resistance">${calculator.formatResistorValue(result.totalResistance)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Nominal Output Voltage:</strong></td>
                                        <td><span class="output-voltage">${result.outputVoltage.toFixed(2)}</span> V</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Error:</strong></td>
                                        <td><span class="error-value">${result.error > 0 ? '+' : ''}${result.error.toFixed(2)}</span> V</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Components:</strong></td>
                                        <td>${result.componentCount}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Real World Range for Vout:</strong></td>
                                        <td><span class="voltage-range">${result.voltageRange.min.toFixed(2)} V to ${result.voltageRange.max.toFixed(2)} V</span></td>
                                    </tr>
                                    <tr>
                                        <td><strong>Power Dissipation:</strong></td>
                                        <td class="power-values">R1: ${formatWatts(powerStats.r1Stats.total)}, R2: ${formatWatts(powerStats.r2Stats.total)}, Total: ${formatWatts(powerStats.totalPower)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Min package size recommendation:</strong></td>
                                        <td class="package-recommendation">${packageRec.imperial}/${packageRec.metric} (min ${formatWatts(packageRec.rating)})</td>
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
                            <button class="diagram-download-btn" onclick="downloadDiagram(${index}, ${result.r1Value}, ${result.r2Value}, ${result.outputVoltage})" title="Download diagram as PNG">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </div>
                `;
                }).join('')}
            </div>
        </div>`;
}

function initializeResultCardSliders(displayResults, calculator) {
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

            const outputVoltage = (result.r2Value / (result.r1Value + result.r2Value)) * newVoltage;
            const outputElement = card.querySelector('.output-voltage');
            if (outputElement) {
                outputElement.textContent = outputVoltage.toFixed(2);
            }

            const range = calculator.calculateVoltageRange(result.r1, result.r2, newVoltage);
            const rangeElement = card.querySelector('.voltage-range');
            if (rangeElement) {
                rangeElement.textContent = `${range.min.toFixed(2)} V to ${range.max.toFixed(2)} V`;
            }

            const powerStats = getPowerStatsForResult(result, newVoltage);
            const powerElement = card.querySelector('.power-values');
            if (powerElement) {
                powerElement.textContent = `R1: ${formatWatts(powerStats.r1Stats.total)}, R2: ${formatWatts(powerStats.r2Stats.total)}, Total: ${formatWatts(powerStats.totalPower)}`;
            }

            const packageRec = getPackageRecommendation(powerStats.maxComponentPower);
            const packageElement = card.querySelector('.package-recommendation');
            if (packageElement) {
                packageElement.textContent = `${packageRec.imperial}/${packageRec.metric} (min ${formatWatts(packageRec.rating)})`;
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
function downloadDiagram(index, r1Value, r2Value, outputVoltage) {
    const diagramElement = document.getElementById(`diagram-${index}`);
    const svgElement = diagramElement.querySelector('svg');
    
    if (!svgElement) {
        console.error('SVG element not found');
        return;
    }
    
    const card = diagramElement.closest('.result-item');

    // Get supply voltage and target voltage from inputs
    const supplyVoltage = parseFloat(document.getElementById('supplyVoltage').value);
    const targetVoltage = parseFloat(document.getElementById('targetVoltage').value);
    
    // Create filename in required format: voltagedivider-vsupply-vout-r1-r2.png
    const calculator = new ResistorCalculator();
    const r1Formatted = calculator.formatResistorValue(r1Value).replace(/[^\w]/g, ''); // Remove special chars
    const r2Formatted = calculator.formatResistorValue(r2Value).replace(/[^\w]/g, ''); // Remove special chars
    const filename = `voltagedivider-${supplyVoltage}V-${targetVoltage}V-${r1Formatted}-${r2Formatted}.png`;
    
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
