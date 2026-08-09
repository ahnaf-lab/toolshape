#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { generateCases } = require('../src/generator');
const { runCases, summarize } = require('../src/harness');
const { buildReport, formatSummary } = require('../src/report');
const { buildBaseline, compareBaseline, formatBaselineDiff } = require('../src/baseline');

function printUsage() {
  console.error('Usage:');
  console.error('  toolshape generate <schema.json>');
  console.error(
    '  toolshape run <schema.json> <handler.js> [--timeout=ms] [--report=path.json] [--json]' +
      ' [--baseline=path.json] [--update-baseline]'
  );
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
  const reportArg = args.find((a) => a.startsWith('--report='));
  const reportPath = reportArg ? reportArg.slice('--report='.length) : undefined;
  const asJson = args.includes('--json');
  const baselineArg = args.find((a) => a.startsWith('--baseline='));
  const baselinePath = baselineArg ? baselineArg.slice('--baseline='.length) : undefined;
  const updateBaseline = args.includes('--update-baseline');

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
  const start = Date.now();
  const results = await runCases(resolvedHandlerPath, cases, options);
  const durationMs = Date.now() - start;
  const summary = summarize(results);
  const report = buildReport({ schemaPath, handlerPath, summary, results, durationMs });

  let baselineDiff;
  if (baselinePath) {
    const resolvedBaselinePath = path.resolve(process.cwd(), baselinePath);
    if (fs.existsSync(resolvedBaselinePath)) {
      let previousBaseline;
      try {
        previousBaseline = JSON.parse(fs.readFileSync(resolvedBaselinePath, 'utf8'));
      } catch (err) {
        console.error(`Failed to read baseline at ${baselinePath}: ${err.message}`);
        process.exitCode = 1;
        return;
      }
      baselineDiff = compareBaseline(previousBaseline, results);
      report.baselineDiff = baselineDiff;
      if (updateBaseline) {
        fs.writeFileSync(resolvedBaselinePath, JSON.stringify(buildBaseline(report), null, 2));
      }
    } else {
      fs.writeFileSync(resolvedBaselinePath, JSON.stringify(buildBaseline(report), null, 2));
      console.error(`No baseline found — created one at ${baselinePath} from ${results.length} case(s).`);
    }
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatSummary(report));
    if (baselineDiff) {
      console.log('');
      console.log(formatBaselineDiff(baselineDiff, baselinePath));
    }
  }

  if (reportPath) {
    const resolvedReportPath = path.resolve(process.cwd(), reportPath);
    fs.writeFileSync(resolvedReportPath, JSON.stringify(report, null, 2));
    console.error(`Report written to ${reportPath}`);
  }

  if (!report.pass) {
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
