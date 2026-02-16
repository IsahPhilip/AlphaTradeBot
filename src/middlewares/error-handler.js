'use strict';

function errorHandler(error, _req, res, _next) {
  console.error('Unhandled error:', error);
  res.status(500).json({ success: false, error: 'Internal server error' });
}

module.exports = {
  errorHandler
};
