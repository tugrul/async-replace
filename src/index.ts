
/**
 * Represents a callback function used for string replacement.
 * @param match - The matched substring.
 * @param groups - An array of captured groups in the regex match.
 * @param index - The starting index of the match in the input string.
 * @param input - The original input string.
 * @returns A Promise resolving to the replacement string.
 */
export type ReplaceCallback = (match: string, groups: string[], index: number, input: string) => Promise<string>;

/**
 * Asynchronously replaces substrings in a string that match a specified regular expression
 * with the results of a specified callback function.
 * @param str - The input string to perform replacements on.
 * @param regex - The regular expression pattern to match substrings against.
 * @param callback - The callback function that produces the replacement substring.
 * @param limit - Optional. The maximum number of replacements to make concurrently. Default is 0 (no limit).
 * @returns A Promise resolving to the modified string after replacements.
 */
export async function replace(str: string, regex: RegExp, callback: ReplaceCallback, limit: number = 0): Promise<string> {

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
        last = match.index + target.length;

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
