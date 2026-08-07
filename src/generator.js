'use strict';

/**
 * Case generator: given a JSON Schema, produce a flat list of test cases
 * covering valid, boundary, and invalid inputs for that schema.
 *
 * Each case has the shape:
 *   { name, category: 'valid' | 'boundary' | 'invalid', value, description }
 */

const { adversarialStringPayloads } = require('./adversarial');

function mkCase(name, category, value, description, tag) {
  const c = { name, category, value, description };
  if (tag) c.tag = tag;
  return c;
}

/** True if a schema resolves to the 'string' variant generator (explicit or default type). */
function isStringSchema(schema) {
  if (!schema || typeof schema !== 'object') return false;
  const type = schema.type || 'string';
  return type === 'string';
}

/** Produce a single representative valid value for a schema (used to build objects/arrays). */
function validExampleFor(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;

  switch (schema.type) {
    case 'string': {
      const len = Math.max(schema.minLength || 0, 3);
      return 'x'.repeat(len);
    }
    case 'number': {
      if (typeof schema.minimum === 'number') return schema.minimum;
      if (typeof schema.maximum === 'number') return schema.maximum;
      return 1.5;
    }
    case 'integer': {
      if (typeof schema.minimum === 'number') return Math.ceil(schema.minimum);
      if (typeof schema.maximum === 'number') return Math.floor(schema.maximum);
      return 1;
    }
    case 'boolean':
      return true;
    case 'array': {
      const n = typeof schema.minItems === 'number' ? schema.minItems : 1;
      const item = validExampleFor(schema.items || { type: 'string' });
      return Array.from({ length: n }, () => item);
    }
    case 'object': {
      const obj = {};
      const props = schema.properties || {};
      const keys = schema.required || Object.keys(props);
      for (const key of keys) {
        if (props[key]) obj[key] = validExampleFor(props[key]);
      }
      return obj;
    }
    default:
      return null;
  }
}

/** Returns a value guaranteed to have a different JSON type than `type`. */
function wrongTypeValueFor(type) {
  switch (type) {
    case 'string':
      return 12345;
    case 'number':
    case 'integer':
      return 'not-a-number';
    case 'boolean':
      return 'true';
    case 'array':
      return { not: 'an-array' };
    case 'object':
      return ['not', 'an', 'object'];
    default:
      return null;
  }
}

function stringVariants(schema) {
  const { minLength, maxLength } = schema;
  const hasEnum = Array.isArray(schema.enum) && schema.enum.length > 0;
  const valid = [];
  const boundary = [];
  const invalid = [];

  if (hasEnum) {
    valid.push({ name: 'enum-value', value: schema.enum[0], description: 'first enum value' });
  } else {
    const len = Math.max(minLength || 0, 3);
    valid.push({ name: 'typical', value: 'x'.repeat(len), description: 'typical valid string' });
  }

  if (typeof minLength === 'number') {
    boundary.push({ name: 'min-length', value: 'x'.repeat(minLength), description: `string at minLength (${minLength})` });
  } else {
    boundary.push({ name: 'empty', value: '', description: 'empty string' });
  }
  if (typeof maxLength === 'number') {
    boundary.push({ name: 'max-length', value: 'x'.repeat(maxLength), description: `string at maxLength (${maxLength})` });
  }

  for (const [label, val] of Object.entries({ number: 123, boolean: true, null: null, array: [], object: {} })) {
    invalid.push({ name: `wrong-type-${label}`, value: val, description: `expected string, got ${label}` });
  }
  if (typeof minLength === 'number' && minLength > 0) {
    invalid.push({ name: 'below-min-length', value: 'x'.repeat(minLength - 1), description: `string shorter than minLength (${minLength})` });
  }
  if (typeof maxLength === 'number') {
    invalid.push({ name: 'above-max-length', value: 'x'.repeat(maxLength + 1), description: `string longer than maxLength (${maxLength})` });
  }
  if (hasEnum) {
    invalid.push({ name: 'not-in-enum', value: '__not_in_enum__', description: 'value not present in enum' });
  }
  invalid.push({ name: 'oversized', value: 'x'.repeat(10000), description: 'oversized payload (10000 chars)' });
  for (const payload of adversarialStringPayloads()) {
    invalid.push({
      name: payload.name,
      value: payload.value,
      description: `adversarial ${payload.tag} payload (${payload.name})`,
      tag: payload.tag,
    });
  }

  return { valid, boundary, invalid };
}

function numberVariants(schema, isInteger) {
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = schema;
  const valid = [];
  const boundary = [];
  const invalid = [];

  let typicalValue;
  if (typeof minimum === 'number') typicalValue = isInteger ? Math.ceil(minimum) : minimum;
  else if (typeof maximum === 'number') typicalValue = isInteger ? Math.floor(maximum) : maximum;
  else typicalValue = isInteger ? 1 : 1.5;
  valid.push({ name: 'typical', value: typicalValue, description: 'typical valid value within range' });

  if (typeof minimum === 'number') {
    boundary.push({ name: 'minimum', value: minimum, description: `value at minimum (${minimum})` });
  }
  if (typeof maximum === 'number') {
    boundary.push({ name: 'maximum', value: maximum, description: `value at maximum (${maximum})` });
  }
  if (typeof exclusiveMinimum === 'number') {
    const v = isInteger ? exclusiveMinimum + 1 : exclusiveMinimum + 0.0001;
    boundary.push({ name: 'above-exclusive-minimum', value: v, description: `value just above exclusiveMinimum (${exclusiveMinimum})` });
  }
  if (typeof exclusiveMaximum === 'number') {
    const v = isInteger ? exclusiveMaximum - 1 : exclusiveMaximum - 0.0001;
    boundary.push({ name: 'below-exclusive-maximum', value: v, description: `value just below exclusiveMaximum (${exclusiveMaximum})` });
  }
  if (boundary.length === 0) {
    boundary.push({ name: 'zero', value: 0, description: 'zero as a common boundary value' });
  }

  for (const [label, val] of Object.entries({ string: 'not-a-number', boolean: true, null: null, array: [], object: {} })) {
    invalid.push({ name: `wrong-type-${label}`, value: val, description: `expected ${isInteger ? 'integer' : 'number'}, got ${label}` });
  }
  if (typeof minimum === 'number') {
    invalid.push({ name: 'below-minimum', value: minimum - 1, description: `value below minimum (${minimum})` });
  }
  if (typeof maximum === 'number') {
    invalid.push({ name: 'above-maximum', value: maximum + 1, description: `value above maximum (${maximum})` });
  }
  if (typeof exclusiveMinimum === 'number') {
    invalid.push({ name: 'at-exclusive-minimum', value: exclusiveMinimum, description: `value at exclusiveMinimum (${exclusiveMinimum}), should be rejected` });
  }
  if (typeof exclusiveMaximum === 'number') {
    invalid.push({ name: 'at-exclusive-maximum', value: exclusiveMaximum, description: `value at exclusiveMaximum (${exclusiveMaximum}), should be rejected` });
  }
  if (isInteger) {
    invalid.push({ name: 'non-integer', value: typicalValue + 0.5, description: 'non-integer number where integer expected' });
  }
  invalid.push({ name: 'huge-number', value: Number.MAX_SAFE_INTEGER + 1e10, description: 'oversized numeric payload' });

  return { valid, boundary, invalid };
}

function booleanVariants() {
  return {
    valid: [
      { name: 'true', value: true, description: 'boolean true' },
      { name: 'false', value: false, description: 'boolean false' },
    ],
    boundary: [],
    invalid: [
      { name: 'wrong-type-string', value: 'true', description: 'expected boolean, got string' },
      { name: 'wrong-type-number', value: 1, description: 'expected boolean, got number' },
      { name: 'wrong-type-null', value: null, description: 'expected boolean, got null' },
      { name: 'wrong-type-array', value: [], description: 'expected boolean, got array' },
      { name: 'wrong-type-object', value: {}, description: 'expected boolean, got object' },
    ],
  };
}

function arrayVariants(schema) {
  const { minItems, maxItems } = schema;
  const itemSchema = schema.items || { type: 'string' };
  const itemValue = validExampleFor(itemSchema);
  const valid = [];
  const boundary = [];
  const invalid = [];

  const n = typeof minItems === 'number' ? minItems : 1;
  valid.push({ name: 'typical', value: Array.from({ length: Math.max(n, 1) }, () => itemValue), description: 'typical valid array' });

  if (typeof minItems === 'number') {
    boundary.push({ name: 'min-items', value: Array.from({ length: minItems }, () => itemValue), description: `array at minItems (${minItems})` });
  } else {
    boundary.push({ name: 'empty', value: [], description: 'empty array' });
  }
  if (typeof maxItems === 'number') {
    boundary.push({ name: 'max-items', value: Array.from({ length: maxItems }, () => itemValue), description: `array at maxItems (${maxItems})` });
  }

  for (const [label, val] of Object.entries({ string: 'not-an-array', number: 42, boolean: true, null: null, object: {} })) {
    invalid.push({ name: `wrong-type-${label}`, value: val, description: `expected array, got ${label}` });
  }
  if (typeof minItems === 'number' && minItems > 0) {
    invalid.push({ name: 'below-min-items', value: Array.from({ length: minItems - 1 }, () => itemValue), description: `array shorter than minItems (${minItems})` });
  }
  if (typeof maxItems === 'number') {
    invalid.push({ name: 'above-max-items', value: Array.from({ length: maxItems + 1 }, () => itemValue), description: `array longer than maxItems (${maxItems})` });
  }
  invalid.push({ name: 'wrong-item-type', value: [wrongTypeValueFor(itemSchema.type)], description: 'array containing an item of the wrong type' });
  invalid.push({ name: 'oversized-array', value: Array.from({ length: 10000 }, () => itemValue), description: 'oversized array payload (10000 items)' });

  return { valid, boundary, invalid };
}

function variantsForSchema(schema) {
  const type = schema.type || (Array.isArray(schema.enum) ? 'string' : 'string');
  switch (type) {
    case 'string':
      return stringVariants(schema);
    case 'number':
      return numberVariants(schema, false);
    case 'integer':
      return numberVariants(schema, true);
    case 'boolean':
      return booleanVariants();
    case 'array':
      return arrayVariants(schema);
    default:
      return stringVariants(schema);
  }
}

function generateObjectCases(schema) {
  const props = schema.properties || {};
  const required = schema.required || [];
  const propNames = Object.keys(props);
  const cases = [];

  const baseValid = validExampleFor({ ...schema, type: 'object' });
  cases.push(mkCase('valid-object', 'valid', baseValid, 'object with all properties populated with valid values'));

  for (const key of propNames) {
    const propSchema = props[key];
    if (!propSchema || propSchema.type === 'object') continue;
    const variants = variantsForSchema(propSchema);
    for (const b of variants.boundary) {
      const variant = { ...baseValid, [key]: b.value };
      cases.push(mkCase(`boundary-${key}-${b.name}`, 'boundary', variant, `property "${key}" at boundary: ${b.description}`));
    }
  }

  for (const key of required) {
    const variant = { ...baseValid };
    delete variant[key];
    cases.push(mkCase(`missing-required-${key}`, 'invalid', variant, `missing required property "${key}"`));
  }

  for (const key of propNames) {
    const propType = props[key].type || 'string';
    const variant = { ...baseValid, [key]: wrongTypeValueFor(propType) };
    cases.push(mkCase(`wrong-type-${key}`, 'invalid', variant, `property "${key}" has wrong type (expected ${propType})`));
  }

  // Inject the curated adversarial payload pack into each string-typed
  // property individually, so coverage matches the object's actual shape
  // (a payload never lands in a number/boolean/array property).
  for (const key of propNames) {
    const propSchema = props[key];
    if (!isStringSchema(propSchema)) continue;
    for (const payload of adversarialStringPayloads()) {
      const variant = { ...baseValid, [key]: payload.value };
      cases.push(
        mkCase(
          `injection-${key}-${payload.name}`,
          'invalid',
          variant,
          `property "${key}" holds adversarial ${payload.tag} payload (${payload.name})`,
          payload.tag
        )
      );
    }
  }

  if (schema.additionalProperties === false) {
    const variant = { ...baseValid, __unexpected_field__: 'unexpected' };
    cases.push(mkCase('additional-property', 'invalid', variant, 'unexpected additional property not permitted by schema (additionalProperties: false)'));
  }

  for (const [label, val] of Object.entries({ string: 'not-an-object', number: 42, array: [], null: null, boolean: true })) {
    cases.push(mkCase(`wrong-type-root-${label}`, 'invalid', val, `expected object, got ${label}`));
  }

  return cases;
}

/**
 * Generate valid/boundary/invalid test cases for the given JSON Schema.
 * @param {object} schema - a JSON Schema describing a tool's input.
 * @returns {{name: string, category: 'valid'|'boundary'|'invalid', value: *, description: string}[]}
 */
function generateCases(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new TypeError('generateCases requires a JSON Schema object');
  }

  const type = schema.type || (schema.properties ? 'object' : undefined);

  if (type === 'object') {
    return generateObjectCases(schema);
  }

  const variants = variantsForSchema(schema);
  const cases = [];
  for (const v of variants.valid) cases.push(mkCase(`valid-${v.name}`, 'valid', v.value, v.description, v.tag));
  for (const v of variants.boundary) cases.push(mkCase(`boundary-${v.name}`, 'boundary', v.value, v.description, v.tag));
  for (const v of variants.invalid) cases.push(mkCase(`invalid-${v.name}`, 'invalid', v.value, v.description, v.tag));
  return cases;
}

module.exports = { generateCases, validExampleFor };
