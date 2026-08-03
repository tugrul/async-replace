import { replace } from '.';

const echo = async (match: string) => match;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('exact match', () => {
    const pattern = /(\w)o+(\w)/g;
    test.each([
        ['job came boom'],
        ['zang job came boom'],
        ['job came boom zing'],
        ['zing job came boom zang'],
    ])('leaves %p untouched', async (text) => {
        expect(await replace(text, pattern, echo)).toBe(text);
    });
});

describe('swapped chars', () => {
    const pattern = /(\w)o+(\w)/g;
    const swap = async (_match: string, [begin = '', end = '']: (string | undefined)[]) => end + 'a' + begin;
    test.each([
        ['job came boom', 'baj came mab'],
        ['zang job came boom', 'zang baj came mab'],
        ['job came boom zing', 'baj came mab zing'],
        ['zing job came boom zang', 'zing baj came mab zang'],
    ])('rewrites %p as %p', async (text, expected) => {
        expect(await replace(text, pattern, swap)).toBe(expected);
    });
});

test('passes the match index', async () => {
    const result = await replace('bagaj', /a/g, async (_match, _groups, index) => index.toString());
    expect(result).toBe('b1g3j');
});

test('passes the original input', async () => {
    const seen: string[] = [];
    await replace('bagaj', /a/g, async (match, _groups, _index, input) => {
        seen.push(input);
        return match;
    });
    expect(seen).toEqual(['bagaj', 'bagaj']);
});

test('limit feature', async () => {
    const text = 'zing zabz miki mabm rabm lolo oabo mofo rofo tabo moz mabo raks kabo';
    expect(await replace(text, /ab/g, echo, 3)).toBe(text);
});

describe('edge cases', () => {
    test('returns the input when nothing matches', async () => {
        expect(await replace('hello world', /z+/g, echo)).toBe('hello world');
    });

    test('handles an empty input', async () => {
        expect(await replace('', /a/g, echo)).toBe('');
    });

    test('replaces a match at the very start and end', async () => {
        expect(await replace('aba', /a/g, async () => 'X')).toBe('XbX');
    });

    // regression: exec() does not advance lastIndex past a zero-width match,
    // so the loop used to spin forever on patterns like /x*/g
    test('terminates on zero-width matches and agrees with String#replace', async () => {
        expect(await replace('abc', /x*/g, async () => '-')).toBe('abc'.replace(/x*/g, '-'));
    });

    test('terminates on lookahead-only patterns', async () => {
        expect(await replace('a1b2', /(?=\d)/g, async () => '.')).toBe('a1b2'.replace(/(?=\d)/g, '.'));
    });

    test('replaces only the first match without the g flag', async () => {
        expect(await replace('a b a', /a/, async () => 'X')).toBe('X b a');
    });

    test('handles a sticky regex', async () => {
        expect(await replace('aab', /a/y, async () => 'X')).toBe('Xab');
    });

    // regression: non-participating groups are undefined, not string
    test('reports non-participating groups as undefined', async () => {
        const groups: (string | undefined)[][] = [];
        await replace('b', /(a)|(b)/g, async (match, g) => {
            groups.push(g);
            return match;
        });
        expect(groups).toEqual([[undefined, 'b']]);
    });
});

// regression: matching used to run on the caller's RegExp, advancing its
// lastIndex. A run that ends normally hides this (a failed exec resets
// lastIndex to 0) but anything that leaves the loop early does not.
describe('regex state', () => {
    test('leaves lastIndex alone', async () => {
        const pattern = /a/g;
        await replace('aaa', pattern, async () => 'X');
        expect(pattern.lastIndex).toBe(0);
    });

    // a sticky non-global regex is a resumable cursor in the spec, so this
    // advances rather than restarting -- same as String#replace
    test('resumes a sticky regex the way String#replace does', async () => {
        const pattern = /a/y;
        const native = /a/y;
        expect(await replace('aab', pattern, async () => 'X')).toBe('aab'.replace(native, 'X'));
        expect(pattern.lastIndex).toBe(native.lastIndex);
        expect(await replace('aab', pattern, async () => 'X')).toBe('aab'.replace(native, 'X'));
        expect(pattern.lastIndex).toBe(native.lastIndex);
    });

    test('ignores a pre-set lastIndex on a global regex', async () => {
        const pattern = /a/g;
        pattern.lastIndex = 2;
        expect(await replace('aaa', pattern, async () => 'X')).toBe('XXX');
    });

    test('can reuse a regex after a rejected callback', async () => {
        const pattern = /a/g;
        const boom = replace('aaa', pattern, async () => {
            throw new Error('boom');
        }, 1);
        await expect(boom).rejects.toThrow('boom');
        expect(await replace('aaa', pattern, async () => 'X')).toBe('XXX');
    });

    test('survives concurrent calls sharing one regex', async () => {
        const pattern = /a/g;
        const [first, second] = await Promise.all([
            replace('aaa', pattern, async () => {
                await delay(10);
                return 'X';
            }, 1),
            replace('aaa', pattern, async () => 'Y', 1),
        ]);
        expect(first).toBe('XXX');
        expect(second).toBe('YYY');
    });
});

describe('limit semantics', () => {
    test('preserves order when later callbacks settle first', async () => {
        const text = 'a a a a a a a';
        let n = 0;
        const result = await replace(text, /a/g, async () => {
            const i = n++;
            await delay((7 - i) * 5);
            return i.toString();
        }, 3);
        expect(result).toBe('0 1 2 3 4 5 6');
    });

    test('caps how many callbacks are in flight at once', async () => {
        let inFlight = 0;
        let peak = 0;
        await replace('a a a a a a a', /a/g, async (match) => {
            peak = Math.max(peak, ++inFlight);
            await delay(5);
            inFlight--;
            return match;
        }, 3);
        expect(peak).toBe(3);
    });

    test('runs everything at once when limit is 0', async () => {
        let inFlight = 0;
        let peak = 0;
        await replace('a a a a a', /a/g, async (match) => {
            peak = Math.max(peak, ++inFlight);
            await delay(5);
            inFlight--;
            return match;
        });
        expect(peak).toBe(5);
    });

    test.each([1, 2, 3, 4, 5, 100])('is transparent to the result at limit %i', async (limit) => {
        const text = 'one two three four five';
        expect(await replace(text, /\w+/g, echo, limit)).toBe(text);
    });

    test('handles a match count that is an exact multiple of limit', async () => {
        expect(await replace('aaaa', /a/g, async () => 'X', 2)).toBe('XXXX');
    });

    test('flushes a trailing partial batch with a tail fragment', async () => {
        expect(await replace('aaab', /a/g, async () => 'X', 2)).toBe('XXXb');
    });
});

// Differential check: for a callback that only depends on the match, this should
// be indistinguishable from String#replace -- result and resulting lastIndex.
describe('parity with String#replace', () => {
    const inputs = ['', 'a', 'aab', 'abc', 'aaa', 'zing job came boom zang', 'a1b2c3', '  x  '];
    const sources = ['a', 'a+', '\\d', '(\\w)o+(\\w)', 'x*', '(?=\\d)', '(a)|(b)', '\\b', '^', '$'];
    const flagSets = ['', 'g', 'y', 'gy', 'i', 'gi'];
    const starts = [0, 1, 2];
    const stamp = (match: string) => `[${match}]`;

    const cases: [string, string, string, number][] = [];
    for (const input of inputs) {
        for (const source of sources) {
            for (const flags of flagSets) {
                for (const start of starts) {
                    cases.push([input, source, flags, start]);
                }
            }
        }
    }

    test(`matches native across ${cases.length} combinations`, async () => {
        const mismatches: string[] = [];
        for (const [input, source, flags, start] of cases) {
            const mine = new RegExp(source, flags);
            const native = new RegExp(source, flags);
            mine.lastIndex = start;
            native.lastIndex = start;

            const expected = input.replace(native, stamp);
            const actual = await replace(input, mine, async (match) => stamp(match));

            const label = `/${source}/${flags} on ${JSON.stringify(input)} @${start}`;
            if (actual !== expected) {
                mismatches.push(`${label}: got ${JSON.stringify(actual)}, native ${JSON.stringify(expected)}`);
            }
            if (mine.lastIndex !== native.lastIndex) {
                mismatches.push(`${label}: lastIndex ${mine.lastIndex}, native ${native.lastIndex}`);
            }
        }
        expect(mismatches).toEqual([]);
    });
});