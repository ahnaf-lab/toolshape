'use strict';

// A well-behaved handler: always rejects with a controlled Error, regardless
// of input. Used to exercise the 'safe-reject' classification.
module.exports = function alwaysReject() {
  throw new Error('rejected: input failed validation');
};
