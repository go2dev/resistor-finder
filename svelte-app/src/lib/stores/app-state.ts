import { writable } from 'svelte/store';

export type AppMode = 'voltage-divider' | 'interactive-divider' | 'balanced-attenuator' | 'target-resistance';

const initialMode: AppMode = 'voltage-divider';

export const currentMode = writable<AppMode>(initialMode);
export const appTheme = writable<'light' | 'dark'>('light');

export const modeRoutes: Record<AppMode, string> = {
	'voltage-divider': '/',
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
