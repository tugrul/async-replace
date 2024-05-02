
export type ReplaceCallback = (match: string, groups: string[], index: number, input: string) => Promise<string>;

export async function replace(str: string, regex: RegExp, callback: ReplaceCallback, limit: number = 0): string {

    let last = 0;
    let match = null;
    let parts = [];
    const chunks : string[] = [];

    let size = limit;

    while ((match = regex.exec(str)) !== null) {

        // check the start fragment and push it to the array if it exists
        match.index > last && parts.push(str.substring(last, match.index));

        const [target, ...groups] = match;

        parts.push(callback(target, groups, match.index, match.input));
        last = match.index + match[0].length;

        if (size > 0 && --size === 0) {
            size = limit
            chunks.push((await Promise.all(parts)).join(''));
            parts = [];
        }

        if (!regex.global) {
            break;
        }
    }

    parts.length > 0 && chunks.push((await Promise.all(parts)).join(''));

    // check the remainder and push to array if any
    last < str.length && chunks.push(str.substring(last));

    return chunks.join('');
}
