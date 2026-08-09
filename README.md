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
  oversized strings/arrays, and the curated adversarial payload pack (see below)

Supported schema types: `string`, `number`, `integer`, `boolean`, `array`, `object`
(including nested `object` properties).

### Adversarial payload pack

`src/adversarial.js` exports a curated set of string payloads representative of
real attack classes, each tagged with its category:

- **prompt-injection** — instruction-override and role-confusion strings
  (e.g. "ignore all previous instructions", fake `<system>`/tool-output
  delimiters) aimed at agent/LLM-facing tools
- **path-traversal** — relative (`../`), encoded (`%2e%2e%2f`), absolute
  (`/etc/shadow`), UNC, and `file://` traversal strings
- **misc-injection** — SQL, script, shell command, template, null-byte, and
  format-string payloads

`generateCases` injects every payload as an `invalid` case for any root-level
`string` schema, and — for `object` schemas — scopes the whole pack to *each*
string-typed property individually (e.g. `injection-query-ignore-instructions`),
while leaving non-string properties (numbers, booleans, arrays) untouched. Each
resulting case carries a `tag` field identifying its adversarial class.

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

# Generate cases, run them against a handler, and print a pass/fail summary
node bin/cli.js run path/to/schema.json path/to/handler.js [--timeout=ms] [--report=path.json] [--json]
```

By default `run` prints a human-readable summary (counts per classification,
plus one line per unsafe case) and exits non-zero if any case is classified
`crash`, `hang`, or `unexpected-success`:

```
toolshape run: schema.json + handler.js

  33 case(s) run in 5997ms
  safe-reject:         7
  success:             5
  unexpected-success:  21
  crash:               0
  hang:                0

FAIL — 21 case(s) did not fail safely
  unexpected-success   wrong-type-limit   property "limit" has wrong type (expected integer)
  ...
```

- `--json` prints the full structured report to stdout instead of the
  human-readable summary.
- `--report=path.json` writes the full structured report to a file
  (`{ tool, generatedAt, schema, handler, durationMs, pass, summary, results }`),
  independent of whether `--json` was also passed.

## Status

Built autonomously with Claude Code, gated on passing tests (`npm test`).
