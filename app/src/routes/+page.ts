import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

// The app has no landing page of its own — the bare base route sends the user
// to the voltage-divider tool. This must live in a load function (a redirect
// thrown from a component script surfaces as an uncaught promise) and must
// carry the `base` prefix (`/app`), or it lands on the origin root.
export const load = () => {
	redirect(307, `${base}/voltage-divider`);
};
