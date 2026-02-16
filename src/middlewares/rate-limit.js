'use strict';

const requestState = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;

function createRateLimit() {
  return (_req, res, next) => {
    const key = _req.ip || 'unknown';
    const now = Date.now();
    const state = requestState.get(key) || { count: 0, startedAt: now };

    if (now - state.startedAt > WINDOW_MS) {
      state.count = 0;
      state.startedAt = now;
    }

    state.count += 1;
    requestState.set(key, state);

    if (state.count > MAX_REQUESTS) {
      return res.status(429).json({ success: false, error: 'Too many requests' });
    }

    return next();
  };
}

module.exports = {
  createRateLimit
};
