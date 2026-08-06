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

function readStoredTheme(): 'light' | 'dark' {
	if (!browser) return 'light';
	return localStorage.getItem('rf-app-theme') === 'dark' ? 'dark' : 'light';
}

function applyThemeToDocument(theme: 'light' | 'dark') {
	if (!browser) return;
	document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}

export const appTheme = writable<'light' | 'dark'>(readStoredTheme());

if (browser) {
	appTheme.subscribe((theme) => {
		localStorage.setItem('rf-app-theme', theme);
		applyThemeToDocument(theme);
	});
}
