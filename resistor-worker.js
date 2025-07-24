// Web Worker for parallel resistor combination calculations

// Receive calculation utilities from main thread
let ResistorUtils = null;
let resistorTolerances = null;

// Calculate total resistance based on connection type
function calculateTotalResistance(resistors) {
    if (!Array.isArray(resistors)) return resistors;
    if (resistors.type === 'parallel') {
        // Calculate parallel resistance
        const reciprocalSum = resistors.reduce((sum, r) => sum + 1/r, 0);
        return 1 / reciprocalSum;
    }
    // Series resistance
    return resistors.reduce((sum, r) => sum + r, 0);
}

// Calculate output voltage for a voltage divider
function calculateOutputVoltage(r1, r2, supplyVoltage) {
    return (r2 / (r1 + r2)) * supplyVoltage;
}

// Find which standard series a value belongs to
function findResistorSeries(value) {
    if (!ResistorUtils || !ResistorUtils.series) return null;
    
    // Normalize value to be between 1 and 10
    let normalized = value;
    while (normalized >= 10) {
        normalized /= 10;
    }
    while (normalized < 1 && normalized > 0) {
        normalized *= 10;
    }

    // Check if normalized value appears in any series array
    const seriesOrder = ['E24', 'E48', 'E96', 'E192'];
    const tolerance = 0.0001; // Tolerance for floating-point comparison
    
    for (const seriesName of seriesOrder) {
        // Use tolerance-based comparison instead of exact match
        const found = ResistorUtils.series[seriesName].some(seriesValue => 
            Math.abs(normalized - seriesValue) < tolerance
        );
        if (found) {
            return seriesName;
        }
    }
    return null;
}

// Calculate bounds for a resistor value based on its series
function calculateResistorBounds(value, series) {
    const tolerance = series && resistorTolerances ? resistorTolerances[series] : 0;
    const multiplier = tolerance / 100;
    return {
        lower: value * (1 - multiplier),
        upper: value * (1 + multiplier)
    };
}

// Calculate voltage range for a voltage divider considering tolerances
function calculateVoltageRange(r1, r2, supplyVoltage) {
    // Get series for each resistor
    const r1Series = findResistorSeries(r1);
    const r2Series = findResistorSeries(r2);

    // Calculate bounds for each resistor
    const r1Bounds = calculateResistorBounds(r1, r1Series);
    const r2Bounds = calculateResistorBounds(r2, r2Series);

    // Calculate all possible combinations
    const combinations = [
        { r1: r1Bounds.lower, r2: r2Bounds.lower },
        { r1: r1Bounds.lower, r2: r2Bounds.upper },
        { r1: r1Bounds.upper, r2: r2Bounds.lower },
        { r1: r1Bounds.upper, r2: r2Bounds.upper }
    ];

    // Calculate voltages for all combinations
    const voltages = combinations.map(combo => 
        calculateOutputVoltage(combo.r1, combo.r2, supplyVoltage)
    );

    return {
        min: Math.min(...voltages),
        max: Math.max(...voltages)
    };
}

// Get component count
function getComponentCount(r1, r2) {
    const r1Count = Array.isArray(r1) ? r1.length : 1;
    const r2Count = Array.isArray(r2) ? r2.length : 1;
    return r1Count + r2Count;
}

// Process a chunk of R2 indices
function processChunk(data) {
    const {
        r2Indices,
        combinations,
        resistanceCacheArray,
        sortedIndices,
        supplyVoltage,
        targetVoltage,
        allowOvershoot,
        targetRatio
    } = data;
    
    // Convert array back to Map
    const resistanceCache = new Map(resistanceCacheArray);
    
    const results = [];
    const seenRatios = new Map();
    const stats = {
        processed: 0,
        skipped: 0,
        validCombinations: 0,
        voltageStats: {
            above: 0,
            below: 0,
            exact: 0
        }
    };
    
    // Process each R2 index in the chunk
    for (const j of r2Indices) {
        const r2Idx = sortedIndices[j];
        const r2Value = resistanceCache.get(r2Idx);
        
        if (!r2Value || r2Value === 0) continue;
        
        // Calculate ideal R1 for this R2
        const idealR1 = r2Value * (1/targetRatio - 1);
        
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
        const testRange = Math.min(50, Math.floor(sortedIndices.length / 10));
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
                if (totalR >= existingEntry.totalR) {
                    stats.processed++;
                    stats.skipped++;
                    continue;
                }
            }
            
            const outputVoltage = ratio * supplyVoltage;
            const error = outputVoltage - targetVoltage;
            
            // Only include results that are within bounds or if overshoot is allowed
            if (allowOvershoot || error <= 0) {
                stats.validCombinations++;
                
                // Update voltage statistics
                if (Math.abs(error) < 0.0001) {
                    stats.voltageStats.exact++;
                } else if (error > 0) {
                    stats.voltageStats.above++;
                } else {
                    stats.voltageStats.below++;
                }
                
                // Calculate voltage range considering tolerances
                const voltageRange = calculateVoltageRange(r1Value, r2Value, supplyVoltage);
                
                const result = {
                    r1: combinations[r1Idx],
                    r2: combinations[r2Idx],
                    r1Value: r1Value,
                    r2Value: r2Value,
                    outputVoltage: outputVoltage,
                    error: error,
                    componentCount: getComponentCount(combinations[r1Idx], combinations[r2Idx]),
                    voltageRange: voltageRange,
                    totalResistance: r1Value + r2Value
                };
                
                results.push(result);
                
                // Update our tracking map
                seenRatios.set(ratioKey, {
                    totalR: r1Value + r2Value,
                    result: result
                });
            }
            
            stats.processed++;
        }
    }
    
    return { results, stats };
}

// Message handler
self.addEventListener('message', function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'init':
            // Initialize utilities from main thread
            ResistorUtils = data.ResistorUtils;
            resistorTolerances = data.resistorTolerances;
            self.postMessage({ type: 'initialized' });
            break;
            
        case 'processChunk':
            // Process a chunk of work
            try {
                const result = processChunk(data);
                self.postMessage({ 
                    type: 'chunkComplete', 
                    results: result.results,
                    stats: result.stats
                });
            } catch (error) {
                self.postMessage({ 
                    type: 'error', 
                    error: error.message 
                });
            }
            break;
    }
}); 