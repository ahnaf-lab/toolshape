'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBaseline, compareBaseline, formatBaselineDiff } = require('../src/baseline');

function mkReport(results) {
  return { schema: 's.json', handler: 'h.js', results };
}

test('buildBaseline: maps each result name to its classification', () => {
  const report = mkReport([
    { name: 'valid-typical', classification: 'success' },
    { name: 'invalid-wrong-type-number', classification: 'safe-reject' },
  ]);
  const baseline = buildBaseline(report);
  assert.equal(baseline.tool, 'toolshape');
  assert.equal(baseline.schema, 's.json');
  assert.deepEqual(baseline.cases, {
    'valid-typical': 'success',
    'invalid-wrong-type-number': 'safe-reject',
  });
});

test('compareBaseline: flags a case that flipped from safe to unsafe as a regression', () => {
  const baseline = { cases: { 'invalid-oversized': 'safe-reject' } };
  const results = [{ name: 'invalid-oversized', classification: 'crash' }];
  const diff = compareBaseline(baseline, results);
  assert.equal(diff.hasRegressions, true);
  assert.equal(diff.newlyUnsafe.length, 1);
  assert.equal(diff.newlyUnsafe[0].name, 'invalid-oversized');
  assert.equal(diff.newlyUnsafe[0].from, 'safe-reject');
  assert.equal(diff.newlyUnsafe[0].to, 'crash');
});

test('compareBaseline: flags a case that flipped from unsafe to safe as newly-safe, not a regression', () => {
  const baseline = { cases: { 'invalid-huge': 'hang' } };
  const results = [{ name: 'invalid-huge', classification: 'safe-reject' }];
  const diff = compareBaseline(baseline, results);
  assert.equal(diff.hasRegressions, false);
  assert.equal(diff.newlySafe.length, 1);
  assert.equal(diff.newlySafe[0].to, 'safe-reject');
});

test('compareBaseline: counts unchanged cases and leaves them out of newlyUnsafe/newlySafe', () => {
  const baseline = { cases: { 'valid-typical': 'success', 'invalid-wrong-type': 'safe-reject' } };
  const results = [
    { name: 'valid-typical', classification: 'success' },
    { name: 'invalid-wrong-type', classification: 'safe-reject' },
  ];
  const diff = compareBaseline(baseline, results);
  assert.equal(diff.unchanged, 2);
  assert.equal(diff.newlyUnsafe.length, 0);
  assert.equal(diff.newlySafe.length, 0);
  assert.equal(diff.hasRegressions, false);
});

test('compareBaseline: reports cases present only in current results as added', () => {
  const baseline = { cases: { 'valid-typical': 'success' } };
  const results = [
    { name: 'valid-typical', classification: 'success' },
    { name: 'invalid-new-field', classification: 'safe-reject' },
  ];
  const diff = compareBaseline(baseline, results);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].name, 'invalid-new-field');
  assert.equal(diff.removed.length, 0);
});

test('compareBaseline: reports cases present only in the baseline as removed', () => {
  const baseline = { cases: { 'valid-typical': 'success', 'invalid-old-field': 'safe-reject' } };
  const results = [{ name: 'valid-typical', classification: 'success' }];
  const diff = compareBaseline(baseline, results);
  assert.equal(diff.removed.length, 1);
  assert.equal(diff.removed[0].name, 'invalid-old-field');
});

test('compareBaseline: an empty/missing baseline treats every case as added, never a regression', () => {
  const results = [{ name: 'valid-typical', classification: 'success' }];
  const diff = compareBaseline({}, results);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.hasRegressions, false);
});

test('formatBaselineDiff: mentions the baseline path and flags a regression prominently', () => {
  const diff = compareBaseline(
    { cases: { 'invalid-oversized': 'safe-reject' } },
    [{ name: 'invalid-oversized', classification: 'crash' }]
  );
  const text = formatBaselineDiff(diff, 'baseline.json');
  assert.match(text, /baseline\.json/);
  assert.match(text, /REGRESSION/);
  assert.match(text, /invalid-oversized/);
});
