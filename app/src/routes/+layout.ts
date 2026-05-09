import { base } from '$app/paths';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ url }) => {
	let pathname = url.pathname;
	if (base && pathname.startsWith(base)) {
		pathname = pathname.slice(base.length) || '/';
	}

	let mode: 'voltage-divider' | 'interactive-divider' | 'balanced-attenuator' | 'target-resistance' =
		'voltage-divider';

	if (pathname.startsWith('/interactive-divider')) {
		mode = 'interactive-divider';
	} else if (pathname.startsWith('/balanced-attenuator')) {
		mode = 'balanced-attenuator';
	} else if (pathname.startsWith('/target-resistance')) {
		mode = 'target-resistance';
	}

	return { mode };
};
