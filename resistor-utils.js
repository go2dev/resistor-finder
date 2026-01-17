// Shared utilities for resistor parsing, formatting, and series data
const ResistorUtils = {
    // Resistor series data
    series: {
        E24: [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1],
        E48: [1.00, 1.05, 1.10, 1.15, 1.21, 1.27, 1.33, 1.40, 1.47, 1.54, 1.62, 1.69, 1.78, 1.87, 1.96, 2.05, 2.15, 2.26, 2.37, 2.49, 2.61, 2.74, 2.87, 3.01, 3.16, 3.32, 3.48, 3.65, 3.83, 4.02, 4.22, 4.42, 4.64, 4.87, 5.11, 5.36, 5.62, 5.90, 6.19, 6.49, 6.81, 7.15, 7.50, 7.87, 8.25, 8.66, 9.09, 9.53],
        E96: [1.00, 1.02, 1.05, 1.07, 1.10, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.30, 1.33, 1.37, 1.40, 1.43, 1.47, 1.50, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2.00, 2.05, 2.10, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.80, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24, 3.32, 3.40, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.90, 6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.50, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76],
        E192: [1.00, 1.01, 1.02, 1.04, 1.05, 1.06, 1.07, 1.09, 1.10, 1.11, 1.13, 1.14, 1.15, 1.17, 1.18, 1.20, 1.21, 1.23, 1.24, 1.26, 1.27, 1.29, 1.30, 1.32, 1.33, 1.35, 1.37, 1.38, 1.40, 1.42, 1.43, 1.45, 1.47, 1.49, 1.50, 1.52, 1.54, 1.56, 1.58, 1.60, 1.62, 1.64, 1.65, 1.67, 1.69, 1.72, 1.74, 1.76, 1.78, 1.80, 1.82, 1.84, 1.87, 1.89, 1.91, 1.93, 1.96, 1.98, 2.00, 2.03, 2.05, 2.08, 2.10, 2.13, 2.15, 2.18, 2.21, 2.23, 2.26, 2.29, 2.32, 2.34, 2.37, 2.40, 2.43, 2.46, 2.49, 2.52, 2.55, 2.58, 2.61, 2.64, 2.67, 2.71, 2.74, 2.77, 2.80, 2.84, 2.87, 2.91, 2.94, 2.98, 3.01, 3.05, 3.09, 3.12, 3.16, 3.20, 3.24, 3.28, 3.32, 3.36, 3.40, 3.44, 3.48, 3.52, 3.57, 3.61, 3.65, 3.70, 3.74, 3.79, 3.83, 3.88, 3.92, 3.97, 4.02, 4.07, 4.12, 4.17, 4.22, 4.27, 4.32, 4.37, 4.42, 4.48, 4.53, 4.59, 4.64, 4.70, 4.75, 4.81, 4.87, 4.93, 4.99, 5.05, 5.11, 5.17, 5.23, 5.30, 5.36, 5.42, 5.49, 5.56, 5.62, 5.69, 5.76, 5.83, 5.90, 5.97, 6.04, 6.12, 6.19, 6.26, 6.34, 6.42, 6.49, 6.57, 6.65, 6.73, 6.81, 6.90, 6.98, 7.06, 7.15, 7.23, 7.32, 7.41, 7.50, 7.59, 7.68, 7.77, 7.87, 7.96, 8.06, 8.16, 8.25, 8.35, 8.45, 8.56, 8.66, 8.76, 8.87, 8.98, 9.09, 9.20, 9.31, 9.42, 9.53, 9.65, 9.76, 9.88]
    },
    luts: {
        JLC_BASIC: [
            '100m', '1', '2', '2.2', '4.7', '5.1', '10', '20', '22', '33', '47', '49.9', '51', '75', '100', '120', '150',
            '200', '220', '270', '300', '330', '390', '470', '510', '560', '680', '820', '1k', '1k2', '1k5', '1k8', '2k',
            '2k2', '2k4', '2k7', '3k', '3k3', '3k6', '3k9', '4k7', '4k99', '5k1', '5k6', '6k2', '6k8', '7k5', '8k2',
            '9k1', '10k', '12k', '13k', '15k', '18k', '20k', '22k', '24k', '27k', '30k', '33k', '39k', '47k', '49k9',
            '51k', '56k', '68k', '75k', '82k', '100k', '120k', '150k', '200k', '300k', '330k', '470k', '510k', '1M',
            '2M', '10M'
        ]
    },
    toleranceLetterMap: {
        A: 0.05,
        B: 0.1,
        C: 0.25,
        D: 0.5,
        E: 0.005,
        F: 1.0,
        G: 2.0,
        H: 3.0,
        J: 5.0,
        K: 10.0,
        L: 0.01,
        M: 20.0,
        N: 30.0,
        P: 0.02,
        W: 0.05
    },
    powerCodeMap: {
        BB: 0.125,
        CB: 0.25,
        EB: 0.5,
        GB: 1,
        HB: 2,
        GM: 3,
        HM: 4
    },
    eia96Multipliers: {
        Z: 0.001,
        Y: 0.01,
        X: 0.1,
        A: 1,
        B: 10,
        C: 100,
        D: 1000,
        E: 10000,
        F: 100000,
        G: 1000000,
        H: 10000000
    },
    resistorTolerances: {
        E24: 5,
        E48: 2,
        E96: 1,
        E192: 0.5
    },

    getEia96BaseValues() {
        return this.series.E96.map(value => Math.round(value * 100));
    },

    parseToleranceInput(toleranceText, warnings) {
        if (!toleranceText) return null;
        const trimmed = toleranceText.trim();
        if (!trimmed) return null;
        const upper = trimmed.toUpperCase();

        if (this.toleranceLetterMap[upper] !== undefined) {
            return this.toleranceLetterMap[upper];
        }

        const numeric = trimmed.replace('%', '');
        const parsed = parseFloat(numeric);
        if (!isNaN(parsed)) {
            return parsed;
        }

        if (warnings) {
            warnings.push(`Invalid tolerance "${trimmed}" ignored`);
        }
        return null;
    },

    getSeriesForTolerance(tolerance) {
        if (tolerance == null) return null;
        if (tolerance <= 0.5) return 'E192';
        if (tolerance <= 1) return 'E96';
        if (tolerance <= 2) return 'E48';
        if (tolerance <= 5) return 'E24';
        return null;
    },

    snapToSeries(value, seriesName) {
        if (!seriesName || !this.series[seriesName]) return value;
        if (value <= 0) return value;
        const seriesValues = this.series[seriesName];
        const decade = Math.pow(10, Math.floor(Math.log10(value)));
        const normalized = value / decade;
        let closest = seriesValues[0];
        let minDiff = Infinity;
        for (const seriesValue of seriesValues) {
            const diff = Math.abs(seriesValue - normalized);
            if (diff < minDiff) {
                minDiff = diff;
                closest = seriesValue;
            }
        }
        return closest * decade;
    },

    // Parse resistor value from string notation to number
    parseResistorValue(value) {
        // Remove any whitespace
        value = value.trim();

        // If it's just a number, return it
        if (!isNaN(value)) {
            return parseFloat(value);
        }

        // Handle letter notation
        const multipliers = {
            'L': 0.001,
            'l': 0.001,
            'm': 0.001,
            'R': 1,
            'r': 1,
            'K': 1000,
            'k': 1000,
            'M': 1000000,
            'G': 1000000000,
            'g': 1000000000
        };

        // Decimal notation (e.g., "2.2k")
        const decimalMatch = value.match(/^(\d+\.?\d*)([kKmMgGrRlLm])$/);
        if (decimalMatch) {
            const [, number, unit] = decimalMatch;
            return parseFloat(number) * multipliers[unit];
        }

        // Letter notation (e.g., "2k2", "43k2")
        const letterMatch = value.match(/^(\d+)([kKmMgGrRlLm])(\d*)$/);
        if (letterMatch) {
            const [, whole, unit, decimal] = letterMatch;
            const multiplier = multipliers[unit];
            let result = parseFloat(whole) * multiplier;

            // Add decimal part if it exists
            if (decimal) {
                result += (parseFloat(decimal) * multiplier) / Math.pow(10, decimal.length);
            }

            return result;
        }

        // Leading letter notation (e.g., "R47", "K47")
        const leadingLetterMatch = value.match(/^([kKmMgGrRlLm])(\d+)$/);
        if (leadingLetterMatch) {
            const [, unit, decimal] = leadingLetterMatch;
            const multiplier = multipliers[unit];
            return (parseFloat(decimal) * multiplier) / Math.pow(10, decimal.length);
        }

        throw new Error('Invalid resistor value format');
    },

    parseResistorInput(input, options = {}) {
        const warnings = [];
        let working = input.trim();
        let tolerance = null;
        let powerRating = null;
        let powerCode = null;
        let series = null;
        let parsedValue = null;
        let source = 'value';

        const toleranceMatch = working.match(/^(.*)\((.*)\)$/);
        if (toleranceMatch) {
            working = toleranceMatch[1].trim();
            tolerance = this.parseToleranceInput(toleranceMatch[2], warnings);
        }

        // Full marking code: two letters + four digits (e.g. EB1041)
        const fullMarkMatch = working.match(/^([A-Za-z]{2})(\d{4})$/);
        if (fullMarkMatch) {
            const [, power, digits] = fullMarkMatch;
            powerCode = power.toUpperCase();
            powerRating = this.powerCodeMap[powerCode] ?? null;
            if (!powerRating) {
                warnings.push(`Unknown power code "${powerCode}" ignored`);
            }
            const sig = parseInt(digits.slice(0, 2), 10);
            const multiplier = parseInt(digits[2], 10);
            const toleranceDigit = parseInt(digits[3], 10);
            parsedValue = sig * Math.pow(10, multiplier);
            if (tolerance == null) {
                const toleranceFromDigit = toleranceDigit * 10;
                if (toleranceFromDigit > 0) {
                    tolerance = toleranceFromDigit;
                }
            }
            source = 'marking';
        }

        // EIA-96 code (e.g. 96C)
        if (parsedValue == null) {
            const eiaMatch = working.match(/^(\d{2})([A-Za-z])$/);
            if (eiaMatch) {
                const code = parseInt(eiaMatch[1], 10);
                const letter = eiaMatch[2].toUpperCase();
                const baseValues = this.getEia96BaseValues();
                if (code < 1 || code > baseValues.length) {
                    throw new Error('Invalid EIA-96 code');
                }
                const baseValue = baseValues[code - 1];
                const multiplier = this.eia96Multipliers[letter];
                if (!multiplier) {
                    throw new Error('Invalid EIA-96 multiplier');
                }
                parsedValue = baseValue * multiplier;
                series = 'E96';
                source = 'eia96';
            }
        }

        if (parsedValue == null) {
            parsedValue = this.parseResistorValue(working);
        }

        const snapToSeries = options.snapToSeries;
        if (snapToSeries) {
            const toleranceSeries = this.getSeriesForTolerance(tolerance);
            const fallbackSeries = options.snapSeries || 'E24';
            const targetSeries = series || toleranceSeries || fallbackSeries;
            const snapped = this.snapToSeries(parsedValue, targetSeries);
            parsedValue = snapped;
            series = targetSeries;
        }

        return {
            value: parsedValue,
            tolerance,
            powerRating,
            powerCode,
            series,
            source,
            warnings
        };
    },

    // Format resistor value using standard electronics notation with up to 2 decimal digits
    formatResistorValue(value) {
        const units = [
            { value: 1e9, symbol: 'G' },
            { value: 1e6, symbol: 'M' },
            { value: 1e3, symbol: 'K' },
            { value: 1, symbol: 'Ω' },
            { value: 1e-3, symbol: 'mΩ' }
        ];

        for (const unit of units) {
            if (value >= unit.value) {
                const scaled = value / unit.value;
                const roundedScaled = Math.round(scaled * 100) / 100;
                if (Math.abs(roundedScaled - Math.round(roundedScaled)) < 0.000001) {
                    return `${Math.round(roundedScaled)}${unit.symbol}`;
                }

                const fixed = roundedScaled.toFixed(2);
                const [whole, decimal] = fixed.split('.');
                const trimmedDecimal = decimal.replace(/0+$/, '');
                if (trimmedDecimal.length > 0) {
                    return `${whole}${unit.symbol}${trimmedDecimal}`;
                }
                return `${whole}${unit.symbol}`;
            }
        }
        return value.toString();
    },

    formatResistanceLabel(value) {
        if (value >= 1e9) return `${(value / 1e9).toFixed(2).replace(/\.?0+$/, '')}G`;
        if (value >= 1e6) return `${(value / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
        if (value >= 1e3) return `${(value / 1e3).toFixed(2).replace(/\.?0+$/, '')}K`;
        if (value >= 1) return `${value.toFixed(2).replace(/\.?0+$/, '')}R`;
        return `${(value * 1e3).toFixed(2).replace(/\.?0+$/, '')}m`;
    },

    // Calculate equivalent resistance for resistors in series
    calculateSeriesResistance(resistors) {
        if (!Array.isArray(resistors)) return resistors.value ?? resistors;
        return resistors.reduce((sum, r) => sum + (r.value ?? r), 0);
    },

    // Calculate equivalent resistance for resistors in parallel
    calculateParallelResistance(resistors) {
        if (!Array.isArray(resistors)) return resistors.value ?? resistors;
        return 1 / resistors.reduce((sum, r) => sum + (1 / (r.value ?? r)), 0);
    },

    // Calculate total resistance based on connection type
    calculateTotalResistance(resistors) {
        if (!Array.isArray(resistors)) return resistors.value ?? resistors;
        if (resistors.type === 'parallel') {
            return this.calculateParallelResistance(resistors);
        }
        return this.calculateSeriesResistance(resistors);
    },

    // Find which standard series a value belongs to
    findResistorSeries(value) {
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
            const found = this.series[seriesName].some(seriesValue =>
                Math.abs(normalized - seriesValue) < tolerance
            );
            if (found) {
                return seriesName;
            }
        }
        return null;
    }
};
