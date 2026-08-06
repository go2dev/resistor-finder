function initRfInteractiveDivider() {
    const diagramMount = document.getElementById('interactiveDividerDiagram');
    const supplyInput = document.getElementById('interactiveSupplyVoltage');
    const snapCheckbox = document.getElementById('interactiveSnapToSeries');
    const snapSeriesSelect = document.getElementById('interactiveSnapSeries');
    const resultsEl = document.getElementById('interactiveDividerResults');
    const dialogEl = document.getElementById('interactiveResistorDialog');
    const dialogInput = document.getElementById('interactiveResistorInput');
    const dialogApply = document.getElementById('interactiveDialogApply');
    const dialogParallel = document.getElementById('interactiveDialogParallel');
    const dialogRemove = document.getElementById('interactiveDialogRemove');
    const dialogClose = document.getElementById('interactiveDialogClose');

    if (!diagramMount || !supplyInput) return;

    let tooltipEl = null;
    let selectedPath = null;

    function getParseOptions() {
        return {
            snapToSeries: snapCheckbox?.checked,
            snapSeries: snapSeriesSelect?.value || 'E24'
        };
    }

    function defaultResistorEntry(inputStr) {
        const parsed = ResistorUtils.parseResistorInput(inputStr, getParseOptions());
        const seriesName = parsed.series || ResistorUtils.findResistorSeries(parsed.value);
        return {
            value: parsed.value,
            input: inputStr,
            tolerance: parsed.tolerance,
            series: seriesName,
            powerRating: parsed.powerRating,
            powerCode: parsed.powerCode
        };
    }

    let topSection = [defaultResistorEntry('10k')];
    let bottomSection = [defaultResistorEntry('10k')];

    function cloneSection(sec) {
        if (sec == null) return sec;
        if (Array.isArray(sec)) {
            const out = sec.map(el => cloneSection(el));
            if (sec.type) out.type = sec.type;
            return out;
        }
        if (typeof sec === 'object') {
            return { ...sec };
        }
        return sec;
    }

    function pathFromKey(pathKey) {
        const idx = pathKey.indexOf(':');
        const branch = pathKey.slice(0, idx);
        const rest = pathKey.slice(idx + 1);
        const indices = rest ? rest.split('.').filter(Boolean).map(Number) : [];
        return { branch, indices };
    }

    function getRoot(branch) {
        return branch === 'top' ? topSection : bottomSection;
    }

    function getNodeAtPath(root, pathIndices) {
        if (!pathIndices.length) return root;
        let cur = root;
        for (const i of pathIndices) {
            cur = cur[i];
        }
        return cur;
    }

    function navigateParent(root, pathIndices) {
        if (!pathIndices.length) return null;
        if (pathIndices.length === 1) {
            return { parent: root, index: pathIndices[0] };
        }
        let cur = root;
        for (let i = 0; i < pathIndices.length - 1; i++) {
            cur = cur[pathIndices[i]];
        }
        return { parent: cur, index: pathIndices[pathIndices.length - 1] };
    }

    function sectionToCalculatorFormat(section) {
        if (!Array.isArray(section)) {
            return section;
        }
        const type = section.type || 'series';
        const mapped = section.map(el => {
            if (Array.isArray(el)) {
                return sectionToCalculatorFormat(el);
            }
            return el;
        });
        mapped.type = type;
        return mapped;
    }

    function addSeriesRelative(pathKey, where) {
        const { branch, indices } = pathFromKey(pathKey);
        const root = getRoot(branch);
        const idx = indices[indices.length - 1];
        const insertAt = where === 'above' ? idx : idx + 1;
        const parentIndices = indices.slice(0, -1);
        let targetArr = parentIndices.length ? getNodeAtPath(root, parentIndices) : root;
        const def = defaultResistorEntry('10k');
        targetArr.splice(insertAt, 0, def);
        updateAll();
    }

    function addParallelToResistor(pathKey) {
        const { branch, indices } = pathFromKey(pathKey);
        const root = getRoot(branch);
        const nav = navigateParent(root, indices);
        if (!nav) return;
        const oldLeaf = nav.parent[nav.index];
        const newLeg = defaultResistorEntry('10k');
        const group = [oldLeaf, newLeg];
        group.type = 'parallel';
        nav.parent[nav.index] = group;
        updateAll();
    }

    function removeResistor(pathKey) {
        const { branch, indices } = pathFromKey(pathKey);
        const root = getRoot(branch);
        const nav = navigateParent(root, indices);
        if (!nav || !Array.isArray(nav.parent) || nav.parent.length <= 1) return;
        nav.parent.splice(nav.index, 1);
        if (!topSection.length) topSection = [defaultResistorEntry('10k')];
        if (!bottomSection.length) bottomSection = [defaultResistorEntry('10k')];
        updateAll();
    }

    function applyResistorValue(pathKey, inputStr) {
        let parsed;
        try {
            parsed = ResistorUtils.parseResistorInput(inputStr.trim(), getParseOptions());
        } catch (e) {
            alert(e.message || String(e));
            return;
        }
        if (parsed.value <= 0) {
            alert('Value must be positive');
            return;
        }
        const seriesName = parsed.series || ResistorUtils.findResistorSeries(parsed.value);
        const { branch, indices } = pathFromKey(pathKey);
        const root = getRoot(branch);
        const nav = navigateParent(root, indices);
        if (!nav) return;
        const obj = nav.parent[nav.index];
        if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
            obj.value = parsed.value;
            obj.input = inputStr.trim();
            obj.tolerance = parsed.tolerance;
            obj.series = seriesName;
            obj.powerRating = parsed.powerRating;
            obj.powerCode = parsed.powerCode;
        }
        updateAll();
    }

    function computeStrokeColor() {
        const c = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim();
        return c || '#333';
    }

    function formatBounds(bounds) {
        return `${ResistorUtils.formatResistorValue(bounds.lower)} – ${ResistorUtils.formatResistorValue(bounds.upper)}`;
    }

    function updateResultsPanel(calc, rTopTree, rBotTree, supply, vOut) {
        if (!resultsEl) return;
        const rTop = calc.calculateTotalResistance(rTopTree);
        const rBot = calc.calculateTotalResistance(rBotTree);
        const totalR = rTop + rBot;
        const current = supply / totalR;
        const vRange = calc.calculateVoltageRange(rTopTree, rBotTree, supply);
        const bTop = calc.calculateSectionBounds(rTopTree);
        const bBot = calc.calculateSectionBounds(rBotTree);

        const powerStats = typeof getPowerStatsForDividerTrees === 'function'
            ? getPowerStatsForDividerTrees(rTopTree, rBotTree, supply)
            : null;
        const packageRec = powerStats && typeof getPackageRecommendation === 'function'
            ? getPackageRecommendation(powerStats.maxComponentPower)
            : null;
        const warnings = powerStats && typeof getPowerWarnings === 'function'
            ? getPowerWarnings(powerStats, calc)
            : [];
        const warningHtml = warnings.length
            ? `<div class="result-warning">Power warning: ${warnings.join(', ')}</div>`
            : '';

        const fmtW = typeof formatWatts === 'function' ? formatWatts : (w) => `${(w * 1000).toFixed(1)} mW`;
        const powerRow = powerStats
            ? `<tr><td><strong>Power dissipation</strong></td><td class="power-values">R<sub>TOP</sub>: ${fmtW(powerStats.r1Stats.total)}, R<sub>BOT</sub>: ${fmtW(powerStats.r2Stats.total)}, Total: ${fmtW(powerStats.totalPower)}</td></tr>`
            : '';
        const pkgRow = packageRec
            ? `<tr><td><strong>Min package size recommendation</strong></td><td class="package-recommendation">${packageRec.imperial}/${packageRec.metric} (min ${fmtW(packageRec.rating)})</td></tr>`
            : '';

        resultsEl.innerHTML = `
            <table class="result-table interactive-results-table">
                <tbody>
                    <tr><td><strong>R<sub>TOP</sub> (nominal)</strong></td><td>${calc.formatResistorValue(rTop)}</td></tr>
                    <tr><td><strong>R<sub>TOP</sub> (range)</strong></td><td>${formatBounds(bTop)}</td></tr>
                    <tr><td><strong>R<sub>BOT</sub> (nominal)</strong></td><td>${calc.formatResistorValue(rBot)}</td></tr>
                    <tr><td><strong>R<sub>BOT</sub> (range)</strong></td><td>${formatBounds(bBot)}</td></tr>
                    <tr><td><strong>Total resistance</strong></td><td>${calc.formatResistorValue(totalR)}</td></tr>
                    <tr><td><strong>Total current at V<sub>supply</sub></strong></td><td>${current.toExponential(4)} A (${(current * 1000).toFixed(3)} mA)</td></tr>
                    ${powerRow}
                    ${pkgRow}
                    <tr><td><strong>Nominal V<sub>out</sub></strong></td><td>${vOut.toFixed(3)} V</td></tr>
                    <tr><td><strong>Real world range for V<sub>out</sub></strong></td><td><span class="voltage-range">${vRange.min.toFixed(2)} V to ${vRange.max.toFixed(2)} V</span></td></tr>
                </tbody>
            </table>
            ${warningHtml}
            <p class="interactive-touch-hint">Touch: tap a resistor for value / add parallel / remove; tap thin strips above or below a resistor to insert another in series; tap a horizontal parallel bus for that group’s equivalent resistance.</p>
        `;
    }

    function wireInteractions(svg, hits, calc) {
        hits.parallelBuses.forEach(bus => {
            const pk = bus.element.getAttribute('data-path');
            bus.element.addEventListener('pointerenter', ev => {
                const { branch, indices } = pathFromKey(pk);
                const root = getRoot(branch);
                const sec = getNodeAtPath(root, indices);
                if (!Array.isArray(sec) || sec.type !== 'parallel') return;
                const tree = sectionToCalculatorFormat(cloneSection(sec));
                const nom = calc.calculateTotalResistance(tree);
                const b = calc.calculateSectionBounds(tree);
                showTooltip(ev.clientX, ev.clientY,
                    `Parallel group: ${calc.formatResistorValue(nom)}\nRange: ${formatBounds(b)}`, null);
            });
            bus.element.addEventListener('pointerleave', hideTooltip);
            bus.element.addEventListener('pointermove', ev => moveTooltip(ev.clientX, ev.clientY));
        });

        hits.resistors.forEach(h => {
            const pk = h.element.getAttribute('data-path');
            h.element.addEventListener('click', () => openDialog(pk));
            h.element.addEventListener('pointerenter', ev => {
                const node = resolveNode(pk);
                if (!node || typeof node !== 'object') return;
                const tol = node.tolerance != null
                    ? `${node.tolerance}%`
                    : (node.series ? `${ResistorUtils.resistorTolerances[node.series]}% (series)` : '—');
                const series = node.series || '—';
                const bgSeries = node.series ? node.series.toLowerCase() : null;
                showTooltip(ev.clientX, ev.clientY,
                    `${node.value} Ω\nSeries: ${series}\nTolerance: ${tol}\nPrecision/input: ${node.input || '—'}`,
                    bgSeries);
            });
            h.element.addEventListener('pointerleave', hideTooltip);
            h.element.addEventListener('pointermove', ev => moveTooltip(ev.clientX, ev.clientY));
        });

        hits.seriesAbove.forEach(entry => {
            const pk = entry.pathKey;
            entry.element.addEventListener('click', () => addSeriesRelative(pk, 'above'));
        });
        hits.seriesBelow.forEach(entry => {
            const pk = entry.pathKey;
            entry.element.addEventListener('click', () => addSeriesRelative(pk, 'below'));
        });
    }

    function resolveNode(pathKey) {
        const { branch, indices } = pathFromKey(pathKey);
        const root = getRoot(branch);
        return getNodeAtPath(root, indices);
    }

    function openDialog(pathKey) {
        selectedPath = pathKey;
        const node = resolveNode(pathKey);
        if (dialogEl && dialogInput && node) {
            dialogInput.value = node.input || ResistorUtils.formatResistorValue(node.value);
            dialogEl.hidden = false;
            if (dialogRemove) {
                const { branch, indices } = pathFromKey(pathKey);
                const root = getRoot(branch);
                const nav = navigateParent(root, indices);
                dialogRemove.disabled = !(nav && Array.isArray(nav.parent) && nav.parent.length > 1);
            }
        }
    }

    function closeDialog() {
        if (dialogEl) dialogEl.hidden = true;
        selectedPath = null;
    }

    function showTooltip(x, y, text, seriesClass) {
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'interactive-svg-tooltip';
            document.body.appendChild(tooltipEl);
        }
        tooltipEl.textContent = text;
        tooltipEl.style.display = 'block';
        tooltipEl.className = 'interactive-svg-tooltip' + (seriesClass ? ` series-${seriesClass}` : '');
        positionTooltip(x, y);
    }

    function moveTooltip(x, y) {
        if (!tooltipEl || tooltipEl.style.display === 'none') return;
        positionTooltip(x, y);
    }

    function positionTooltip(x, y) {
        if (!tooltipEl) return;
        const pad = 14;
        tooltipEl.style.left = `${Math.min(x + pad, window.innerWidth - 220)}px`;
        tooltipEl.style.top = `${Math.min(y + pad, window.innerHeight - 80)}px`;
    }

    function hideTooltip() {
        if (tooltipEl) tooltipEl.style.display = 'none';
    }

    function updateAll() {
        const calc = new ResistorCalculator();
        const supplyResult = getNumericInputValue(supplyInput, 'Supply Voltage');
        const supply = supplyResult.valid ? supplyResult.value : 5;

        const rTopTree = sectionToCalculatorFormat(cloneSection(topSection));
        const rBotTree = sectionToCalculatorFormat(cloneSection(bottomSection));
        const rTop = calc.calculateTotalResistance(rTopTree);
        const rBot = calc.calculateTotalResistance(rBotTree);
        const vOut = calc.calculateOutputVoltage(rTop, rBot, supply);

        updateResultsPanel(calc, rTopTree, rBotTree, supply, vOut);

        diagramMount.innerHTML = '';
        const diagram = new Diagram('interactiveDividerDiagram', 400, 400, { skipAppend: true });
        const strokeColor = computeStrokeColor();
        const meta = diagram.renderInteractiveVoltageDivider(rTopTree, rBotTree, {
            supplyVoltage: supply,
            outputVoltage: vOut,
            strokeColor,
            layoutConfig: { minWidth: 300 }
        });

        wireInteractions(diagram.svg, meta.hits, calc);
    }

    if (dialogApply) {
        dialogApply.addEventListener('click', () => {
            if (selectedPath && dialogInput) applyResistorValue(selectedPath, dialogInput.value);
            closeDialog();
        });
    }
    if (dialogParallel) {
        dialogParallel.addEventListener('click', () => {
            if (selectedPath) addParallelToResistor(selectedPath);
            closeDialog();
        });
    }
    if (dialogRemove) {
        dialogRemove.addEventListener('click', () => {
            if (selectedPath) removeResistor(selectedPath);
            closeDialog();
        });
    }
    if (dialogClose) dialogClose.addEventListener('click', closeDialog);

    supplyInput.addEventListener('input', updateAll);
    if (snapCheckbox) snapCheckbox.addEventListener('change', updateAll);
    if (snapSeriesSelect) snapSeriesSelect.addEventListener('change', updateAll);

    updateAll();
}

globalThis.__rfInitInteractiveDivider = initRfInteractiveDivider;
