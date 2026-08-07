'use strict';

/**
 * Runs inside a worker_thread, spawned by src/harness.js. Loads the target
 * handler module, invokes it with a single generated test-case value, and
 * reports back exactly one outcome message:
 *
 *   { type: 'success', result }                       - handler returned/resolved
 *   { type: 'reject', errorName, errorMessage }        - handler threw/rejected an Error
 *   { type: 'crash', errorName, errorMessage }         - handler crashed (uncaught async
 *                                                         exception, unhandled rejection,
 *                                                         non-Error throw, stack overflow,
 *                                                         or failure to load)
 *
 * A pending/blocking handler that never posts a message is treated as a
 * "hang" by the parent (src/harness.js), which enforces the timeout and
 * forcibly terminates this worker.
 */

const { parentPort, workerData } = require('worker_threads');

let settled = false;

function settle(message) {
  if (settled) return;
  settled = true;
  try {
    parentPort.postMessage(message);
  } catch {
    // Worker is being torn down; nothing more we can do.
  }
}

function isStackOverflow(err) {
  return err instanceof RangeError && /call stack/i.test(err.message || '');
}

// An exception thrown outside the try/catch below (e.g. from a detached
// setTimeout/callback) would otherwise crash the whole worker process
// silently. That is exactly the "crash" behavior this harness is meant to
// detect, so we surface it explicitly instead of letting the worker die.
process.on('uncaughtException', (err) => {
  settle({
    type: 'crash',
    errorName: (err && err.name) || 'UncaughtException',
    errorMessage: (err && err.message) || String(err),
  });
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  settle({
    type: 'crash',
    errorName: err.name || 'UnhandledRejection',
    errorMessage: err.message,
  });
});

function safeSerialize(value) {
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return String(value);
  }
}

(async () => {
  const { handlerPath, value } = workerData;

  let handlerModule;
  try {
    handlerModule = require(handlerPath);
  } catch (err) {
    settle({ type: 'crash', errorName: err.name || 'RequireError', errorMessage: err.message });
    return;
  }

  const handler =
    typeof handlerModule === 'function'
      ? handlerModule
      : handlerModule && typeof handlerModule.handler === 'function'
      ? handlerModule.handler
      : null;

  if (!handler) {
    settle({
      type: 'crash',
      errorName: 'InvalidHandler',
      errorMessage: 'Handler module must export a function, or an object with a "handler" function',
    });
    return;
  }

  try {
    const result = await handler(value);
    settle({ type: 'success', result: safeSerialize(result) });
  } catch (err) {
    if (err instanceof Error) {
      if (isStackOverflow(err)) {
        settle({ type: 'crash', errorName: err.name, errorMessage: err.message });
      } else {
        settle({ type: 'reject', errorName: err.name, errorMessage: err.message });
      }
    } else {
      settle({ type: 'crash', errorName: 'NonErrorThrow', errorMessage: String(err) });
    }
  }
})();
