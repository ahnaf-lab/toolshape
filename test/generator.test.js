'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCases } = require('../src/generator');

function byCategory(cases) {
  return {
    valid: cases.filter((c) => c.category === 'valid'),
    boundary: cases.filter((c) => c.category === 'boundary'),
    invalid: cases.filter((c) => c.category === 'invalid'),
  };
}

test('string schema: generates valid, boundary, and invalid cases including injection-like strings', () => {
  const schema = { type: 'string', minLength: 2, maxLength: 5 };
  const cases = generateCases(schema);
  const { valid, boundary, invalid } = byCategory(cases);

  assert.ok(valid.length > 0, 'expected at least one valid case');
  assert.ok(boundary.some((c) => c.value.length === 2), 'expected boundary case at minLength');
  assert.ok(boundary.some((c) => c.value.length === 5), 'expected boundary case at maxLength');
  assert.ok(invalid.some((c) => typeof c.value === 'number'), 'expected wrong-type invalid case');
  assert.ok(invalid.some((c) => typeof c.value === 'string' && c.value.length > 5), 'expected above-maxLength invalid case');
  assert.ok(
    invalid.some((c) => typeof c.value === 'string' && /DROP TABLE|<script>|\.\.\//.test(c.value)),
    'expected an injection-like invalid case'
  );
});

test('number schema: respects minimum/maximum for boundary and invalid cases', () => {
  const schema = { type: 'number', minimum: 0, maximum: 100 };
  const cases = generateCases(schema);
  const { boundary, invalid } = byCategory(cases);

  assert.ok(boundary.some((c) => c.value === 0), 'expected boundary case at minimum');
  assert.ok(boundary.some((c) => c.value === 100), 'expected boundary case at maximum');
  assert.ok(invalid.some((c) => c.value === -1), 'expected below-minimum invalid case');
  assert.ok(invalid.some((c) => c.value === 101), 'expected above-maximum invalid case');
  assert.ok(invalid.some((c) => typeof c.value === 'string'), 'expected wrong-type invalid case');
});

test('integer schema: rejects non-integer numeric values', () => {
  const schema = { type: 'integer', minimum: 1, maximum: 10 };
  const cases = generateCases(schema);
  const { invalid } = byCategory(cases);

  assert.ok(
    invalid.some((c) => typeof c.value === 'number' && !Number.isInteger(c.value)),
    'expected a non-integer invalid case'
  );
});

test('boolean schema: generates true/false valid cases and wrong-type invalid cases', () => {
  const schema = { type: 'boolean' };
  const cases = generateCases(schema);
  const { valid, invalid } = byCategory(cases);

  assert.ok(valid.some((c) => c.value === true));
  assert.ok(valid.some((c) => c.value === false));
  assert.ok(invalid.some((c) => c.value === 'true'), 'expected string "true" invalid case');
});

test('array schema: respects minItems/maxItems and item type', () => {
  const schema = { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 };
  const cases = generateCases(schema);
  const { valid, boundary, invalid } = byCategory(cases);

  assert.ok(valid.every((c) => Array.isArray(c.value)));
  assert.ok(boundary.some((c) => c.value.length === 1));
  assert.ok(boundary.some((c) => c.value.length === 3));
  assert.ok(
    invalid.some((c) => Array.isArray(c.value) && c.value.length > 3),
    'expected above-maxItems invalid case'
  );
  assert.ok(invalid.some((c) => !Array.isArray(c.value)), 'expected wrong-type invalid case');
});

test('object schema: covers missing required fields and wrong-type properties', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      age: { type: 'integer', minimum: 0 },
    },
    required: ['name', 'age'],
    additionalProperties: false,
  };
  const cases = generateCases(schema);
  const { valid, invalid } = byCategory(cases);

  assert.equal(valid.length, 1);
  assert.ok('name' in valid[0].value && 'age' in valid[0].value);

  const missingName = invalid.find((c) => c.name === 'missing-required-name');
  assert.ok(missingName, 'expected a case for missing required "name"');
  assert.ok(!('name' in missingName.value));

  const missingAge = invalid.find((c) => c.name === 'missing-required-age');
  assert.ok(missingAge, 'expected a case for missing required "age"');

  const wrongTypeName = invalid.find((c) => c.name === 'wrong-type-name');
  assert.ok(wrongTypeName && typeof wrongTypeName.value.name !== 'string');

  const additional = invalid.find((c) => c.name === 'additional-property');
  assert.ok(additional, 'expected an unexpected-additional-property case since additionalProperties is false');
});

test('coverage: every supported schema type yields valid and invalid categories, and boundary where applicable', () => {
  const schemas = [
    { type: 'string' },
    { type: 'number' },
    { type: 'integer' },
    { type: 'boolean' },
    { type: 'array', items: { type: 'string' } },
    { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
  ];

  for (const schema of schemas) {
    const cases = generateCases(schema);
    const { valid, boundary, invalid } = byCategory(cases);
    assert.ok(valid.length > 0, `expected valid cases for type ${schema.type}`);
    assert.ok(invalid.length > 0, `expected invalid cases for type ${schema.type}`);
    if (schema.type !== 'boolean') {
      assert.ok(boundary.length > 0, `expected boundary cases for type ${schema.type}`);
    }
  }
});

test('generateCases throws on non-schema input', () => {
  assert.throws(() => generateCases(null));
  assert.throws(() => generateCases('not a schema'));
  assert.throws(() => generateCases(undefined));
});
