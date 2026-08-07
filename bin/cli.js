#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { generateCases } = require('../src/generator');

function main(argv) {
  const [, , command, schemaPath] = argv;

  if (command !== 'generate' || !schemaPath) {
    console.error('Usage: toolshape generate <schema.json>');
    process.exitCode = 1;
    return;
  }

  const resolvedPath = path.resolve(process.cwd(), schemaPath);
  let schema;
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    schema = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to read/parse schema at ${resolvedPath}: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  let cases;
  try {
    cases = generateCases(schema);
  } catch (err) {
    console.error(`Failed to generate cases: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(cases, null, 2));
}

main(process.argv);
