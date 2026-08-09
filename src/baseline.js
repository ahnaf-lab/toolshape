'use strict';

/**
 * Baseline diffing: capture a snapshot of each case's classification from a
 * `run` report, then compare a later run's results against that snapshot.
 *
 * The pass/fail summary alone cannot tell you whether a `crash` case is new
 * or a known, already-accepted issue — it just fails every time. Baseline
 * diffing separates the two: it flags cases that flipped from safe
 * (`safe-reject`/`success`) to unsafe (`crash`/`hang`/`unexpected-success`)
 * as regressions, distinct from cases that were already unsafe.
 */

const { UNSAFE_CLASSIFICATIONS } = require('./report');

function isUnsafe(classification) {
  return UNSAFE_CLASSIFICATIONS.includes(classification);
}

/**
 * Build a baseline snapshot from a `run` report (as produced by buildReport).
 * @param {{schema: string, handler: string, results: Array<{name: string, classification: string}>}} report
 */
function buildBaseline(report) {
  const cases = {};
  for (const r of report.results) {
    cases[r.name] = r.classification;
  }
  return {
    tool: 'toolshape',
    kind: 'baseline',
    savedAt: new Date().toISOString(),
    schema: report.schema,
    handler: report.handler,
    cases,
  };
}

/**
 * Compare a saved baseline against a fresh set of harness results.
 * @param {{cases?: Object<string, string>}} baseline
 * @param {Array<{name: string, classification: string}>} results
 * @returns {{
 *   newlyUnsafe: Array<{name: string, from: string, to: string}>,
 *   newlySafe: Array<{name: string, from: string, to: string}>,
 *   added: Array<{name: string, classification: string}>,
 *   removed: Array<{name: string, classification: string}>,
 *   unchanged: number,
 *   hasRegressions: boolean,
 * }}
 */
function compareBaseline(baseline, results) {
  const baselineCases = (baseline && baseline.cases) || {};
  const currentNames = new Set(results.map((r) => r.name));

  const newlyUnsafe = [];
  const newlySafe = [];
  const added = [];
  const removed = [];
  let unchanged = 0;

  for (const r of results) {
    const prev = baselineCases[r.name];
    if (prev === undefined) {
      added.push({ name: r.name, classification: r.classification });
      continue;
    }
    const wasUnsafe = isUnsafe(prev);
    const isNowUnsafe = isUnsafe(r.classification);
    if (!wasUnsafe && isNowUnsafe) {
      newlyUnsafe.push({ name: r.name, from: prev, to: r.classification });
    } else if (wasUnsafe && !isNowUnsafe) {
      newlySafe.push({ name: r.name, from: prev, to: r.classification });
    } else {
      unchanged += 1;
    }
  }

  for (const name of Object.keys(baselineCases)) {
    if (!currentNames.has(name)) {
      removed.push({ name, classification: baselineCases[name] });
    }
  }

  return {
    newlyUnsafe,
    newlySafe,
    added,
    removed,
    unchanged,
    hasRegressions: newlyUnsafe.length > 0,
  };
}

/** Render a short human-readable summary of a baseline diff for terminal output. */
function formatBaselineDiff(diff, baselinePath) {
  const lines = [];
  lines.push(`baseline: ${baselinePath}`);
  lines.push(
    `  unchanged: ${diff.unchanged}  newly-unsafe: ${diff.newlyUnsafe.length}  ` +
      `newly-safe: ${diff.newlySafe.length}  added: ${diff.added.length}  removed: ${diff.removed.length}`
  );

  if (diff.newlyUnsafe.length > 0) {
    lines.push('');
    lines.push(`REGRESSION — ${diff.newlyUnsafe.length} case(s) newly unsafe since baseline:`);
    for (const c of diff.newlyUnsafe) {
      lines.push(`  ${c.name.padEnd(28)} ${c.from} -> ${c.to}`);
    }
  }

  if (diff.newlySafe.length > 0) {
    lines.push('');
    lines.push(`IMPROVED — ${diff.newlySafe.length} case(s) newly safe since baseline:`);
    for (const c of diff.newlySafe) {
      lines.push(`  ${c.name.padEnd(28)} ${c.from} -> ${c.to}`);
    }
  }

  return lines.join('\n');
}

module.exports = { buildBaseline, compareBaseline, formatBaselineDiff };
