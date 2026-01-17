(() => {
    const page = document.body?.dataset?.page || '';
    const topNav = document.getElementById('topNav');
    if (topNav) {
        topNav.innerHTML = `
            <div class="top-nav">
                <a href="index.html" class="nav-link ${page === 'voltage-divider' ? 'active' : ''}">Voltage Divider</a>
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
                <div class="inline-option">
                    <div class="theme-switch-wrapper">
                        <label class="theme-switch" for="snapToSeries">
                            <input type="checkbox" id="snapToSeries" />
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
                </div>
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
        pageFooter.innerHTML = `
            <span class="disclaimer">Disclaimer: results are provided without warranty or verification. Use at your own risk!</span>
            <br>
            Made by <a href="https://mynameis.dev" target="_blank">Dev</a> © <a href="https://whatevertogether.net/" target="_blank">Whatever Together</a> 2025
            <br>
            <span class="disclaimer">Source on <a href="https://github.com/go2dev/resistor-finder" target="_blank">GitHub</a></span>
            <br>
            <span class="disclaimer">Version: <span id="appVersion">dev</span></span>
        `;
    }

    window.CommonUI = window.CommonUI || {};
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
                        const powerLabel = conv.powerRating ? `Power code: ${conv.powerCode} (${conv.powerRating}W)` : 'Power code: none';
                        return `
                        <div class="parsed-value-box ${conv.active !== false ? 'active' : 'disabled'} ${conv.series ? 'series-' + conv.series.toLowerCase() : 'series-none'}"
                             data-id="${conv.id}"
                             data-value="${conv.value}"
                             data-input="${conv.input}"
                             data-series="${conv.series || ''}"
                             data-index="${index}"
                             onclick="${onClickHandler}(this).catch(console.error)">
                            <span class="formatted">${conv.formatted}</span>
                            <span class="box-tooltip">${conv.value} Ω<br>${seriesLabel}<br>Tolerance: ${toleranceValue}<br>${powerLabel}</span>
                        </div>
                    `;
                    }).join('')}
                </div>
            </div>`;
    };
})();
