'use strict';

// A semi-realistic handler for a "search" tool with two known bugs:
//   1. It never checks that `query` is even a string before calling
//      `.toUpperCase()` on it, so a wrong-type `query` throws a TypeError
//      instead of a clean validation error (still classified 'safe-reject',
//      since the throw is caught and controlled, but a real contract test
//      run would flag the low-quality error message).
//   2. It never checks `limit` bounds at all, so out-of-range/oversized
//      `limit` values are silently accepted ('unexpected-success').
module.exports = function buggySearch(input) {
  const normalizedQuery = input.query.toUpperCase();
  const limit = typeof input.limit === 'number' ? input.limit : 10;
  return { ok: true, query: normalizedQuery, limit };
};
