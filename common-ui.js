(() => {
    const page = document.body?.dataset?.page || '';
    const topNav = document.getElementById('topNav');
    if (topNav) {
        topNav.innerHTML = `
            <div class="top-nav">
                <a href="index.html" class="nav-link ${page === 'voltage-divider' ? 'active' : ''}">Voltage Divider</a>
                <a href="interactive-divider.html" class="nav-link ${page === 'interactive-divider' ? 'active' : ''}">Interactive Divider</a>
                <a href="balanced-attenuator.html" class="nav-link ${page === 'balanced-attenuator' ? 'active' : ''}">Balanced Attenuator</a>
                <a href="target-resistance.html" class="nav-link ${page === 'target-resistance' ? 'active' : ''}">Target Resistance</a>
                <a href="readme.html" target="_blank" class="nav-link">Documentation</a>
            </div>
        `;
    }

    const resistorInputSection = document.getElementById('resistorInputSection');
    if (resistorInputSection) {
        resistorInputSection.innerHTML = `
            <div class="input-group">
                <label for="resistorValues">Available Resistor Values (Ω):</label>
                <input type="text" id="resistorValues" placeholder="Enter values separated by commas (e.g. 100, 4K7, 4K99, 96C, EB1041, 10k(1%), 10k(D), 100m)">
                <div class="autofill-controls">
                    <div class="autofill-row">
                        <button id="autofillBtn" class="autofill-btn">Autofill common values</button>
                        <div class="autofill-selects">
                            <span class="autofill-label">Decade:</span>
                            <select id="autofillRange" class="autofill-range-select">
                                <option value="1">Ω</option>
                                <option value="10">10Ω</option>
                                <option value="100" selected>100Ω</option>
                                <option value="1000">KΩ</option>
                                <option value="10000">10KΩ</option>
                                <option value="100000">100KΩ</option>
                                <option value="1000000">MΩ</option>
                                <option value="10000000">10MΩ</option>
                                <option value="100000000">100MΩ</option>
                            </select>
                            <span class="autofill-label">Series:</span>
                            <select id="autofillSeries" class="autofill-series-select">
                                <option value="E24" selected>E24</option>
                                <option value="E48">E48</option>
                                <option value="E96">E96</option>
                                <option value="E192">E192</option>
                            </select>
                        </div>
                    </div>
                    <div class="autofill-row">
                        <button id="autofillJlcBtn" class="autofill-btn autofill-btn-full">Autofill 'JLC PCB Basics' values</button>
                    </div>
                </div>
            </div>
        `;
    }

    const pageFooter = document.getElementById('pageFooter');
    if (pageFooter) {
        const currentYear = new Date().getFullYear();
        pageFooter.innerHTML = `
            <span class="disclaimer">Disclaimer: results are provided without warranty or verification. Use at your own risk!</span>
            <br>
            Made by <a href="https://mynameis.dev" target="_blank">Dev</a> © <a href="https://whatevertogether.net/" target="_blank">Whatever Together</a> ${currentYear}
            <br>
            <span class="disclaimer">Source on <a href="https://github.com/go2dev/resistor-finder" target="_blank">GitHub</a> · Version: <span id="appVersion">dev</span></span>
        `;
    }

    window.CommonUI = window.CommonUI || {};
    window.CommonUI.normalizeParsedValueWidths = function (root = document) {
        const grids = root.querySelectorAll('.parsed-values-grid');
        grids.forEach(grid => {
            const boxes = Array.from(grid.querySelectorAll('.parsed-value-box'));
            if (!boxes.length) return;
            boxes.forEach(box => {
                box.style.minWidth = '';
                box.style.width = '';
            });
            let maxWidth = 0;
            boxes.forEach(box => {
                maxWidth = Math.max(maxWidth, box.getBoundingClientRect().width);
            });
            const targetWidth = Math.ceil(maxWidth);
            grid.style.setProperty('--parsed-box-width', `${targetWidth}px`);
        });
    };

    /**
     * Re-apply JLC basics styling after async catalog load (no full recalculation).
     */
    window.CommonUI.refreshJlcBasicParsedBoxes = function (root = document) {
        const RU = window.ResistorUtils;
        if (!RU || typeof RU.isJlcBasicResistance !== 'function') return;
        root.querySelectorAll('.parsed-value-box[data-value]').forEach(box => {
            const v = parseFloat(box.dataset.value);
            if (!Number.isFinite(v)) return;
            const isJlc = RU.isJlcBasicResistance(v);
            const meta = typeof RU.getJlcBasicMeta === 'function' ? RU.getJlcBasicMeta(v) : null;
            box.classList.toggle('jlc-basic', isJlc);
            const legacyWrap = box.querySelector('.parsed-value-box-content');
            if (legacyWrap) {
                const fmt = legacyWrap.querySelector('.formatted');
                const tip = legacyWrap.querySelector('.box-tooltip') || box.querySelector('.box-tooltip');
                if (fmt) box.insertBefore(fmt, legacyWrap);
                if (tip && tip.parentNode === legacyWrap) box.appendChild(tip);
                legacyWrap.remove();
            }
            box.querySelectorAll('.jlc-basic-caption').forEach(el => el.remove());
            const tip = box.querySelector('.box-tooltip');
            if (!tip) return;
            const base = tip.innerHTML.split('<br>JLC PCB Basics list')[0];
            const debugIdx = base.indexOf('<br>Input:');
            const head = debugIdx >= 0 ? base.slice(0, debugIdx) : base;
            const tail = debugIdx >= 0 ? base.slice(debugIdx) : '';
            let extra = '';
            if (isJlc) {
                extra += '<br>JLC PCB Basics list';
                if (meta && meta.packages && meta.packages.length) {
                    extra += `<br>JLC basics sizes: ${meta.packages.join(', ')}`;
                }
                if (meta && meta.tolerances && meta.tolerances.length) {
                    extra += `<br>JLC catalog tolerance: ${meta.tolerances.map(t => `${t}%`).join(', ')}`;
                }
            }
            tip.innerHTML = head + extra + tail;
        });
        window.CommonUI.normalizeParsedValueWidths(root);
    };
    window.CommonUI.renderParsedValuesGrid = function ({
        title = 'Available resistors',
        tooltipText = 'Click a value to temporarily exclude/include it from the calculation. Colours indicate the E series of the value',
        conversions = [],
        resistorTolerances = ResistorUtils.resistorTolerances,
        onClickHandler = 'toggleResistorValue'
    } = {}) {
        if (!conversions.length) return '';
        const sorted = conversions.slice().sort((a, b) => a.value - b.value);
        return `
            <div class="parsed-values">
                <h3>${title}</h3>
                <div class="help-tooltip">
                    ?
                    <span class="tooltip-text">${tooltipText}</span>
                </div>
                <div class="parsed-values-grid">
                    ${sorted.map((conv, index) => {
                        const seriesLabel = conv.series ? `Series: ${conv.series}` : 'Non-standard value';
                        const toleranceValue = conv.tolerance != null
                            ? `${conv.tolerance}%`
                            : (conv.series ? `${resistorTolerances[conv.series]}% (series)` : 'Unknown');
                        const powerLabel = conv.powerRating ? `Power code: ${conv.powerCode} (${conv.powerRating}W)` : '';
                        const powerLine = powerLabel ? `<br>${powerLabel}` : '';
                        const meta = conv.jlcBasicMeta;
                        const isJlc = Boolean(conv.isJlcBasic);
                        const jlcListLine = isJlc ? '<br>JLC PCB Basics list' : '';
                        const jlcPkgLine =
                            meta && meta.packages && meta.packages.length
                                ? `<br>JLC basics sizes: ${meta.packages.join(', ')}`
                                : '';
                        const jlcTolLine =
                            meta && meta.tolerances && meta.tolerances.length
                                ? `<br>JLC catalog tolerance: ${meta.tolerances.map(t => `${t}%`).join(', ')}`
                                : '';
                        const jlcBasicClass = isJlc ? ' jlc-basic' : '';
                        const jlcBasicCaption = isJlc
                            ? '<span class="jlc-basic-caption">JLC Basics</span>'
                            : '';
                        const debugInfo = (globalThis?.DEBUG_RESISTOR_FINDER && conv.debug)
                            ? `<br>Input: ${conv.input}<br>Std: ${conv.debug.standardSeries ?? '—'} | Tol: ${conv.debug.toleranceSeries ?? '—'} | Snap: ${conv.debug.snapped ? 'yes' : 'no'}<br>Value: ${conv.debug.parsedValueBeforeSnap ?? '—'} → ${conv.debug.parsedValueAfterSnap ?? '—'}`
                            : '';
                        return `
                        <div class="parsed-value-box${jlcBasicClass} ${conv.active !== false ? 'active' : 'disabled'} ${conv.series ? 'series-' + conv.series.toLowerCase() : 'series-none'}"
                             data-id="${conv.id}"
                             data-value="${conv.value}"
                             data-input="${conv.input}"
                             data-series="${conv.series || ''}"
                             data-key="${conv.key || ''}"
                             data-index="${index}"
                             onclick="${onClickHandler}(this).catch(console.error)">
                            <div class="parsed-value-box-content">
                                <span class="formatted">${conv.formatted}</span>
                                ${jlcBasicCaption}
                            </div>
                            <span class="box-tooltip">${conv.value} Ω<br>${seriesLabel}<br>Tolerance: ${toleranceValue}${powerLine}${jlcListLine}${jlcPkgLine}${jlcTolLine}${debugInfo}</span>
                        </div>
                    `;
                    }).join('')}
                </div>
            </div>`;
    };
})();
