'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runCase, runCases, classify, summarize } = require('../src/harness');
const { generateCases } = require('../src/generator');

const fixture = (name) => path.join(__dirname, '..', 'fixtures', 'handlers', name);

const invalidCase = { name: 'some-invalid-case', category: 'invalid', value: '<script>alert(1)</script>', description: 'test' };
const validCase = { name: 'some-valid-case', category: 'valid', value: 'ok', description: 'test' };

test('classify: maps raw outcomes to safety labels', () => {
  assert.equal(classify({ outcome: 'hang' }, 'invalid'), 'hang');
  assert.equal(classify({ outcome: 'crash' }, 'invalid'), 'crash');
  assert.equal(classify({ outcome: 'reject' }, 'invalid'), 'safe-reject');
  assert.equal(classify({ outcome: 'reject' }, 'valid'), 'safe-reject');
  assert.equal(classify({ outcome: 'success' }, 'invalid'), 'unexpected-success');
  assert.equal(classify({ outcome: 'success' }, 'valid'), 'success');
  assert.equal(classify({ outcome: 'success' }, 'boundary'), 'success');
});

test('a handler that always throws an Error is classified safe-reject', async () => {
  const result = await runCase(fixture('always-reject.js'), invalidCase);
  assert.equal(result.outcome, 'reject');
  assert.equal(result.classification, 'safe-reject');
  assert.equal(result.error.message, 'rejected: input failed validation');
});

test('a handler that never validates input is classified unexpected-success on invalid cases', async () => {
  const result = await runCase(fixture('always-succeed.js'), invalidCase);
  assert.equal(result.outcome, 'success');
  assert.equal(result.classification, 'unexpected-success');
  assert.deepEqual(result.result, { ok: true, echo: invalidCase.value });
});

test('the same always-succeed handler is classified plain success on valid cases', async () => {
  const result = await runCase(fixture('always-succeed.js'), validCase);
  assert.equal(result.classification, 'success');
});

test('a handler that throws a non-Error value is classified crash', async () => {
  const result = await runCase(fixture('crash-non-error-throw.js'), invalidCase);
  assert.equal(result.outcome, 'crash');
  assert.equal(result.classification, 'crash');
  assert.equal(result.error.name, 'NonErrorThrow');
});

test('a handler that throws asynchronously outside its promise is classified crash', async () => {
  const result = await runCase(fixture('crash-async-uncaught.js'), invalidCase, { timeoutMs: 1000 });
  assert.equal(result.outcome, 'crash');
  assert.equal(result.classification, 'crash');
  assert.match(result.error.message, /async failure/);
});

test('a handler with unbounded recursion (stack overflow) is classified crash, not safe-reject', async () => {
  const result = await runCase(fixture('crash-stack-overflow.js'), invalidCase);
  assert.equal(result.outcome, 'crash');
  assert.equal(result.classification, 'crash');
  assert.equal(result.error.name, 'RangeError');
});

test('a handler that never returns is classified hang and the worker is terminated', async () => {
  const start = Date.now();
  const result = await runCase(fixture('hang-infinite-loop.js'), invalidCase, { timeoutMs: 200 });
  const elapsed = Date.now() - start;
  assert.equal(result.outcome, 'hang');
  assert.equal(result.classification, 'hang');
  assert.ok(elapsed < 2000, `expected forced termination well under 2s, took ${elapsed}ms`);
});

test('runCases runs a batch of generated cases and reports a classification for each', async () => {
  const schema = { type: 'boolean' };
  const cases = generateCases(schema);
  const results = await runCases(fixture('always-reject.js'), cases);

  assert.equal(results.length, cases.length);
  assert.ok(results.every((r) => typeof r.classification === 'string'));
  assert.ok(results.every((r) => r.classification === 'safe-reject'));
});

test('summarize tallies classifications across results', async () => {
  const results = await Promise.all([
    runCase(fixture('always-reject.js'), invalidCase),
    runCase(fixture('always-succeed.js'), invalidCase),
    runCase(fixture('crash-non-error-throw.js'), invalidCase),
  ]);
  const summary = summarize(results);

  assert.equal(summary.total, 3);
  assert.equal(summary['safe-reject'], 1);
  assert.equal(summary['unexpected-success'], 1);
  assert.equal(summary.crash, 1);
});

test('integration: a schema-driven case set exposes both known bugs in a realistic handler', async () => {
  const schema = {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1, maxLength: 50 },
      limit: { type: 'integer', minimum: 1, maximum: 20 },
    },
    required: ['query'],
    additionalProperties: false,
  };
  const cases = generateCases(schema);
  const results = await runCases(fixture('buggy-search.js'), cases);
  const summary = summarize(results);

  // Bug 1: wrong-type `query` (e.g. a number) crashes on `.toUpperCase()`
  // instead of failing cleanly with a validation message — still caught
  // synchronously, so it's a safe-reject, but the harness surfaces it.
  const wrongTypeQuery = results.find((r) => r.name === 'wrong-type-query');
  assert.ok(wrongTypeQuery, 'expected a wrong-type-query case to be generated');
  assert.equal(wrongTypeQuery.classification, 'safe-reject');

  // Bug 2: `limit` is never type-checked (it just falls back to a default
  // instead of rejecting), so a wrong-type `limit` is silently accepted.
  const wrongTypeLimit = results.find((r) => r.name === 'wrong-type-limit');
  assert.ok(wrongTypeLimit, 'expected a wrong-type-limit case to be generated');
  assert.equal(wrongTypeLimit.classification, 'unexpected-success');

  // Bug 3: additionalProperties: false is never enforced by the handler.
  const additionalProperty = results.find((r) => r.name === 'additional-property');
  assert.ok(additionalProperty, 'expected an additional-property case to be generated');
  assert.equal(additionalProperty.classification, 'unexpected-success');

  assert.equal(summary.total, cases.length);
});
