# async-replace [![Build Status](https://github.com/tugrul/async-replace/actions/workflows/master.yml/badge.svg)](https://github.com/tugrul/async-replace/actions)

`String#replace` with an async callback. Matches are resolved concurrently, with optional backpressure so a large input doesn't fire every callback at a heavy source at once.

## Install

```
npm install --save @tugrul/async-replace
```

## Sample

```js
const {replace} = require('@tugrul/async-replace');

const text = 'the [example.com] website is the best website but [example.org] is better one';
const pattern = /\[([^\]]+)\]/g

// pause after every 5 matches so the source gets room to breathe
const limit = 5;

async function addStatusCode(text) {

    return replace(text, pattern, async(match, [domain]) => {

        const {status} = await fetch('https://' + domain);

        return '[' + domain + ' (' + status + ')]';
    }, limit);

}

// the [example.com (200)] website is the best website but [example.org (200)] is better one
addStatusCode(text).then(result => console.log(result));
```

## API

### `replace(str, regex, callback, limit?) => Promise<string>`

| Argument   | Type              | Description                                                                 |
| ---------- | ----------------- | --------------------------------------------------------------------------- |
| `str`      | `string`          | The input string.                                                             |
| `regex`    | `RegExp`          | Pattern to match. Without the `g` flag only the first match is replaced.      |
| `callback` | `ReplaceCallback` | Produces the replacement for each match.                                      |
| `limit`    | `number`          | Optional. Matches to resolve before pausing. Default `0` (never pause).       |

Resolves to the input with every match replaced by its callback result. Segments between matches are passed through untouched.

### `ReplaceCallback(match, groups, index, input) => Promise<string>`

| Argument | Type                    | Description                                                                    |
| -------- | ----------------------- | ------------------------------------------------------------------------------ |
| `match`  | `string`                | The matched substring.                                                           |
| `groups` | `(string \| undefined)[]` | Captured groups. `undefined` for groups that did not participate in the match. |
| `index`  | `number`                | Start offset of the match in `input`.                                            |
| `input`  | `string`                | The original input string.                                                       |

Callbacks are invoked in match order, but they run concurrently, so they may settle in any order. The output is always assembled in match order regardless.

Groups that don't participate are `undefined`, not empty strings — the same as `String#replace`:

```js
await replace('b', /(a)|(b)/g, async (match, groups) => {
    // groups is [undefined, 'b']
    return groups.filter(Boolean).join();
});
```

## The `limit` argument

`limit` is backpressure, not a concurrency target. Callbacks start as matches are found; every `limit` matches the scan pauses until that batch settles, then continues. It exists to keep a large input from saturating whatever the callback talks to — a rate-limited API, a connection pool, a disk.

```js
// at most 5 requests in flight; the 6th match waits for all of the first five
await replace(hugeDocument, /\[([^\]]+)\]/g, lookup, 5);

// default: every match dispatches immediately
await replace(hugeDocument, /\[([^\]]+)\]/g, lookup);
```

`limit` never affects the result — only pacing. `limit = 0` (the default) means no pausing at all, which is fine for small inputs and cheap callbacks but will happily open a thousand sockets on a large one.

## Regex flags

Flag handling follows `String#replace` exactly, including what happens to `lastIndex`:

| Flags        | Behavior                                                                    |
| ------------ | --------------------------------------------------------------------------- |
| `g`          | Replaces every match. Any incoming `lastIndex` is ignored; ends at `0`.       |
| none         | Replaces the first match only. `lastIndex` is ignored entirely.               |
| `y` (no `g`) | Replaces one match, resuming from `lastIndex` and advancing it.               |

Sticky regexes are therefore resumable cursors, which is useful for walking a string in steps:

```js
const token = /\w+|\s+/y;
await replace('ab cd', token, async m => `<${m}>`);  // '<ab> cd'   lastIndex 2
await replace('ab cd', token, async m => `<${m}>`);  // 'ab< >cd'   lastIndex 3
```

Matching runs against an internal clone of your regex, so a shared or module-level `RegExp` is safe to use from concurrent calls:

```js
const pattern = /a/g;

// both correct; neither call disturbs the other
await Promise.all([
    replace('aaa', pattern, async () => 'X', 1),  // 'XXX'
    replace('aaa', pattern, async () => 'Y', 1),  // 'YYY'
]);
```

Zero-width patterns such as `/x*/g` and `/(?=\d)/g` terminate and produce the same output as `String#replace`.

## Errors

If a callback rejects, `replace` rejects with that error. Callbacks already in flight are left to settle; nothing further is dispatched, so with a `limit` set the remaining batches never start:

```js
let calls = 0;
try {
    await replace('aaaaaa', /a/g, async () => { calls++; throw new Error('nope'); }, 2);
} catch (err) {
    // err.message === 'nope', calls === 2 — the remaining 4 matches were never dispatched
}
```

Your regex's `lastIndex` is left untouched when a call rejects, so a sticky cursor isn't stranded partway through a scan that produced no result.

## TypeScript

Types ship with the package.

```ts
import {replace, ReplaceCallback} from '@tugrul/async-replace';

const upper: ReplaceCallback = async (match) => match.toUpperCase();

await replace('job came boom', /(\w)o+(\w)/g, upper);
```

Under `strict`, destructuring groups needs defaults or a guard, since entries may be `undefined`:

```ts
await replace('job came boom', /(\w)o+(\w)/g, async (match, [begin = '', end = '']) => end + 'a' + begin);
```

## Note on streams

`replace` operates on one complete string. Applying it chunk by chunk to a stream will silently miss any match straddling a chunk boundary:

```js
// 'boom' is split across the two chunks and matches neither
await replace('aaa bo', pattern, cb);   // 'aaa bo'
await replace('om aaa', pattern, cb);   // 'om aaa'
```

Preserving `lastIndex` across calls doesn't help here — the match isn't lost to cursor state, it's simply absent from both chunks. Buffer a tail in the consumer and feed forward only up to the last offset where a match can no longer grow.