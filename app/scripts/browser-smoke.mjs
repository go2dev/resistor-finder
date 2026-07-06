// Headless-browser smoke test for the built app (used for the overhaul
// verification and as a pre-deploy check). Requires the playwright devDep
// and a chromium install (`npx playwright install chromium`).
//
// Usage:  cd app && npm run build && node scripts/browser-smoke.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/app`;

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
	cwd: new URL('..', import.meta.url).pathname,
	stdio: 'pipe'
});
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
check('divider: result schematics render', (await page.locator('.diagram-surface svg').count()) >= 1);

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

// 4. Diagram PoC renders.
await page.goto(`${BASE}/diagram-poc`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('svg[role="img"]', { timeout: 15000 });
check('diagram PoC renders', true);

check('no page errors across smoke run', pageErrors.length === 0);
if (pageErrors.length) console.log('page errors:', pageErrors.join('\n'));

await browser.close();
preview.kill();
process.exit(failures.length ? 1 : 0);
