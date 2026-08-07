# toolshape

A CLI that takes a JSON Schema for an MCP/agent tool plus a local handler function, then
generates boundary and malformed-input test cases (missing fields, type mismatches,
injection-like strings, oversized payloads) to assert the handler fails safely instead of
crashing or hanging. For developers building MCP servers or custom Claude Code tools who
want contract tests without hand-writing every edge case.

## Install

```bash
npm install
```

## Usage

### As a library

```js
const { generateCases } = require('./src/generator');

const schema = {
  type: 'object',
  properties: {
    query: { type: 'string', minLength: 1, maxLength: 200 },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['query'],
  additionalProperties: false,
};

const cases = generateCases(schema);
// => [{ name, category: 'valid' | 'boundary' | 'invalid', value, description }, ...]
```

Each generated case includes:
- **valid** — representative inputs that satisfy the schema
- **boundary** — inputs at the edges of declared constraints (`minLength`, `maxLength`,
  `minimum`, `maximum`, `minItems`, `maxItems`)
- **invalid** — missing required fields, wrong types, out-of-range values,
  oversized strings/arrays, and injection-like strings (SQL, script, path traversal,
  command injection, template injection, null bytes, format strings)

Supported schema types: `string`, `number`, `integer`, `boolean`, `array`, `object`
(including nested `object` properties).

### Handler harness

`src/harness.js` runs a handler function against generated cases inside a sandboxed
worker thread with a timeout, and classifies each result:

```js
const { generateCases, runCases, summarize } = require('./src/index');

const cases = generateCases(schema);
const results = await runCases('./path/to/handler.js', cases, { timeoutMs: 2000 });
console.log(summarize(results));
// => { total, 'safe-reject', crash, hang, 'unexpected-success', success }
```

The handler module should export a function (or `{ handler: fn }`), sync or async.
Each result is classified as:

- **safe-reject** — the handler threw/rejected an `Error` in a controlled way
  (caught, did not crash or hang the process)
- **crash** — the handler crashed: an uncaught asynchronous exception, unhandled
  promise rejection, a thrown non-`Error` value, a stack overflow, or a failure to load
- **hang** — the handler did not respond within the timeout (its worker thread is
  forcibly terminated, so even a busy `while (true) {}` loop is caught)
- **unexpected-success** — the handler returned successfully for a case generated
  from the `invalid` category, i.e. it silently accepted input that should have
  been rejected
- **success** — the handler returned successfully for a `valid`/`boundary` case

### CLI

```bash
# Print generated cases as JSON
node bin/cli.js generate path/to/schema.json

# Generate cases and run them against a handler, printing a summary + per-case results
node bin/cli.js run path/to/schema.json path/to/handler.js [--timeout=ms]
```

`run` exits with a non-zero status if any case is classified `crash`, `hang`, or
`unexpected-success`.

## Status

Built autonomously with Claude Code, gated on passing tests (`npm test`).
