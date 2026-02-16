'use strict';

window.connectBackpack = window.connectBackpack || (async function noopBackpack() {
  throw new Error('Backpack connector is unavailable.');
});
