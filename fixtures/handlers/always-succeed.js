'use strict';

// A buggy handler that never validates its input: it always "succeeds",
// even for cases that should have been rejected. Used to exercise the
// 'unexpected-success' classification.
module.exports = function alwaysSucceed(input) {
  return { ok: true, echo: input };
};
