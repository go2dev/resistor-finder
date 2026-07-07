import { describe, expect, it } from 'vitest';

import {
	buildDividerShareQuery,
	buildTargetShareQuery,
	normalizeResistorList,
	parseDividerShareQuery,
	parseTargetShareQuery,
	type DividerShareState
} from './share-url';

const BASE_STATE: DividerShareState = {
	supply: '5',
	target: '3.3',
	resistors: '1k, 2.2k, 10k',
	allowOvershoot: true,
	snapToSeries: false,
	snapSeries: 'E24',
	sortBy: 'error'
};

describe('buildDividerShareQuery', () => {
	it('encodes inputs, omits defaults (owner: state-when-non-default)', () => {
		expect(buildDividerShareQuery(BASE_STATE)).toBe('?vs=5&vt=3.3&r=1k,2.2k,10k');
	});

	it('keeps commas, parens and tolerance brackets human-readable', () => {
		const q = buildDividerShareQuery({ ...BASE_STATE, resistors: '100R(0.1%), 4k7' });
		expect(q).toBe('?vs=5&vt=3.3&r=100R(0.1%25),4k7');
	});

	it('includes non-default sort, overshoot, snap and band', () => {
		const q = buildDividerShareQuery({
			...BASE_STATE,
			allowOvershoot: false,
			snapToSeries: true,
			snapSeries: 'E96',
			sortBy: 'components',
			filterMin: '1000',
			filterMax: '20000'
		});
		expect(q).toBe(
			'?vs=5&vt=3.3&r=1k,2.2k,10k&os=0&snap=E96&sort=parts&rmin=1000&rmax=20000'
		);
	});

	it('accepts numeric supply/target (number inputs bind numbers at runtime)', () => {
		expect(buildDividerShareQuery({ ...BASE_STATE, supply: 3.3, target: 2.76 })).toBe(
			'?vs=3.3&vt=2.76&r=1k,2.2k,10k'
		);
	});

	it('returns an empty string with nothing to encode', () => {
		expect(
			buildDividerShareQuery({ ...BASE_STATE, supply: '', target: ' ', resistors: '' })
		).toBe('');
	});
});

describe('parseDividerShareQuery', () => {
	it('round-trips the full state', () => {
		const state: DividerShareState = {
			...BASE_STATE,
			allowOvershoot: false,
			snapToSeries: true,
			snapSeries: 'E192',
			sortBy: 'totalResistanceDesc',
			filterMin: '470',
			filterMax: '47000'
		};
		const parsed = parseDividerShareQuery(buildDividerShareQuery(state));
		expect(parsed).toEqual({
			supply: '5',
			target: '3.3',
			resistors: '1k, 2.2k, 10k',
			allowOvershoot: false,
			snapToSeries: true,
			snapSeries: 'E192',
			sortBy: 'totalResistanceDesc',
			filterMin: '470',
			filterMax: '47000'
		});
	});

	it('decodes percent-encoded tolerance values', () => {
		const parsed = parseDividerShareQuery('?vs=5&vt=2&r=100R(0.1%25),220R(5%25)');
		expect(parsed.resistors).toBe('100R(0.1%), 220R(5%)');
	});

	it('ignores malformed values instead of guessing', () => {
		const parsed = parseDividerShareQuery('?snap=E37&sort=banana&rmin=5&rmax=abc&os=1');
		expect(parsed).toEqual({});
	});

	it('rejects an inverted band', () => {
		const parsed = parseDividerShareQuery('?rmin=100&rmax=10');
		expect(parsed.filterMin).toBeUndefined();
	});
});

describe('target-resistance share query', () => {
	it('round-trips target inputs', () => {
		const q = buildTargetShareQuery({
			target: '50k',
			resistors: '1k 2.2k, 10k',
			snapToSeries: true,
			snapSeries: 'E48'
		});
		expect(q).toBe('?rt=50k&r=1k,2.2k,10k&snap=E48');
		expect(parseTargetShareQuery(q)).toEqual({
			target: '50k',
			resistors: '1k, 2.2k, 10k',
			snapToSeries: true,
			snapSeries: 'E48'
		});
	});
});

describe('normalizeResistorList', () => {
	it('collapses mixed whitespace/comma separators', () => {
		expect(normalizeResistorList('  1k ,2.2k\t 10k,,')).toBe('1k,2.2k,10k');
	});
});
