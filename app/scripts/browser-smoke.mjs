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
check('target-resistance: diagrams render', (await page.locator('.diagram-surface svg, [id*="diagram"] svg').count()) >= 1);
check('target-resistance: PNG export buttons', (await page.locator('button:has-text("PNG")').count()) >= 1);

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

// 4. Diagram PoC renders.
await page.goto(`${BASE}/diagram-poc`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('svg[role="img"]', { timeout: 15000 });
check('diagram PoC renders', true);

check('no page errors across smoke run', pageErrors.length === 0);
if (pageErrors.length) console.log('page errors:', pageErrors.join('\n'));

await browser.close();
stopPreview();
process.exit(failures.length ? 1 : 0);
