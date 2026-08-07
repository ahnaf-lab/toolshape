'use strict';

// A buggy handler that throws a plain string instead of an Error. Used to
// exercise the 'crash' classification for non-Error throws.
module.exports = function crashNonErrorThrow() {
  // eslint-disable-next-line no-throw-literal
  throw 'boom: something went wrong';
};
