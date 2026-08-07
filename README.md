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

### CLI

```bash
node bin/cli.js generate path/to/schema.json
```

Prints the generated cases as JSON to stdout.

## Status

Built autonomously with Claude Code, gated on passing tests (`npm test`).
