'use strict';

/**
 * Handler harness: runs a JS handler function against generated test cases
 * inside a sandboxed worker thread with a timeout, and classifies the
 * outcome as one of:
 *
 *   - 'safe-reject'        the handler threw/rejected an Error in a
 *                          controlled way (caught, did not crash the process)
 *   - 'crash'               the handler crashed: an uncaught async exception,
 *                          unhandled promise rejection, non-Error throw,
 *                          stack overflow, or failure to load
 *   - 'hang'                the handler did not respond within the timeout
 *   - 'unexpected-success'  the handler returned successfully for a case
 *                          generated from the 'invalid' category (i.e. it
 *                          silently accepted input that should be rejected)
 *   - 'success'             the handler returned successfully for a case
 *                          generated from the 'valid'/'boundary' category
 *                          (the expected, healthy outcome)
 *
 * Each case runs in its own worker_thread so that even a truly blocking
 * handler (e.g. `while (true) {}`) can be forcibly terminated on timeout,
 * which a plain try/catch on the main thread cannot do.
 */

const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_PATH = path.join(__dirname, 'harness-worker.js');
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Run a single handler invocation inside a sandboxed worker thread.
 * @param {string} handlerPath - path to a module exporting a handler function.
 * @param {*} value - the input value to pass to the handler.
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<{outcome: 'success'|'reject'|'crash'|'hang', error: {name: string, message: string}|null, result: *, durationMs: number}>}
 */
function runHandler(handlerPath, value, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const resolvedHandlerPath = path.isAbsolute(handlerPath)
    ? handlerPath
    : path.resolve(process.cwd(), handlerPath);

  return new Promise((resolve) => {
    const start = Date.now();
    let done = false;
    let timer;

    const worker = new Worker(WORKER_PATH, {
      workerData: { handlerPath: resolvedHandlerPath, value },
    });

    function finish(msg) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      worker.removeAllListeners();
      worker.terminate().catch(() => {});
      resolve({
        outcome: msg.type,
        error: msg.errorMessage !== undefined ? { name: msg.errorName, message: msg.errorMessage } : null,
        result: msg.result,
        durationMs,
      });
    }

    timer = setTimeout(() => finish({ type: 'hang' }), timeoutMs);

    worker.on('message', (msg) => finish(msg));
    worker.on('error', (err) => finish({ type: 'crash', errorName: err.name, errorMessage: err.message }));
    worker.on('exit', (code) => {
      if (!done) {
        finish({
          type: 'crash',
          errorName: 'WorkerExited',
          errorMessage: `worker exited with code ${code} before reporting a result`,
        });
      }
    });
  });
}

/**
 * Map a raw run outcome to a safety classification, given the generated
 * case's category ('valid' | 'boundary' | 'invalid').
 */
function classify(runResult, category) {
  switch (runResult.outcome) {
    case 'hang':
      return 'hang';
    case 'crash':
      return 'crash';
    case 'reject':
      return 'safe-reject';
    case 'success':
      return category === 'invalid' ? 'unexpected-success' : 'success';
    default:
      return 'crash';
  }
}

/**
 * Run one generated test case against a handler and classify the result.
 * @param {string} handlerPath
 * @param {{name: string, category: string, value: *, description: string}} testCase
 * @param {{timeoutMs?: number}} [options]
 */
async function runCase(handlerPath, testCase, options = {}) {
  const runResult = await runHandler(handlerPath, testCase.value, options);
  const classification = classify(runResult, testCase.category);
  return { ...testCase, ...runResult, classification };
}

/**
 * Run a list of generated test cases against a handler, sequentially.
 * @param {string} handlerPath
 * @param {Array<{name: string, category: string, value: *, description: string}>} cases
 * @param {{timeoutMs?: number}} [options]
 */
async function runCases(handlerPath, cases, options = {}) {
  const results = [];
  for (const testCase of cases) {
    results.push(await runCase(handlerPath, testCase, options));
  }
  return results;
}

/** Tally classifications across a set of harness results. */
function summarize(results) {
  const summary = {
    total: results.length,
    'safe-reject': 0,
    crash: 0,
    hang: 0,
    'unexpected-success': 0,
    success: 0,
  };
  for (const r of results) {
    summary[r.classification] = (summary[r.classification] || 0) + 1;
  }
  return summary;
}

module.exports = { runHandler, runCase, runCases, classify, summarize, DEFAULT_TIMEOUT_MS };
