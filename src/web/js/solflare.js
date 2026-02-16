'use strict';

window.connectSolflare = window.connectSolflare || (async function noopSolflare() {
  throw new Error('Solflare connector is unavailable.');
});
