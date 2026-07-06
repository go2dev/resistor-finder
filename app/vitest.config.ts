import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Domain-level unit tests only (pure TS under src/lib/domain, src/lib/services
// and src/lib/diagram). Kept separate from vite.config.ts so tests run without
// the SvelteKit plugin; $lib resolves manually for the same reason.
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
