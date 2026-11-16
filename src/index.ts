/**
 * Represents a callback function used for string replacement.
 * @param match - The matched substring.
 * @param groups - Captured groups in the regex match. Entries are `undefined`
 *                 for groups that did not participate in the match.
 * @param index - The starting index of the match in the input string.
 * @param input - The original input string.
 * @returns A Promise resolving to the replacement string.
 */
export type ReplaceCallback = (
    match: string,
    groups: (string | undefined)[],
    index: number,
    input: string,
) => Promise<string>;

/**
 * Where to resume scanning after an empty match at `index`: one code unit on, or one
 * whole code point in unicode mode. Stepping a single code unit there can land between
 * the halves of a surrogate pair, where exec backs up to the lead surrogate and returns
 * the same empty match again. Mirrors AdvanceStringIndex in ECMA-262.
 */
function advanceIndex(str: string, index: number, unicode: boolean): number {
    if (!unicode) {
        return index + 1;
    }
    const codePoint = str.codePointAt(index);
    return index + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
}

/**
 * Asynchronously replaces substrings in a string that match a specified regular expression
 * with the results of a specified callback function.
 *
 * Matching runs against an internal clone of `regex`, so one RegExp object can be shared
 * across concurrent calls. When the call succeeds, the caller's `lastIndex` is left where
 * `String#replace` would leave it: 0 for a global regex, just past the match for a sticky
 * non-global one, and untouched otherwise.
 *
 * @param str - The input string to perform replacements on.
 * @param regex - The regular expression pattern to match substrings against.
 *                Without the `g` flag only the first match is replaced.
 * @param callback - The callback function that produces the replacement substring.
 * @param limit - Optional. Callbacks are started as matches are found; every `limit`
 *                matches the function pauses until that batch settles before scanning
 *                on. This is backpressure, not a concurrency target — it stops a large
 *                input from firing every callback at a heavy source at once.
 *                Default is 0 (no pausing).
 * @returns A Promise resolving to the modified string after replacements.
 */
export async function replace(
    str: string,
    regex: RegExp,
    callback: ReplaceCallback,
    limit: number = 0,
): Promise<string> {
    // Scan against a clone so an interleaved or failed call can never corrupt the
    // caller's cursor mid-scan. lastIndex is then seeded and written back to match
    // what String#replace does: /g ignores the incoming value and finishes at 0,
    // a sticky non-global regex resumes from it and advances it, and an unflagged
    // regex ignores it entirely.
    const re = new RegExp(regex.source, regex.flags);
    if (re.sticky && !re.global) {
        re.lastIndex = regex.lastIndex;
    }
    // `unicode` is false under the v flag, so read the flags rather than the property.
    const unicode = re.unicode || re.flags.includes('v');
    const chunks: string[] = [];
    let parts: (string | Promise<string>)[] = [];
    let match: RegExpExecArray | null = null;
    let last = 0;
    let size = limit;

    while ((match = re.exec(str)) !== null) {
        // check the start fragment and push it to the array if it exists
        if (match.index > last) {
            parts.push(str.substring(last, match.index));
        }
        const [target, ...groups] = match;
        parts.push(callback(target, groups, match.index, str));
        last = match.index + target.length;

        if (size > 0 && --size === 0) {
            size = limit;
            chunks.push((await Promise.all(parts)).join(''));
            parts = [];
        }

        if (!re.global) {
            break;
        }

        // A zero-width match leaves lastIndex where it was, so exec would return the
        // same match forever. Step over it -- but only when the loop continues, or the
        // bump would leak into the cursor handed back to a sticky caller.
        if (target.length === 0) {
            re.lastIndex = advanceIndex(str, re.lastIndex, unicode);
        }
    }

    if (parts.length > 0) {
        chunks.push((await Promise.all(parts)).join(''));
    }
    // check the remainder and push to array if any
    if (last < str.length) {
        chunks.push(str.substring(last));
    }
    // Only on success: if a callback rejects, the caller's cursor is left as it was
    // rather than stranded halfway through a scan that never produced a result.
    if (regex.global || regex.sticky) {
        regex.lastIndex = re.lastIndex;
    }
    return chunks.join('');
}
