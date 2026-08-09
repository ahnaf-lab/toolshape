'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'cli.js');
const schema = (name) => path.join(ROOT, 'fixtures', 'schemas', name);
const handler = (name) => path.join(ROOT, 'fixtures', 'handlers', name);

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8' });
  return result;
}

function tmpReportPath() {
  return path.join(os.tmpdir(), `toolshape-report-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test('generate: prints a JSON array of cases for a fixture schema', () => {
  const result = runCli(['generate', schema('greeting.json')]);
  assert.equal(result.status, 0);
  const cases = JSON.parse(result.stdout);
  assert.ok(Array.isArray(cases));
  assert.ok(cases.length > 5, 'expected multiple generated cases');
  assert.ok(cases.every((c) => typeof c.name === 'string' && typeof c.category === 'string'));
});

test('run: a well-behaved handler (always-reject) passes with exit code 0 and a PASS summary', () => {
  const result = runCli(['run', schema('greeting.json'), handler('always-reject.js')]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS/);
  assert.match(result.stdout, /toolshape run:/);
});

test('run: a buggy handler (buggy-search) fails with exit code 1 and reports unexpected-success', () => {
  const result = runCli(['run', schema('search.json'), handler('buggy-search.js'), '--json']);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.pass, false);
  assert.ok(report.summary['unexpected-success'] > 0);
  const wrongTypeLimit = report.results.find((r) => r.name === 'wrong-type-limit');
  assert.ok(wrongTypeLimit, 'expected a wrong-type-limit case in the report');
  assert.equal(wrongTypeLimit.classification, 'unexpected-success');
});

test('run: a crashing handler fails and is classified crash', () => {
  const result = runCli(['run', schema('greeting.json'), handler('crash-non-error-throw.js'), '--json']);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.pass, false);
  assert.ok(report.summary.crash > 0);
});

test('run: a hanging handler is forcibly terminated and classified hang', () => {
  const result = runCli(['run', schema('greeting.json'), handler('hang-infinite-loop.js'), '--timeout=150', '--json']);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.pass, false);
  assert.ok(report.summary.hang > 0);
});

test('run --report writes a JSON report file with summary, pass flag, and per-case results', () => {
  const reportPath = tmpReportPath();
  try {
    const result = runCli(['run', schema('greeting.json'), handler('always-succeed.js'), `--report=${reportPath}`]);
    assert.equal(result.status, 1);
    assert.ok(fs.existsSync(reportPath), 'expected report file to be written');

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.tool, 'toolshape');
    assert.equal(report.pass, false);
    assert.equal(typeof report.generatedAt, 'string');
    assert.equal(typeof report.durationMs, 'number');
    assert.equal(report.summary.total, report.results.length);
    assert.ok(report.results.length > 0);
  } finally {
    fs.rmSync(reportPath, { force: true });
  }
});

test('run: missing arguments prints usage and exits non-zero', () => {
  const result = runCli(['run', schema('greeting.json')]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});

test('run --baseline: with no existing baseline file, bootstraps one and reports it on stderr', () => {
  const baselinePath = tmpReportPath();
  try {
    assert.ok(!fs.existsSync(baselinePath));
    const result = runCli(['run', schema('greeting.json'), handler('always-reject.js'), `--baseline=${baselinePath}`]);
    assert.equal(result.status, 0);
    assert.match(result.stderr, /No baseline found/);
    assert.ok(fs.existsSync(baselinePath), 'expected baseline file to be created');

    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    assert.equal(baseline.tool, 'toolshape');
    assert.ok(Object.keys(baseline.cases).length > 0);
  } finally {
    fs.rmSync(baselinePath, { force: true });
  }
});

test('run --baseline: against an existing baseline, prints a diff with no regressions for an unchanged handler', () => {
  const baselinePath = tmpReportPath();
  try {
    runCli(['run', schema('greeting.json'), handler('always-reject.js'), `--baseline=${baselinePath}`]);
    const second = runCli(['run', schema('greeting.json'), handler('always-reject.js'), `--baseline=${baselinePath}`]);
    assert.equal(second.status, 0);
    assert.match(second.stdout, /baseline:/);
    assert.doesNotMatch(second.stdout, /REGRESSION/);
  } finally {
    fs.rmSync(baselinePath, { force: true });
  }
});

test('run --baseline: flags a REGRESSION when a case flips from safe to unsafe between runs', () => {
  const baselinePath = tmpReportPath();
  try {
    runCli(['run', schema('search.json'), handler('always-reject.js'), `--baseline=${baselinePath}`]);
    const second = runCli(['run', schema('search.json'), handler('buggy-search.js'), `--baseline=${baselinePath}`, '--json']);
    assert.equal(second.status, 1);
    const report = JSON.parse(second.stdout);
    assert.ok(report.baselineDiff);
    assert.equal(report.baselineDiff.hasRegressions, true);
    assert.ok(report.baselineDiff.newlyUnsafe.length > 0);
  } finally {
    fs.rmSync(baselinePath, { force: true });
  }
});

test('run --baseline --update-baseline: overwrites the saved baseline with the current run', () => {
  const baselinePath = tmpReportPath();
  try {
    runCli(['run', schema('greeting.json'), handler('always-reject.js'), `--baseline=${baselinePath}`]);
    const before = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

    runCli(['run', schema('greeting.json'), handler('always-reject.js'), `--baseline=${baselinePath}`, '--update-baseline']);
    const after = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

    assert.notEqual(before.savedAt, after.savedAt);
    assert.deepEqual(after.cases, before.cases);
  } finally {
    fs.rmSync(baselinePath, { force: true });
  }
});
