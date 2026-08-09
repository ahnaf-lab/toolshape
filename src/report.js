'use strict';

/**
 * Report builder: turns a set of harness results into a structured report
 * object (suitable for `JSON.stringify` to a file or stdout) plus a short
 * human-readable pass/fail summary for terminal output.
 *
 * A run "passes" only if no case was classified 'crash', 'hang', or
 * 'unexpected-success' — the three classifications that mean the handler
 * did not fail safely.
 */

const UNSAFE_CLASSIFICATIONS = ['crash', 'hang', 'unexpected-success'];

/** True if a summary (as returned by harness.summarize) represents a passing run. */
function isPassingSummary(summary) {
  return UNSAFE_CLASSIFICATIONS.every((key) => (summary[key] || 0) === 0);
}

/**
 * Build a JSON-serializable report describing a full `run` invocation.
 * @param {{schemaPath: string, handlerPath: string, summary: object, results: object[], durationMs: number}} input
 */
function buildReport({ schemaPath, handlerPath, summary, results, durationMs }) {
  return {
    tool: 'toolshape',
    generatedAt: new Date().toISOString(),
    schema: schemaPath,
    handler: handlerPath,
    durationMs,
    pass: isPassingSummary(summary),
    summary,
    results,
  };
}

/** Render a short human-readable pass/fail summary for a report (as produced by buildReport). */
function formatSummary(report) {
  const lines = [];
  lines.push(`toolshape run: ${report.schema} + ${report.handler}`);
  lines.push('');
  lines.push(`  ${report.summary.total} case(s) run in ${report.durationMs}ms`);
  lines.push(`  safe-reject:         ${report.summary['safe-reject']}`);
  lines.push(`  success:             ${report.summary.success}`);
  lines.push(`  unexpected-success:  ${report.summary['unexpected-success']}`);
  lines.push(`  crash:               ${report.summary.crash}`);
  lines.push(`  hang:                ${report.summary.hang}`);
  lines.push('');

  if (report.pass) {
    lines.push('PASS — every case failed safely or succeeded as expected');
    return lines.join('\n');
  }

  const unsafe = report.results.filter((r) => UNSAFE_CLASSIFICATIONS.includes(r.classification));
  lines.push(`FAIL — ${unsafe.length} case(s) did not fail safely`);
  for (const r of unsafe) {
    lines.push(`  ${r.classification.padEnd(20)} ${r.name.padEnd(28)} ${r.description}`);
  }
  return lines.join('\n');
}

module.exports = { buildReport, formatSummary, isPassingSummary, UNSAFE_CLASSIFICATIONS };
