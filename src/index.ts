
export type ReplaceCallback = (match: string, groups: string[], index: number, input: string) => Promise<string>;

export async function replace(str: string, regex: RegExp, callback: ReplaceCallback) {

    let last = 0;
    let match = null;
    const chunks = [];

    while ((match = regex.exec(str)) !== null) {

        // check the start fragment and push it to the array if it exists
        match.index > last && chunks.push(str.substring(last, match.index));

        const [target, ...groups] = match;

        chunks.push(callback(target, groups, match.index, match.input));
        last = match.index + match[0].length;

        if (!regex.global) {
            break;
        }
    }

    // check the remainder and push to array if any
    last < str.length && chunks.push(str.substring(last));

    return (await Promise.all(chunks)).join('');
}
