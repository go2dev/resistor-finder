// Headless-browser smoke test for the built app (used for the overhaul
// verification and as a pre-deploy check). Requires the playwright devDep
// and a chromium install (`npx playwright install chromium`).
//
// Usage:  cd app && npm run build && node scripts/browser-smoke.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/app`;

// detached → own process group, so we can kill npx AND the vite child it
// spawns (plain preview.kill() leaves vite holding the port for the next run)
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
	cwd: new URL('..', import.meta.url).pathname,
	stdio: 'pipe',
	detached: true
});
const stopPreview = () => {
	try {
		process.kill(-preview.pid, 'SIGTERM');
	} catch {
		preview.kill();
	}
};
await new Promise((resolve, reject) => {
	preview.stdout.on('data', (d) => d.toString().includes('Local:') && resolve());
	preview.stderr.on('data', (d) => process.stderr.write(d));
	preview.on('exit', (code) => reject(new Error(`preview exited early (${code})`)));
	setTimeout(() => reject(new Error('preview server did not start')), 20000);
});

const failures = [];
const check = (name, ok) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
	if (!ok) failures.push(name);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// 1. Voltage divider: the 1k/5k1 regression case must appear in top 5 with diagrams.
await page.goto(`${BASE}/voltage-divider`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#resistor-values', { timeout: 15000 });
await page.waitForTimeout(1500); // hydration
await page.fill('#resistor-values', '100, 220, 470, 1k, 2.2k, 3.3k, 4.7k, 5.1k, 10k, 22k, 47k, 100k');
await page.fill('#supply-voltage', '3.3');
await page.fill('#target-voltage', '2.76');
await page.locator('button:has-text("Calculate")').first().click();
await page.waitForTimeout(4000);
const body = (await page.textContent('body')).replace(/\s+/g, ' ');
check('divider: 1k/5k1 two-part answer displayed', /R_TOP:\s*1K\s*=\s*1K.*R_BOT:\s*5\.1K/.test(body));
check('divider: result schematics render (engine)', (await page.locator('.diagram-surface svg[role="img"]').count()) >= 1);

// Result-distribution histogram (Svelte-native, log-x) over the full raw match set.
const histSvg = page.locator('svg[aria-label="Distribution of matches across the total-resistance range"]');
check('divider: distribution histogram renders with bars', (await histSvg.locator('rect').count()) >= 5);

// Zoomable filter (Svelte-native): wheel zoom narrows the band (filter follows view).
const filterMinBefore = Number(await page.inputValue('#vd-filter-min'));
const filterMaxBefore = Number(await page.inputValue('#vd-filter-max'));
await page.locator('.rrf-zone').hover();
await page.mouse.wheel(0, -600);
await page.waitForTimeout(400);
const zoomedMin = Number(await page.inputValue('#vd-filter-min'));
const zoomedMax = Number(await page.inputValue('#vd-filter-max'));
check(
	'filter: wheel zoom narrows the resistance band',
	zoomedMin > filterMinBefore && zoomedMax < filterMaxBefore
);

// Fit data restores the full band exactly (no rounding loss at the edges).
await page.locator('button:has-text("Fit data")').click();
await page.waitForTimeout(200);
check(
	'filter: Fit data restores the full band',
	Number(await page.inputValue('#vd-filter-min')) === filterMinBefore &&
		Number(await page.inputValue('#vd-filter-max')) === filterMaxBefore
);

// Keyboard-accessible handles: ArrowRight on the min handle raises the minimum.
await page.locator('[data-rrf-handle="min"]').focus();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
check(
	'filter: min handle responds to arrow keys',
	Number(await page.inputValue('#vd-filter-min')) > filterMinBefore
);
await page.locator('button:has-text("Fit data")').click();
await page.waitForTimeout(200);

// Engine per-part tooltip: hover the first resistor in the first card.
await page.locator('.diagram-surface svg [role="button"]').first().hover();
check('divider: per-part V/I/P tooltip on hover', (await page.locator('text=/V across:/').count()) >= 1);

// PNG export must produce an actual non-trivial download.
const [download] = await Promise.all([
	page.waitForEvent('download', { timeout: 10000 }),
	page.locator('button:has-text("Download diagram PNG")').first().click()
]);
const pngPath = await download.path();
const pngSize = pngPath ? (await import('node:fs')).statSync(pngPath).size : 0;
check(
	'divider: PNG export downloads a real file',
	download.suggestedFilename().endsWith('.png') && pngSize > 5000
);

// PDF export: real download, %PDF header, key-figure text embedded.
const [pdfDownload] = await Promise.all([
	page.waitForEvent('download', { timeout: 15000 }),
	page.locator('button:has-text("Download result PDF")').first().click()
]);
const pdfPath = await pdfDownload.path();
const fsMod = await import('node:fs');
const pdfBytes = pdfPath ? fsMod.readFileSync(pdfPath) : Buffer.alloc(0);
// Content streams are flate-compressed — inflate to assert the figures text.
const { inflateSync } = await import('node:zlib');
let pdfText = '';
for (let cursor = 0; ; ) {
	const start = pdfBytes.indexOf('stream', cursor);
	if (start === -1) break;
	const dataStart = pdfBytes.indexOf('\n', start) + 1;
	const end = pdfBytes.indexOf('endstream', dataStart);
	if (end === -1) break;
	try {
		pdfText += inflateSync(pdfBytes.subarray(dataStart, end)).toString('latin1');
	} catch {
		/* embedded image stream — skip */
	}
	cursor = end + 9;
}
// Show-text operands are hex-encoded (<...> Tj) — decode them.
pdfText = pdfText.replace(/<([0-9A-Fa-f]+)>/g, (m, h) => Buffer.from(h, 'hex').toString('latin1'));
check(
	'divider: PDF export downloads a real single-result PDF',
	pdfDownload.suggestedFilename().endsWith('.pdf') &&
		pdfBytes.length > 5000 &&
		pdfBytes.subarray(0, 5).toString() === '%PDF-' &&
		pdfText.includes('Voltage Divider Result') &&
		pdfText.includes('resistordivider.com')
);

// Deep links (docs/url-schema.md): the URL mirrors the inputs after the debounce…
await page.waitForTimeout(700);
check(
	'divider: URL carries shareable state (vs/vt/r)',
	/voltage-divider\?(?=.*vs=3\.3)(?=.*vt=2\.76)(?=.*r=100,220)/.test(page.url())
);
check('divider: Copy link affordance present', (await page.locator('button:has-text("Copy link")').count()) === 1);

// …and loading a deep link reproduces the calculation (incl. non-default sort).
await page.goto(`${BASE}/voltage-divider?vs=3.3&vt=2.76&r=1k,5.1k,10k&sort=parts`, {
	waitUntil: 'domcontentloaded'
});
await page.waitForSelector('#resistor-values', { timeout: 15000 });
await page.waitForTimeout(4000);
const deepBody = (await page.textContent('body')).replace(/\s+/g, ' ');
check(
	'divider: deep link reproduces the calculation',
	(await page.inputValue('#supply-voltage')) === '3.3' &&
		/R_TOP:\s*1K\s*=\s*1K.*R_BOT:\s*5\.1K/.test(deepBody) &&
		(await page.locator('#sort-by').inputValue()) === 'components'
);

// Target-resistance deep link: rt + r reproduce a calculation on load.
await page.goto(`${BASE}/target-resistance?rt=50k&r=22k,47k,100k`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#tr-values', { timeout: 15000 });
await page.waitForTimeout(3500);
check(
	'target-resistance: deep link reproduces the calculation',
	(await page.inputValue('#tr-values')).includes('22k') &&
		(await page.locator('.diagram-surface svg[role="img"]').count()) >= 1
);

// Parity polish: >20% error flag + watts line in the power-code chip tooltip.
await page.goto(`${BASE}/target-resistance?rt=1&r=100k,EB1041`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#tr-values', { timeout: 15000 });
await page.waitForTimeout(3000);
check('target-resistance: high-error flag on >20% results', (await page.locator('text=High error').count()) >= 1);
check(
	'target-resistance: chip tooltip shows power-code watts',
	(await page.locator('text=/Power code: EB \\(0\\.5W\\)/').count()) >= 1
);

// 1b. Interactive divider: engine render + full edit flow.
await page.goto(`${BASE}/interactive-divider`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#interactiveDividerDiagram svg[role="img"]', { timeout: 15000 });
await page.waitForTimeout(1000);
const iresults = () => page.textContent('#interactiveDividerResults');
check('interactive: default 10k/10k → Vout 2.500 V', /2\.500 V/.test(await iresults()));

const partSel = '#interactiveDividerDiagram svg [role="button"][aria-label*="volts across"]';
await page.locator(partSel).first().hover();
check(
	'interactive: resistor tooltip shows series/tolerance + V/I/P',
	(await page.locator('text=/Tolerance:/').count()) >= 1 &&
		(await page.locator('text=/V across:/').count()) >= 1
);

// tap → dialog → apply a new value
await page.locator(partSel).first().click();
await page.waitForSelector('#interactiveResistorDialog:not([hidden])', { timeout: 5000 });
await page.fill('#interactiveResistorInput', '4k7');
await page.click('#interactiveDialogApply');
await page.waitForTimeout(300);
check('interactive: edit dialog updates the tree', /4\.7K/.test(await iresults()));

// insert-series strip adds a third resistor
await page.locator('#interactiveDividerDiagram svg .engine-strip').first().click();
await page.waitForTimeout(300);
check('interactive: series strip inserts a part', (await page.locator(partSel).count()) === 3);

// add-parallel via dialog creates a bus with a hover target
await page.locator(partSel).first().click();
await page.waitForSelector('#interactiveResistorDialog:not([hidden])', { timeout: 5000 });
await page.click('#interactiveDialogParallel');
await page.waitForTimeout(300);
check(
	'interactive: add parallel creates bus hover targets',
	(await page.locator('#interactiveDividerDiagram svg .engine-bus-hit').count()) === 2
);
await page.locator('#interactiveDividerDiagram svg .engine-bus-hit').first().hover();
check('interactive: bus tooltip shows group equivalent', (await page.locator('text=/Parallel group:/').count()) >= 1);

// 2. Target resistance: results, diagrams, PNG buttons.
await page.goto(`${BASE}/target-resistance`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.locator('input').first().fill('100, 1k, 4.7k, 10k, 47k, 100k');
await page.locator('#tr-target').fill('50k');
await page.locator('button:has-text("Find closest matches")').click();
await page.waitForTimeout(4000);
check('target-resistance: engine diagrams render', (await page.locator('.diagram-surface svg[role="img"]').count()) >= 1);
await page.locator('.diagram-surface svg [role="button"]').first().hover();
check(
	'target-resistance: per-part tooltip',
	(await page.locator('.diagram-surface .pointer-events-none.absolute').count()) >= 1
);
const [trDownload] = await Promise.all([
	page.waitForEvent('download', { timeout: 10000 }),
	page.locator('button:has-text("Download diagram PNG")').first().click()
]);
check('target-resistance: PNG export downloads', trDownload.suggestedFilename().startsWith('target-'));

// 3. Theme: dark applies on a legacy-injected page (script.js must not clobber it).
await page.goto(`${BASE}/balanced-attenuator`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('rf-app-theme', 'dark'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
check('dark theme survives legacy script injection', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');

// 3b. Attenuator result diagrams render via the engine shim; PNG download works.
await page.fill('#resistorValues', '100, 220, 470, 1k, 2.2k, 4.7k, 10k, 22k, 47k');
await page.click('#calculateBtn');
await page.waitForSelector('.result-diagram svg[role="img"]', { timeout: 25000 });
check('attenuator: engine diagrams in result cards', true);
check(
	'attenuator: U-pad caption present',
	/U-pad \(symmetric/.test((await page.locator('.result-diagram').first().textContent()) || '')
);
await page.locator('.result-diagram svg [role="button"]').first().hover();
check('attenuator: per-part tooltip', (await page.locator('text=/V across:/').count()) >= 1);
const [attenDownload] = await Promise.all([
	page.waitForEvent('download', { timeout: 10000 }),
	page.locator('.diagram-download-btn').first().click()
]);
check('attenuator: PNG download works', attenDownload.suggestedFilename().endsWith('.png'));

// Help bubbles restored (legacy parity): header + overshoot + filter "?" affordances.
check('attenuator: help bubbles present', (await page.locator('[data-help-bubble]').count()) >= 3);
await page.locator('[data-help-bubble][aria-label="About this calculator"]').hover();
check(
	'attenuator: header help bubble opens with docs link',
	(await page.locator('text=View documentation').count()) >= 1
);

// Docs route renders the README in-app (parity item P2).
await page.goto(`${BASE}/docs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.readme-content', { timeout: 15000 });
check(
	'docs: README renders in-app with nav link',
	/Voltage Divider Resistor Calculator/.test(await page.textContent('.readme-content')) &&
		(await page.locator('nav a:has-text("Docs")').count()) === 1
);

// 4. Diagram PoC renders.
await page.goto(`${BASE}/diagram-poc`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('svg[role="img"]', { timeout: 15000 });
check('diagram PoC renders', true);

check('no page errors across smoke run', pageErrors.length === 0);
if (pageErrors.length) console.log('page errors:', pageErrors.join('\n'));

await browser.close();
stopPreview();
process.exit(failures.length ? 1 : 0);
