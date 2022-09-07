
# async-replace [![Build Status](https://github.com/tugrul/async-replace/actions/workflows/master.yml/badge.svg)](https://github.com/tugrul/async-replace/actions)

## Install

```
npm install --save @tugrul/async-replace
```

## Sample

```js
const {replace} = require('@tugrul/async-replace');

const text = 'the [example.com] website is the best website but [example.org] is better one';
const pattern = /\[([^\]]+)\]/g

// concurrency limiting to avoid resource saturation
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
