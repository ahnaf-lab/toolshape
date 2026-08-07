'use strict';

// A buggy handler that blocks forever on bad input. Used to exercise the
// 'hang' classification and the harness's forced worker termination.
module.exports = function hangInfiniteLoop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // busy-loop; never returns, never yields to the event loop
  }
};
