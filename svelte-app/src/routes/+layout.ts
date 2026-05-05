import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ url }) => {
	const pathname = url.pathname;
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
