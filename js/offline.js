(function () {
  var overlay = document.getElementById('offlineOverlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'offlineOverlay';
    overlay.className = 'offline-overlay';
    overlay.innerHTML =
      '<div class="offline-box">' +
        '<span class="offline-icon">📡</span>' +
        '<h2 class="offline-title">You\'re Offline</h2>' +
        '<p class="offline-status" id="offlineStatus">No internet connection</p>' +
        '<button class="offline-btn" id="offlineRetryBtn">Try Again</button>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  var toast = document.getElementById('offlineToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'offlineToast';
    toast.className = 'offline-toast';
    document.body.appendChild(toast);
  }

  var tryBtn = document.getElementById('offlineRetryBtn');
  var statusEl = document.getElementById('offlineStatus');
  var toastTimer = null;

  function showToast(message, isOnline) {
    toast.textContent = message;
    toast.className = 'offline-toast' + (isOnline ? ' online' : ' offline');
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('visible');
    }, 4000);
  }

  function showOffline() {
    overlay.classList.add('visible');
    if (statusEl) statusEl.textContent = 'No internet connection';
    showToast('You are offline', false);
  }

  function hideOffline() {
    overlay.classList.remove('visible');
    showToast('Back online', true);
  }

  function checkConnection() {
    if (statusEl) statusEl.textContent = 'Checking...';
    if (tryBtn) tryBtn.disabled = true;

    var img = new Image();
    var timeout = setTimeout(function () {
      if (statusEl) statusEl.textContent = 'No internet connection';
      if (tryBtn) tryBtn.disabled = false;
    }, 5000);

    img.onload = function () {
      clearTimeout(timeout);
      hideOffline();
      if (tryBtn) tryBtn.disabled = false;
    };

    img.onerror = function () {
      clearTimeout(timeout);
      if (statusEl) statusEl.textContent = 'No internet connection';
      if (tryBtn) tryBtn.disabled = false;
    };

    img.src = 'https://www.google.com/favicon.ico?' + Date.now();
  }

  if (tryBtn) {
    tryBtn.addEventListener('click', checkConnection);
  }

  window.addEventListener('offline', showOffline);
  window.addEventListener('online', hideOffline);

  if (!navigator.onLine) {
    showOffline();
  }
})();
