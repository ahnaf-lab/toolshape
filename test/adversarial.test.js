'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROMPT_INJECTION_STRINGS,
  PATH_TRAVERSAL_STRINGS,
  adversarialStringPayloads,
} = require('../src/adversarial');
const { generateCases } = require('../src/generator');

test('adversarial payload pack: curated prompt-injection and path-traversal payloads are non-trivial', () => {
  assert.ok(PROMPT_INJECTION_STRINGS.length >= 3, 'expected several curated prompt-injection payloads');
  assert.ok(PATH_TRAVERSAL_STRINGS.length >= 3, 'expected several curated path-traversal payloads');

  for (const p of PROMPT_INJECTION_STRINGS) {
    assert.equal(typeof p.value, 'string');
    assert.ok(p.value.length > 0);
  }
  for (const p of PATH_TRAVERSAL_STRINGS) {
    assert.equal(typeof p.value, 'string');
    assert.ok(p.value.length > 0);
  }

  const tags = new Set(adversarialStringPayloads().map((p) => p.tag));
  assert.ok(tags.has('prompt-injection'));
  assert.ok(tags.has('path-traversal'));
});

test('root string schema: every curated adversarial payload appears as an invalid case', () => {
  const cases = generateCases({ type: 'string' });
  const invalidValues = cases.filter((c) => c.category === 'invalid').map((c) => c.value);

  for (const payload of adversarialStringPayloads()) {
    assert.ok(
      invalidValues.includes(payload.value),
      `expected generated cases to include adversarial payload "${payload.name}"`
    );
  }

  const promptInjectionCases = cases.filter((c) => c.tag === 'prompt-injection');
  const pathTraversalCases = cases.filter((c) => c.tag === 'path-traversal');
  assert.equal(promptInjectionCases.length, PROMPT_INJECTION_STRINGS.length);
  assert.equal(pathTraversalCases.length, PATH_TRAVERSAL_STRINGS.length);
});

test('object schema: adversarial payloads are injected per string-typed property, matching schema shape', () => {
  const schema = {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1 },
      note: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 10 },
      active: { type: 'boolean' },
    },
    required: ['query'],
  };
  const cases = generateCases(schema);
  const invalid = cases.filter((c) => c.category === 'invalid');

  const totalPayloads = adversarialStringPayloads().length;

  const queryInjectionCases = invalid.filter((c) => c.name.startsWith('injection-query-'));
  const noteInjectionCases = invalid.filter((c) => c.name.startsWith('injection-note-'));
  assert.equal(queryInjectionCases.length, totalPayloads, 'expected one injection case per payload for "query"');
  assert.equal(noteInjectionCases.length, totalPayloads, 'expected one injection case per payload for "note"');

  for (const c of queryInjectionCases) {
    assert.equal(typeof c.value.query, 'string');
    assert.ok(['prompt-injection', 'path-traversal', 'misc-injection'].includes(c.tag));
  }

  // Non-string properties must never receive injection-style payload cases.
  assert.ok(!invalid.some((c) => c.name.startsWith('injection-limit-')), 'integer property must not get injection cases');
  assert.ok(!invalid.some((c) => c.name.startsWith('injection-active-')), 'boolean property must not get injection cases');

  // A specific prompt-injection payload should show up scoped to the right property.
  const promptPayload = PROMPT_INJECTION_STRINGS[0];
  const scoped = invalid.find((c) => c.name === `injection-query-${promptPayload.name}`);
  assert.ok(scoped, 'expected a specific prompt-injection payload scoped to the "query" property');
  assert.equal(scoped.value.query, promptPayload.value);

  // The "note" property is optional, so it isn't populated in the base
  // object, but its own injection cases must still carry the payload.
  const noteScoped = invalid.find((c) => c.name === `injection-note-${promptPayload.name}`);
  assert.ok(noteScoped, 'expected a specific prompt-injection payload scoped to the "note" property');
  assert.equal(noteScoped.value.note, promptPayload.value);
});

test('object schema with no string properties: no injection cases are generated', () => {
  const schema = {
    type: 'object',
    properties: {
      count: { type: 'integer' },
      enabled: { type: 'boolean' },
    },
    required: ['count'],
  };
  const cases = generateCases(schema);
  assert.ok(!cases.some((c) => c.name.startsWith('injection-')), 'expected no injection cases without string properties');
});
