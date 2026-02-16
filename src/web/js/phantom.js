'use strict';

window.connectPhantom = window.connectPhantom || (async function noopPhantom() {
  throw new Error('Phantom connector is unavailable.');
});
