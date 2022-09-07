
import { replace } from '.';


test('replace function to return exact match 1', async() => {

    const pattern = /(\w)o+(\w)/g;
    const text = 'job came boom';

    const result = await replace(text, pattern, async(match) => {
        return match;
    });

    expect(result).toBe(text);
});

test('replace function to return exact match 2', async() => {

    const pattern = /(\w)o+(\w)/g;
    const text = 'zang job came boom';

    const result = await replace(text, pattern, async(match) => {
        return match;
    });

    expect(result).toBe(text);
});

test('replace function to return exact match 3', async() => {

    const pattern = /(\w)o+(\w)/g;
    const text = 'job came boom zing';

    const result = await replace(text, pattern, async(match) => {
        return match;
    });

    expect(result).toBe(text);
});

test('replace function to return exact match 4', async() => {

    const pattern = /(\w)o+(\w)/g;
    const text = 'zing job came boom zang';

    const result = await replace(text, pattern, async(match) => {
        return match;
    });

    expect(result).toBe(text);
});

test('replace function to return swapped chars 1', async() => {

    const pattern = /(\w)o+(\w)/g;

    const result = await replace('job came boom', pattern, async(match, [begin, end]) => {
        return end + 'a' + begin;
    });

    expect(result).toBe('baj came mab');
});

test('replace function to return swapped chars 2', async() => {

    const pattern = /(\w)o+(\w)/g;

    const result = await replace('zang job came boom', pattern, async(match, [begin, end]) => {
        return end + 'a' + begin;
    });

    expect(result).toBe('zang baj came mab');
});


test('replace function to return swapped chars 3', async() => {

    const pattern = /(\w)o+(\w)/g;

    const result = await replace('job came boom zing', pattern, async(match, [begin, end]) => {
        return end + 'a' + begin;
    });

    expect(result).toBe('baj came mab zing');
});

test('replace function to return swapped chars 3', async() => {

    const pattern = /(\w)o+(\w)/g;

    const result = await replace('zing job came boom zang', pattern, async(match, [begin, end]) => {
        return end + 'a' + begin;
    });

    expect(result).toBe('zing baj came mab zang');
});

test('replace function to return index', async() => {

    const pattern = /a/g;

    const result = await replace('bagaj', pattern, async(match, groups, index) => {
        return index.toString();
    });

    expect(result).toBe('b1g3j');
});

test('replace function limit feature', async() => {

    const text = 'zing zabz miki mabm rabm lolo oabo mofo rofo tabo moz mabo raks kabo';
    const pattern = /ab/g;

    const result = await replace(text, pattern, async(match) => {
        return match;
    }, 3);

    expect(result).toBe(text);
});
