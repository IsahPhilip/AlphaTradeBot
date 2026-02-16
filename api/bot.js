'use strict';

module.exports = async function botHandler(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Bot webhook endpoint is available. Use long polling mode by default.'
  });
};
