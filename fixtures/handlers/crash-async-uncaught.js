'use strict';

// A buggy handler that schedules work outside the promise it returns, then
// throws from inside that detached callback. This would crash a real Node
// process (uncaught exception). Used to exercise the 'crash' classification
// for asynchronous, unhandled failures.
module.exports = function crashAsyncUncaught() {
  setTimeout(() => {
    throw new Error('boom: async failure outside the handler promise');
  }, 10);
  return new Promise(() => {}); // never resolves on its own
};
