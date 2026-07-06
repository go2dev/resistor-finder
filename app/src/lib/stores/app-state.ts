import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type AppMode = 'voltage-divider' | 'interactive-divider' | 'balanced-attenuator' | 'target-resistance';

const initialMode: AppMode = 'voltage-divider';

export const currentMode = writable<AppMode>(initialMode);

export const modeRoutes: Record<AppMode, string> = {
	'voltage-divider': '/voltage-divider',
	'interactive-divider': '/interactive-divider',
	'balanced-attenuator': '/balanced-attenuator',
	'target-resistance': '/target-resistance'
};

export const modeLabels: Record<AppMode, string> = {
	'voltage-divider': 'Voltage Divider',
	'interactive-divider': 'Interactive Divider',
	'balanced-attenuator': 'Balanced Attenuator',
	'target-resistance': 'Target Resistance'
};

export function setMode(mode: AppMode) {
	currentMode.set(mode);
}

type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'rf-app-theme';

function readStoredTheme(): Theme | null {
	if (!browser) return null;
	const stored = localStorage.getItem(THEME_STORAGE_KEY);
	return stored === 'dark' || stored === 'light' ? stored : null;
}

function systemTheme(): Theme {
	if (!browser) return 'light';
	return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeToDocument(theme: Theme) {
	if (!browser) return;
	document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}

/** Follows the system preference until the user explicitly picks a theme. */
export const appTheme = writable<Theme>(readStoredTheme() ?? systemTheme());

/** Explicit user choice — persisted, stops following the system preference. */
export function setTheme(theme: Theme) {
	if (browser) localStorage.setItem(THEME_STORAGE_KEY, theme);
	appTheme.set(theme);
}

export function toggleTheme() {
	appTheme.update((current) => {
		const next: Theme = current === 'dark' ? 'light' : 'dark';
		if (browser) localStorage.setItem(THEME_STORAGE_KEY, next);
		return next;
	});
}

/**
 * Re-apply the app's current theme to the document. Legacy scripts injected on
 * the balanced-attenuator / interactive-divider routes run their own
 * initializeTheme() (legacy 'theme' localStorage key) and overwrite
 * data-theme; call this after they boot so the app store stays authoritative.
 */
export function reassertTheme() {
	if (!browser) return;
	appTheme.update((current) => {
		applyThemeToDocument(current);
		return current;
	});
}

if (browser) {
	appTheme.subscribe(applyThemeToDocument);
	window
		.matchMedia?.('(prefers-color-scheme: dark)')
		.addEventListener('change', (event) => {
			if (!readStoredTheme()) appTheme.set(event.matches ? 'dark' : 'light');
		});
}
