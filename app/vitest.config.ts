import { defineConfig } from 'vitest/config';

// Domain-level unit tests only (pure TS under src/lib/domain and src/lib/services).
// Kept separate from vite.config.ts so tests run without the SvelteKit plugin.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
