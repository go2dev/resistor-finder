/**
 * Balanced / impedance-matched attenuator registry and shared resistive-network math.
 * U-pad and L-pad are implemented; Pi, H, and T are registered for future work.
 */
(function () {
    const KINDS = {
        u: {
            id: 'u',
            label: 'U-pad (symmetric)',
            description: 'R_top = R_bot, R_mid shunt. Search uses loaded tap ratio vs Z_load.',
            implemented: true
        },
        l: {
            id: 'l',
            label: 'L-pad',
            description: 'R_series then node; R_shunt and Z_load to ground. Divider-style search on loaded ratio.',
            implemented: true
        },
        pi: {
            id: 'pi',
            label: 'Pi-pad',
            description: 'Three-branch pi network (not yet implemented).',
            implemented: false
        },
        h: {
            id: 'h',
            label: 'H-pad',
            description: 'Bridged H topology (not yet implemented).',
            implemented: false
        },
        t: {
            id: 't',
            label: 'T-pad',
            description: 'Tee network (not yet implemented).',
            implemented: false
        }
    };

    function parallelTwo(a, b) {
        if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return NaN;
        return (a * b) / (a + b);
    }

    function dbToVoltageRatio(db) {
        if (!Number.isFinite(db)) return NaN;
        return Math.pow(10, -db / 20);
    }

    function voltageRatioToDb(ratio) {
        if (!Number.isFinite(ratio) || ratio <= 0) return NaN;
        return -20 * Math.log10(ratio);
    }

    /** U-pad loaded tap: Vin — R — tap — (R_mid+R_bot)||Z — gnd */
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

    /** L-pad: Vin — R_series — tap; R_shunt||Z_load to ground */
    function lpadLoadedTapRatio(rSeries, rShunt, zLoad) {
        if (!Number.isFinite(rSeries) || !Number.isFinite(rShunt) || rSeries <= 0 || rShunt <= 0) return 0;
        if (!Number.isFinite(zLoad) || zLoad <= 0) {
            const denom = rSeries + rShunt;
            return denom > 0 ? rShunt / denom : 0;
        }
        const req = parallelTwo(rShunt, zLoad);
        const den = rSeries + req;
        return den > 0 ? req / den : 0;
    }

    /** Ideal R_series for given R_shunt, Z_load, and voltage ratio Vtap/Vin */
    function idealLpadSeriesForShunt(rShunt, zLoad, targetRatio) {
        if (!Number.isFinite(rShunt) || rShunt <= 0 || !Number.isFinite(targetRatio) || targetRatio <= 0 || targetRatio >= 1) {
            return NaN;
        }
        const t = targetRatio;
        if (!Number.isFinite(zLoad) || zLoad <= 0) {
            return rShunt * (1 / t - 1);
        }
        const req = parallelTwo(rShunt, zLoad);
        if (!Number.isFinite(req) || req <= 0) return NaN;
        return req * (1 / t - 1);
    }

    function computeLpadAnalysis(rSeries, rShunt, vin, zLoad) {
        const ratio = lpadLoadedTapRatio(rSeries, rShunt, zLoad);
        const vTap = Number.isFinite(vin) && vin > 0 ? ratio * vin : 0;
        const req = (!Number.isFinite(zLoad) || zLoad <= 0)
            ? rShunt
            : parallelTwo(rShunt, zLoad);
        const zInLoaded = Number.isFinite(req) ? rSeries + req : NaN;
        const zOutThevenin = parallelTwo(rSeries, rShunt);
        let iSeries = 0;
        let iShunt = 0;
        let iLoad = 0;
        let pSeries = 0;
        let pShunt = 0;
        let pLoad = 0;
        if (Number.isFinite(vin) && vin > 0 && Number.isFinite(zInLoaded) && zInLoaded > 0) {
            iSeries = vin / zInLoaded;
            iLoad = (!Number.isFinite(zLoad) || zLoad <= 0) ? 0 : vTap / zLoad;
            iShunt = (!Number.isFinite(zLoad) || zLoad <= 0) ? iSeries : iSeries - iLoad;
            pSeries = iSeries * iSeries * rSeries;
            pShunt = (vTap * vTap) / rShunt;
            pLoad = (!Number.isFinite(zLoad) || zLoad <= 0) ? 0 : (vTap * vTap) / zLoad;
        }
        return {
            zInOpen: rSeries + rShunt,
            zInLoaded,
            zOutThevenin,
            vTap,
            iSeries,
            iShunt,
            iLoad,
            pSeries,
            pShunt,
            pLoad,
            insertionLossDb: voltageRatioToDb(ratio)
        };
    }

    window.AttenuatorEngine = {
        KINDS,
        listKinds() {
            return Object.values(KINDS);
        },
        isImplemented(kind) {
            return Boolean(KINDS[kind]?.implemented);
        },
        getKindFromDom() {
            const el = document.getElementById('attenuatorType');
            const v = (el?.value || 'u').toLowerCase();
            return KINDS[v] ? v : 'u';
        },
        parallelTwo,
        dbToVoltageRatio,
        voltageRatioToDb,
        upadLoadedTapRatio,
        idealUpadLegForMid,
        lpadLoadedTapRatio,
        idealLpadSeriesForShunt,
        computeLpadAnalysis
    };
})();
