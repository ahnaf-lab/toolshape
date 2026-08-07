'use strict';

// A buggy handler with unbounded recursion. Used to exercise the 'crash'
// classification for stack overflows (as opposed to intentional validation
// errors, which are also thrown Errors but are classified 'safe-reject').
function recurse(x) {
  return recurse(x) + 1;
}

module.exports = function crashStackOverflow(input) {
  return recurse(input);
};
