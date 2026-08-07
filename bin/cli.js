#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { generateCases } = require('../src/generator');
const { runCases, summarize } = require('../src/harness');

function printUsage() {
  console.error('Usage:');
  console.error('  toolshape generate <schema.json>');
  console.error('  toolshape run <schema.json> <handler.js> [--timeout=ms]');
}

function loadSchema(schemaPath) {
  const resolvedPath = path.resolve(process.cwd(), schemaPath);
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  return JSON.parse(raw);
}

async function runGenerate(schemaPath) {
  if (!schemaPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  let schema;
  try {
    schema = loadSchema(schemaPath);
  } catch (err) {
    console.error(`Failed to read/parse schema at ${schemaPath}: ${err.message}`);
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

async function runRun(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const [schemaPath, handlerPath] = positional;
  const timeoutArg = args.find((a) => a.startsWith('--timeout='));
  const timeoutMs = timeoutArg ? Number(timeoutArg.slice('--timeout='.length)) : undefined;

  if (!schemaPath || !handlerPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  let schema;
  try {
    schema = loadSchema(schemaPath);
  } catch (err) {
    console.error(`Failed to read/parse schema at ${schemaPath}: ${err.message}`);
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

  const resolvedHandlerPath = path.resolve(process.cwd(), handlerPath);
  const options = timeoutMs ? { timeoutMs } : {};
  const results = await runCases(resolvedHandlerPath, cases, options);
  const summary = summarize(results);

  console.log(JSON.stringify({ summary, results }, null, 2));

  if (summary.crash > 0 || summary.hang > 0 || summary['unexpected-success'] > 0) {
    process.exitCode = 1;
  }
}

async function main(argv) {
  const [, , command, ...rest] = argv;

  if (command === 'generate') {
    await runGenerate(rest[0]);
    return;
  }

  if (command === 'run') {
    await runRun(rest);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main(process.argv).catch((err) => {
  console.error(`Unexpected error: ${err.stack || err.message}`);
  process.exitCode = 1;
});
