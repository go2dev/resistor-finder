/**
 * ZoomableRangeFilter — two-handle range over a zoomable view (D3 zoom + histogram + noUiSlider).
 * Expects globals `noUiSlider` and `d3`.
 */
(function (global) {
    'use strict';

    function clamp(v, lo, hi) {
        return Math.min(hi, Math.max(lo, v));
    }

    function niceStep(span, targetSteps) {
        if (!Number.isFinite(span) || span <= 0) return 1;
        const raw = span / targetSteps;
        const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
        const residual = raw / magnitude;
        if (residual >= 5) return 5 * magnitude;
        if (residual >= 2) return 2 * magnitude;
        return magnitude;
    }

    function stepForView(viewMin, viewMax, targetSteps) {
        const span = viewMax - viewMin;
        if (!Number.isFinite(span) || span <= 0) {
            return 1;
        }
        const rounded = Math.round(niceStep(span, targetSteps || 200));
        if (!Number.isFinite(rounded) || rounded <= 0) {
            return 1;
        }
        return Math.max(1, rounded);
    }

    function constrainViewDomain(viewMin, viewMax, fullMin, fullMax, minViewSpan) {
        const fullSpan = fullMax - fullMin;
        let span = viewMax - viewMin;

        if (span < minViewSpan) {
            const mid = (viewMin + viewMax) / 2;
            viewMin = mid - minViewSpan / 2;
            viewMax = mid + minViewSpan / 2;
            span = minViewSpan;
        }

        if (span >= fullSpan) {
            return { viewMin: fullMin, viewMax: fullMax };
        }

        if (viewMin < fullMin) {
            viewMin = fullMin;
            viewMax = fullMin + span;
        }

        if (viewMax > fullMax) {
            viewMax = fullMax;
            viewMin = fullMax - span;
        }

        return { viewMin, viewMax };
    }

    function initialViewForFilter(fullMin, fullMax, filterMin, filterMax, minViewSpan) {
        const fullSpan = fullMax - fullMin;
        const filterSpan = Math.max(filterMax - filterMin, fullSpan * 0.01);
        const padding = filterSpan * 0.5;
        return constrainViewDomain(
            filterMin - padding,
            filterMax + padding,
            fullMin,
            fullMax,
            minViewSpan
        );
    }

    function deriveFullDomain(values, fullMin, fullMax) {
        const valid = values.filter(Number.isFinite);
        let fMin = fullMin;
        let fMax = fullMax;
        if (fMin == null || fMax == null) {
            if (valid.length === 0) {
                return { fullMin: 0, fullMax: 1 };
            }
            fMin = Math.min(...valid);
            fMax = Math.max(...valid);
        }
        if (fMin === fMax) {
            fMin -= 1;
            fMax += 1;
        }
        return { fullMin: fMin, fullMax: fMax };
    }

    function zoomViewAround(viewMin, viewMax, anchorValue, factor, fullMin, fullMax, minViewSpan) {
        const oldSpan = viewMax - viewMin;
        const newSpan = oldSpan / factor;
        const anchorRatio = oldSpan > 0 ? (anchorValue - viewMin) / oldSpan : 0.5;
        const nextMin = anchorValue - anchorRatio * newSpan;
        const nextMax = nextMin + newSpan;
        return constrainViewDomain(nextMin, nextMax, fullMin, fullMax, minViewSpan);
    }

    function panViewByFraction(viewMin, viewMax, fraction, fullMin, fullMax, minViewSpan) {
        const span = viewMax - viewMin;
        const delta = span * fraction;
        return constrainViewDomain(
            viewMin + delta,
            viewMax + delta,
            fullMin,
            fullMax,
            minViewSpan
        );
    }

    function transformForViewDomain(viewMin, viewMax, fullMin, fullMax, width) {
        const xFull = d3.scaleLinear().domain([fullMin, fullMax]).range([0, width]);
        const fullSpan = fullMax - fullMin;
        const viewSpan = viewMax - viewMin;
        const k = fullSpan / viewSpan;
        const x = -xFull(viewMin) * k;
        return d3.zoomIdentity.translate(x, 0).scale(k);
    }

    function targetBinCount(width) {
        return Math.max(12, Math.min(80, Math.round(width / 12)));
    }

    function selectionOffScreen(filterMin, filterMax, viewMin, viewMax) {
        return filterMax < viewMin || filterMin > viewMax;
    }

    function defaultFormat(n) {
        return String(n);
    }

    function createZoomableRangeFilter(container, options) {
        if (!container) {
            return { destroy() {}, updateFullDomain() {} };
        }
        if (typeof noUiSlider === 'undefined' || typeof d3 === 'undefined') {
            throw new Error('ZoomableRangeFilter requires noUiSlider and d3');
        }

        const {
            results: initialResults = [],
            fullMin: propFullMin,
            fullMax: propFullMax,
            initialFilterMin,
            initialFilterMax,
            initialViewMin,
            initialViewMax,
            minViewSpan: propMinViewSpan,
            formatValue = defaultFormat,
            parseValue,
            showHistogram = true,
            /** When true, a small histogram fixed to the full domain shows where all results sit; the chart below is the zoomed view. */
            showFullRangeOverview = true,
            showRug = true,
            /** When true (default), pan/zoom/fit set filter to the view window; handles then narrow inside that window. */
            syncFilterToViewOnZoom = true,
            /** Debounce onFilterChange during wheel/drag zoom (ms). 0 = fire every frame. */
            filterEmitDebounceMs = 80,
            onFilterChange,
            onViewChange,
            helpTextDesktop = 'Top: all results. Bottom: zoom/pan sets the resistance window; then drag the handles to narrow the filter inside that window.',
            helpTextTouch = 'Top: all results. Bottom: pinch/drag sets the window; use handles to narrow the filter.'
        } = options;

        const parse = parseValue || function (raw) {
            const t = String(raw).trim();
            if (!t) return null;
            const n = Number(t);
            if (Number.isFinite(n)) return n;
            try {
                if (global.ResistorUtils && typeof global.ResistorUtils.parseResistorValue === 'function') {
                    return global.ResistorUtils.parseResistorValue(t);
                }
            } catch (_) {
                return null;
            }
            return null;
        };

        let results = initialResults.slice();
        let destroyed = false;
        let suppressSlider = false;
        let suppressZoom = false;
        let sliderEl = null;
        let sliderApi = null;
        let zoomBehavior = null;
        let zoomLayer = null;
        let svg = null;
        let gBars = null;
        let gRug = null;
        let gAxis = null;
        let overviewSvg = null;
        let gOvBins = null;
        let gOvOverlay = null;
        let gOvAxis = null;
        let xFullScale = null;
        let resizeObs = null;
        let liveDebounce = null;
        let transientTimer = null;
        let filterEmitTimer = null;

        let suppressSyncFilterFromView = false;

        function resetMainChartGraphics() {
            gBars = null;
            gRug = null;
            gAxis = null;
            zoomLayer = null;
            zoomBehavior = null;
            xFullScale = null;
        }

        function resetOverviewGraphics() {
            gOvBins = null;
            gOvOverlay = null;
            gOvAxis = null;
        }

        function ensureOverviewGroups() {
            if (!overviewSvg) return;
            const ov = d3.select(overviewSvg);
            if (!gOvBins || !overviewSvg.contains(gOvBins.node())) {
                ov.selectAll('g').remove();
                resetOverviewGraphics();
                gOvBins = ov.append('g').attr('class', 'zrf-ov-bins');
                gOvOverlay = ov.append('g').attr('class', 'zrf-ov-overlay');
                gOvAxis = ov.append('g').attr('class', 'zrf-ov-axis');
            }
        }

        function ensureMainChartGroups() {
            if (!svg) return;
            const rootSvg = d3.select(svg);
            if (!gBars || !svg.contains(gBars.node())) {
                rootSvg.selectAll('g').remove();
                rootSvg.select('rect.zoom-layer').remove();
                resetMainChartGraphics();
                gBars = rootSvg.append('g').attr('class', 'zrf-bars');
                gRug = rootSvg.append('g').attr('class', 'zrf-rug');
                gAxis = rootSvg.append('g').attr('class', 'zrf-axis');
            }
        }

        let propFullMinRef = propFullMin;
        let propFullMaxRef = propFullMax;

        const values = () => results.map(r => r.value).filter(Number.isFinite);

        let fullMin;
        let fullMax;
        function syncFullFromProps() {
            const d = deriveFullDomain(values(), propFullMinRef, propFullMaxRef);
            fullMin = d.fullMin;
            fullMax = d.fullMax;
        }
        syncFullFromProps();

        const fullSpan = () => fullMax - fullMin;
        let minViewSpan = propMinViewSpan != null
            ? propMinViewSpan
            : Math.max(1, fullSpan() / 1000);

        let filterMin = initialFilterMin != null ? clamp(initialFilterMin, fullMin, fullMax) : fullMin;
        let filterMax = initialFilterMax != null ? clamp(initialFilterMax, fullMin, fullMax) : fullMax;
        if (filterMin > filterMax) {
            const t = filterMin;
            filterMin = filterMax;
            filterMax = t;
        }

        let viewMin;
        let viewMax;
        if (initialViewMin != null && initialViewMax != null) {
            const c = constrainViewDomain(initialViewMin, initialViewMax, fullMin, fullMax, minViewSpan);
            viewMin = c.viewMin;
            viewMax = c.viewMax;
        } else if (initialFilterMin != null || initialFilterMax != null) {
            const iv = initialViewForFilter(fullMin, fullMax, filterMin, filterMax, minViewSpan);
            viewMin = iv.viewMin;
            viewMax = iv.viewMax;
        } else {
            viewMin = fullMin;
            viewMax = fullMax;
        }

        const chartHeight = showHistogram ? 72 : 0;
        const axisPad = 22;
        const overviewBarH = 34;
        const overviewAxisPad = 14;

        container.classList.add('zoom-range-filter');
        container.innerHTML = `
            <section class="zoom-range-filter-inner" tabindex="0" aria-label="Value range filter">
                <header class="range-header">
                    <div class="range-title">Value range</div>
                    <div class="range-count zrf-count"></div>
                </header>
                <div class="range-visible-transient zrf-visible" aria-hidden="true"></div>
                <div class="range-controls">
                    <label class="zrf-input-label">Min
                        <input type="text" class="zrf-filter-min" autocomplete="off" aria-label="Minimum value" />
                    </label>
                    <label class="zrf-input-label">Max
                        <input type="text" class="zrf-filter-max" autocomplete="off" aria-label="Maximum value" />
                    </label>
                    <button type="button" class="zrf-btn zrf-zoom-out" aria-label="Zoom out">−</button>
                    <button type="button" class="zrf-btn zrf-zoom-in" aria-label="Zoom in">+</button>
                    <button type="button" class="zrf-btn zrf-fit">Fit</button>
                </div>
                <div class="zrf-validation" role="alert"></div>
                <div class="zrf-offscreen" hidden>
                    <span class="zrf-offscreen-text">Selected range is outside this view.</span>
                    <button type="button" class="zrf-btn zrf-show-selection">Show selection</button>
                </div>
                <div class="zrf-empty" hidden>No results available</div>
                <div class="zrf-overview-wrap">
                    <div class="zrf-overview-caption">All results (full range)</div>
                    <svg class="zrf-overview-chart" role="img" aria-label="How many results fall in each part of the full value range"></svg>
                </div>
                <div class="range-slider-wrap">
                    <div class="range-slider zrf-noui"></div>
                </div>
                <svg class="range-chart" role="img" aria-label="Zoomed view of the value range under the slider"></svg>
                <div class="range-help zrf-help"></div>
                <div class="sr-only zrf-live" aria-live="polite"></div>
            </section>
        `;

        const root = container.querySelector('.zoom-range-filter-inner');
        const countEl = container.querySelector('.zrf-count');
        const visibleEl = container.querySelector('.zrf-visible');
        const inputMin = container.querySelector('.zrf-filter-min');
        const inputMax = container.querySelector('.zrf-filter-max');
        const validationEl = container.querySelector('.zrf-validation');
        const offscreenEl = container.querySelector('.zrf-offscreen');
        const showSelBtn = container.querySelector('.zrf-show-selection');
        const emptyEl = container.querySelector('.zrf-empty');
        const helpEl = container.querySelector('.zrf-help');
        const liveEl = container.querySelector('.zrf-live');
        const overviewWrap = container.querySelector('.zrf-overview-wrap');
        sliderEl = container.querySelector('.zrf-noui');
        svg = container.querySelector('.range-chart');
        overviewSvg = container.querySelector('.zrf-overview-chart');

        const coarsePointer = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
        helpEl.textContent = coarsePointer ? helpTextTouch : helpTextDesktop;

        function totalResultCount() {
            return results.length;
        }

        function selectedCount() {
            return results.filter(r => r.value >= filterMin && r.value <= filterMax).length;
        }

        function emitFilter(immediate) {
            const run = () => {
                if (destroyed) return;
                const selectedResults = results.filter(
                    r => r.value >= filterMin && r.value <= filterMax
                );
                if (onFilterChange) {
                    onFilterChange({ filterMin, filterMax }, selectedResults);
                }
            };
            const ms = filterEmitDebounceMs;
            if (immediate || !ms || ms <= 0) {
                if (filterEmitTimer) {
                    clearTimeout(filterEmitTimer);
                    filterEmitTimer = null;
                }
                run();
                return;
            }
            if (filterEmitTimer) clearTimeout(filterEmitTimer);
            filterEmitTimer = setTimeout(() => {
                filterEmitTimer = null;
                run();
            }, ms);
        }

        function emitView() {
            if (onViewChange) {
                onViewChange({ viewMin, viewMax });
            }
        }

        function setLiveRegionDebounced() {
            if (liveDebounce) clearTimeout(liveDebounce);
            liveDebounce = setTimeout(() => {
                liveDebounce = null;
                if (destroyed) return;
                const n = totalResultCount();
                const s = selectedCount();
                liveEl.textContent =
                    `Showing ${s} of ${n} results. Selected range ${formatValue(filterMin)} to ${formatValue(filterMax)}. Visible range ${formatValue(viewMin)} to ${formatValue(viewMax)}.`;
            }, 320);
        }

        function showTransientVisible() {
            visibleEl.textContent = `Visible range: ${formatValue(viewMin)} – ${formatValue(viewMax)}`;
            visibleEl.classList.add('is-visible');
            if (transientTimer) clearTimeout(transientTimer);
            transientTimer = setTimeout(() => {
                transientTimer = null;
                if (!destroyed) visibleEl.classList.remove('is-visible');
            }, 1200);
        }

        function applyViewToFilterIfSync() {
            if (!syncFilterToViewOnZoom || suppressSyncFilterFromView || results.length === 0) {
                return;
            }
            let lo = Math.round(viewMin);
            let hi = Math.round(viewMax);
            lo = clamp(lo, fullMin, fullMax);
            hi = clamp(hi, fullMin, fullMax);
            if (lo > hi) {
                const t = lo;
                lo = hi;
                hi = t;
            }
            filterMin = lo;
            filterMax = hi;
            syncInputs();
        }

        function setDisabled(disabled) {
            inputMin.disabled = disabled;
            inputMax.disabled = disabled;
            container.querySelector('.zrf-zoom-in').disabled = disabled;
            container.querySelector('.zrf-zoom-out').disabled = disabled;
            container.querySelector('.zrf-fit').disabled = disabled;
            showSelBtn.disabled = disabled;
            root.toggleAttribute('aria-disabled', disabled);
            if (sliderEl) {
                if (disabled) sliderEl.setAttribute('disabled', '');
                else sliderEl.removeAttribute('disabled');
            }
        }

        function updateCount() {
            const n = totalResultCount();
            if (n === 0) {
                countEl.textContent = '';
                offscreenEl.hidden = true;
                emptyEl.hidden = false;
                setDisabled(true);
                return;
            }
            emptyEl.hidden = true;
            setDisabled(false);
            const s = selectedCount();
            countEl.textContent = `Showing ${s} of ${n} results`;
            offscreenEl.hidden = !selectionOffScreen(filterMin, filterMax, viewMin, viewMax);
            setLiveRegionDebounced();
        }

        function syncInputs() {
            inputMin.value = formatValue(filterMin);
            inputMax.value = formatValue(filterMax);
        }

        function formatPips() {
            const pips = sliderEl.querySelectorAll('.noUi-value');
            pips.forEach(pip => {
                const v = parseFloat(pip.getAttribute('data-value'));
                if (Number.isFinite(v)) {
                    pip.textContent = formatValue(v);
                }
            });
        }

        function createSlider() {
            if (sliderApi) {
                sliderEl.noUiSlider.destroy();
                sliderApi = null;
            }
            if (results.length === 0) {
                return;
            }
            const step = stepForView(viewMin, viewMax);
            try {
                noUiSlider.create(sliderEl, {
                    start: [clamp(filterMin, viewMin, viewMax), clamp(filterMax, viewMin, viewMax)],
                    behaviour: 'tap-drag',
                    connect: true,
                    range: { 'min': viewMin, 'max': viewMax },
                    step,
                    tooltips: false,
                    keyboardSupport: true,
                    format: {
                        to(v) { return Math.round(Number(v)); },
                        from(v) { return Number(v); }
                    },
                    pips: {
                        mode: 'count',
                        values: 5,
                        density: 4
                    }
                });
            } catch (e) {
                validationEl.textContent = e && e.message ? e.message : String(e);
                return;
            }
            sliderApi = sliderEl.noUiSlider;
            formatPips();
            sliderApi.on('update', function (values) {
                if (suppressSlider) return;
                const a = Number(values[0]);
                const b = Number(values[1]);
                filterMin = clamp(Math.round(a), fullMin, fullMax);
                filterMax = clamp(Math.round(b), fullMin, fullMax);
                syncInputs();
                updateCount();
                emitFilter(true);
            });
        }

        function updateSliderFromState() {
            if (!sliderApi || results.length === 0) return;
            suppressSlider = true;
            const step = stepForView(viewMin, viewMax);
            sliderApi.updateOptions({
                range: { 'min': viewMin, 'max': viewMax },
                step
            }, false);
            formatPips();
            const visMin = clamp(filterMin, viewMin, viewMax);
            const visMax = clamp(filterMax, viewMin, viewMax);
            sliderApi.set([visMin, visMax]);
            suppressSlider = false;
        }

        function refreshZoomExtent(width) {
            if (!zoomBehavior || !xFullScale) return;
            const span = fullMax - fullMin;
            const maxZoom = span / minViewSpan;
            zoomBehavior.scaleExtent([1, maxZoom]);
            xFullScale.domain([fullMin, fullMax]).range([0, width]);
            zoomBehavior.translateExtent([[0, 0], [width, chartHeight + axisPad]]);
            zoomBehavior.extent([[0, 0], [width, chartHeight + axisPad]]);
        }

        function drawOverviewFullDomain(width) {
            if (!showHistogram || !showFullRangeOverview || !overviewSvg || !overviewWrap) {
                return;
            }
            if (results.length === 0 || width <= 0) {
                overviewWrap.hidden = true;
                return;
            }
            overviewWrap.hidden = false;
            overviewWrap.style.display = '';

            const hBar = overviewBarH;
            const totalH = overviewBarH + overviewAxisPad;
            overviewSvg.setAttribute('width', width);
            overviewSvg.setAttribute('height', totalH);
            overviewSvg.setAttribute('viewBox', `0 0 ${width} ${totalH}`);

            const xFull = d3.scaleLinear().domain([fullMin, fullMax]).range([0, width]);
            const allVals = results.map(r => r.value).filter(Number.isFinite);
            const nBins = Math.max(16, Math.min(100, Math.round(width / 8)));
            const bins = d3.bin()
                .domain([fullMin, fullMax])
                .thresholds(nBins)(allVals);
            const maxLen = d3.max(bins, b => b.length) || 1;
            const y = d3.scaleLinear().domain([0, maxLen]).range([hBar - 6, 2]);

            ensureOverviewGroups();

            gOvBins.selectAll('rect')
                .data(bins)
                .join('rect')
                .attr('class', 'zrf-ov-bin')
                .attr('fill', '#5dade2')
                .attr('opacity', 0.85)
                .attr('x', d => xFull(d.x0))
                .attr('y', d => y(d.length))
                .attr('width', d => Math.max(1, xFull(d.x1) - xFull(d.x0) - 0.5))
                .attr('height', d => hBar - 6 - y(d.length));

            const vx0 = clamp(xFull(viewMin), 0, width);
            const vx1 = clamp(xFull(viewMax), 0, width);
            const fx0 = clamp(xFull(filterMin), 0, width);
            const fx1 = clamp(xFull(filterMax), 0, width);

            gOvOverlay.selectAll('rect.zrf-ov-view').data([0])
                .join('rect')
                .attr('class', 'zrf-ov-view')
                .attr('x', Math.min(vx0, vx1))
                .attr('y', 1)
                .attr('width', Math.max(2, Math.abs(vx1 - vx0)))
                .attr('height', hBar - 8)
                .attr('fill', 'rgba(52, 152, 219, 0.18)')
                .attr('stroke', 'rgba(52, 152, 219, 0.55)')
                .attr('stroke-width', 1)
                .attr('pointer-events', 'none');

            gOvOverlay.selectAll('rect.zrf-ov-filter').data([0])
                .join('rect')
                .attr('class', 'zrf-ov-filter')
                .attr('x', Math.min(fx0, fx1))
                .attr('y', 2)
                .attr('width', Math.max(2, Math.abs(fx1 - fx0)))
                .attr('height', hBar - 10)
                .attr('fill', 'none')
                .attr('stroke', '#2980b9')
                .attr('stroke-width', 2)
                .attr('pointer-events', 'none');

            const axis = d3.axisBottom(xFull)
                .ticks(Math.min(5, Math.max(2, Math.floor(width / 100))))
                .tickFormat(d => formatValue(d));
            gOvAxis.attr('transform', `translate(0, ${hBar})`).call(axis);
        }

        function drawChart(width) {
            if (!showHistogram || width <= 0) {
                svg.style.display = 'none';
                return;
            }
            if (results.length === 0) {
                svg.style.display = 'none';
                return;
            }
            svg.style.display = '';

            const h = chartHeight;
            svg.setAttribute('width', width);
            svg.setAttribute('height', h + axisPad);
            svg.setAttribute('viewBox', `0 0 ${width} ${h + axisPad}`);

            const xView = d3.scaleLinear().domain([viewMin, viewMax]).range([0, width]);
            const visible = results.filter(
                r => r.value >= viewMin && r.value <= viewMax && Number.isFinite(r.value)
            );
            const vals = visible.map(r => r.value);
            const nBins = targetBinCount(width);
            const binGen = d3.bin()
                .domain([viewMin, viewMax])
                .thresholds(nBins);
            const bins = binGen(vals);
            const maxLen = d3.max(bins, b => b.length) || 1;
            const y = d3.scaleLinear().domain([0, maxLen]).range([h - 4, 4]);

            ensureMainChartGroups();

            gBars.selectAll('rect')
                .data(bins)
                .join('rect')
                .attr('fill', '#3498db')
                .attr('opacity', 0.75)
                .attr('x', d => xView(d.x0))
                .attr('y', d => y(d.length))
                .attr('width', d => Math.max(1, xView(d.x1) - xView(d.x0) - 1))
                .attr('height', d => h - 4 - y(d.length));

            const showRugMarks = showRug && visible.length <= 300 && results.length <= 5000;
            gRug.selectAll('line')
                .data(showRugMarks ? visible : [], d => d.id)
                .join('line')
                .attr('stroke', '#555')
                .attr('stroke-width', 1)
                .attr('opacity', 0.35)
                .attr('x1', d => xView(d.value))
                .attr('x2', d => xView(d.value))
                .attr('y1', 0)
                .attr('y2', 8);

            const axis = d3.axisBottom(xView)
                .ticks(Math.min(6, Math.max(2, Math.floor(width / 90))))
                .tickFormat(d => formatValue(d));
            gAxis.attr('transform', `translate(0, ${h})`).call(axis);

            if (!zoomLayer) {
                const rootSvg = d3.select(svg);
                zoomLayer = rootSvg.append('rect')
                    .attr('class', 'zoom-layer')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('height', h + axisPad)
                    .style('fill', 'transparent')
                    .node();

                xFullScale = d3.scaleLinear().domain([fullMin, fullMax]).range([0, width]);

                zoomBehavior = d3.zoom()
                    .scaleExtent([1, (fullMax - fullMin) / minViewSpan])
                    .translateExtent([[0, 0], [width, h + axisPad]])
                    .extent([[0, 0], [width, h + axisPad]])
                    .on('zoom', (event) => {
                        if (suppressZoom || destroyed) return;
                        const xs = event.transform.rescaleX(xFullScale);
                        const rawMin = xs.domain()[0];
                        const rawMax = xs.domain()[1];
                        const next = constrainViewDomain(rawMin, rawMax, fullMin, fullMax, minViewSpan);
                        if (next.viewMin !== viewMin || next.viewMax !== viewMax) {
                            viewMin = next.viewMin;
                            viewMax = next.viewMax;
                            applyViewToFilterIfSync();
                            updateSliderFromState();
                            drawChart(width);
                            showTransientVisible();
                            emitView();
                            updateCount();
                            if (syncFilterToViewOnZoom) {
                                emitFilter();
                            }
                        }
                    });

                d3.select(zoomLayer).call(zoomBehavior);
            }

            refreshZoomExtent(width);
            d3.select(zoomLayer).attr('width', width);
            suppressZoom = true;
            d3.select(zoomLayer).call(zoomBehavior.transform, transformForViewDomain(viewMin, viewMax, fullMin, fullMax, width));
            suppressZoom = false;

            drawOverviewFullDomain(width);
        }

        function layout() {
            const w = container.clientWidth || container.parentElement?.clientWidth || 400;
            const width = Math.max(200, Math.floor(w));
            if (showHistogram && results.length > 0) {
                drawOverviewFullDomain(width);
                drawChart(width);
            } else if (zoomLayer) {
                d3.select(zoomLayer).attr('width', width);
            }
            if (showHistogram && showFullRangeOverview && results.length === 0 && overviewWrap) {
                overviewWrap.hidden = true;
                overviewWrap.style.display = 'none';
            }
            updateCount();
        }

        function syncD3TransformToView() {
            if (!zoomLayer || !zoomBehavior || !showHistogram || results.length === 0) return;
            const w = parseFloat(svg.getAttribute('width')) || container.clientWidth || 400;
            refreshZoomExtent(w);
            suppressZoom = true;
            d3.select(zoomLayer).call(zoomBehavior.transform, transformForViewDomain(viewMin, viewMax, fullMin, fullMax, w));
            suppressZoom = false;
        }

        function zoomIn() {
            if (results.length === 0) return;
            const c = zoomViewAround(viewMin, viewMax, (viewMin + viewMax) / 2, 2, fullMin, fullMax, minViewSpan);
            viewMin = c.viewMin;
            viewMax = c.viewMax;
            applyViewToFilterIfSync();
            updateSliderFromState();
            layout();
            syncD3TransformToView();
            emitView();
            showTransientVisible();
            if (syncFilterToViewOnZoom) {
                emitFilter(true);
            }
        }

        function zoomOut() {
            if (results.length === 0) return;
            const c = zoomViewAround(viewMin, viewMax, (viewMin + viewMax) / 2, 0.5, fullMin, fullMax, minViewSpan);
            viewMin = c.viewMin;
            viewMax = c.viewMax;
            applyViewToFilterIfSync();
            updateSliderFromState();
            layout();
            syncD3TransformToView();
            emitView();
            showTransientVisible();
            if (syncFilterToViewOnZoom) {
                emitFilter(true);
            }
        }

        function fitAll() {
            if (results.length === 0) return;
            viewMin = fullMin;
            viewMax = fullMax;
            applyViewToFilterIfSync();
            updateSliderFromState();
            layout();
            syncD3TransformToView();
            emitView();
            showTransientVisible();
            if (syncFilterToViewOnZoom) {
                emitFilter(true);
            }
        }

        function showSelection() {
            if (results.length === 0) return;
            suppressSyncFilterFromView = true;
            const filterSpan = Math.max(filterMax - filterMin, minViewSpan);
            const padding = filterSpan * 0.5;
            const next = constrainViewDomain(
                filterMin - padding,
                filterMax + padding,
                fullMin,
                fullMax,
                minViewSpan
            );
            viewMin = next.viewMin;
            viewMax = next.viewMax;
            updateSliderFromState();
            layout();
            syncD3TransformToView();
            emitView();
            showTransientVisible();
            suppressSyncFilterFromView = false;
        }

        function commitFilterInputs() {
            if (results.length === 0) return;
            const a = parse(inputMin.value);
            const b = parse(inputMax.value);
            if (a == null || b == null) {
                validationEl.textContent = 'Enter valid values.';
                return;
            }
            let lo = clamp(a, fullMin, fullMax);
            let hi = clamp(b, fullMin, fullMax);
            lo = Math.round(lo);
            hi = Math.round(hi);
            if (lo > hi) {
                validationEl.textContent = 'Minimum cannot be greater than maximum.';
                return;
            }
            validationEl.textContent = '';
            filterMin = lo;
            filterMax = hi;
            if (sliderApi) {
                suppressSlider = true;
                const step = stepForView(viewMin, viewMax);
                sliderApi.updateOptions({ range: { 'min': viewMin, 'max': viewMax }, step }, false);
                formatPips();
                sliderApi.set([clamp(filterMin, viewMin, viewMax), clamp(filterMax, viewMin, viewMax)]);
                suppressSlider = false;
            }
            if (filterMin < viewMin || filterMax > viewMax) {
                showSelection();
            } else {
                updateSliderFromState();
            }
            syncInputs();
            updateCount();
            emitFilter(true);
        }

        function updateFullDomain(newResults, opts = {}) {
            const { forceReset = false, fullMin: fm, fullMax: fx } = opts;
            const prevFullMin = fullMin;
            const prevFullMax = fullMax;
            results = (newResults || []).slice();
            if (fm != null) propFullMinRef = fm;
            if (fx != null) propFullMaxRef = fx;
            syncFullFromProps();
            minViewSpan = propMinViewSpan != null
                ? propMinViewSpan
                : Math.max(1, fullSpan() / 1000);

            const fullDomainChanged =
                Math.abs(prevFullMin - fullMin) > 0.01 ||
                Math.abs(prevFullMax - fullMax) > 0.01;

            if (results.length === 0) {
                if (sliderApi) {
                    sliderEl.noUiSlider.destroy();
                    sliderApi = null;
                }
                resetMainChartGraphics();
                resetOverviewGraphics();
                if (svg) {
                    svg.innerHTML = '';
                }
                if (overviewSvg) {
                    overviewSvg.innerHTML = '';
                }
                if (overviewWrap) {
                    overviewWrap.hidden = true;
                    overviewWrap.style.display = 'none';
                }
                updateCount();
                emitFilter(true);
                return;
            }

            const rangeChanged = forceReset || fullDomainChanged;

            if (forceReset || rangeChanged) {
                filterMin = fullMin;
                filterMax = fullMax;
                viewMin = fullMin;
                viewMax = fullMax;
            } else {
                filterMin = clamp(filterMin, fullMin, fullMax);
                filterMax = clamp(filterMax, fullMin, fullMax);
                if (filterMin > filterMax) {
                    filterMin = fullMin;
                    filterMax = fullMax;
                }
                const v = constrainViewDomain(viewMin, viewMax, fullMin, fullMax, minViewSpan);
                viewMin = v.viewMin;
                viewMax = v.viewMax;
            }

            if (!sliderApi) {
                createSlider();
            } else {
                updateSliderFromState();
            }
            syncInputs();
            layout();
            syncD3TransformToView();
            updateCount();
            emitFilter(true);
        }

        container.querySelector('.zrf-zoom-in').addEventListener('click', zoomIn);
        container.querySelector('.zrf-zoom-out').addEventListener('click', zoomOut);
        container.querySelector('.zrf-fit').addEventListener('click', fitAll);
        showSelBtn.addEventListener('click', showSelection);

        function onInputKey(e) {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        }
        inputMin.addEventListener('keydown', onInputKey);
        inputMax.addEventListener('keydown', onInputKey);
        inputMin.addEventListener('blur', () => {
            if (document.activeElement !== inputMax) commitFilterInputs();
        });
        inputMax.addEventListener('blur', commitFilterInputs);

        root.addEventListener('keydown', (e) => {
            if (e.target === inputMin || e.target === inputMax) return;

            let panFrac = 0.1;
            if (e.shiftKey) panFrac = 0.5;
            if (e.altKey) panFrac = 0.01;

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const p = panViewByFraction(viewMin, viewMax, -panFrac, fullMin, fullMax, minViewSpan);
                viewMin = p.viewMin;
                viewMax = p.viewMax;
                applyViewToFilterIfSync();
                updateSliderFromState();
                layout();
                syncD3TransformToView();
                emitView();
                showTransientVisible();
                if (syncFilterToViewOnZoom) {
                    emitFilter(true);
                }
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                const p = panViewByFraction(viewMin, viewMax, panFrac, fullMin, fullMax, minViewSpan);
                viewMin = p.viewMin;
                viewMax = p.viewMax;
                applyViewToFilterIfSync();
                updateSliderFromState();
                layout();
                syncD3TransformToView();
                emitView();
                showTransientVisible();
                if (syncFilterToViewOnZoom) {
                    emitFilter(true);
                }
            } else if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                zoomIn();
            } else if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                zoomOut();
            } else if (e.key === '0') {
                e.preventDefault();
                fitAll();
            }
        });

        createSlider();
        syncInputs();
        resizeObs = new ResizeObserver(() => layout());
        resizeObs.observe(container);
        requestAnimationFrame(layout);

        return {
            destroy() {
                destroyed = true;
                if (resizeObs) resizeObs.disconnect();
                if (transientTimer) clearTimeout(transientTimer);
                if (liveDebounce) clearTimeout(liveDebounce);
                if (filterEmitTimer) clearTimeout(filterEmitTimer);
                if (sliderApi) {
                    sliderEl.noUiSlider.destroy();
                    sliderApi = null;
                }
                container.innerHTML = '';
                container.classList.remove('zoom-range-filter');
            },
            updateFullDomain(newResults, opts) {
                updateFullDomain(newResults, opts);
            },
            getFilterRange() {
                return { min: filterMin, max: filterMax };
            }
        };
    }

    const api = {
        clamp,
        niceStep,
        stepForView,
        constrainViewDomain,
        initialViewForFilter,
        deriveFullDomain,
        zoomViewAround,
        panViewByFraction,
        create: createZoomableRangeFilter
    };

    global.ZoomableRangeFilter = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof window !== 'undefined' ? window : globalThis));
