'use strict';

(function bootstrapWalletConnect() {
  const connectButton = document.querySelector('[data-connect-wallet]');

  if (!connectButton) {
    return;
  }

  connectButton.addEventListener('click', () => {
    const params = new URLSearchParams(window.location.search);
    window.location.href = `/connect-wallet?${params.toString()}`;
  });
})();
