(function () {
  var STORAGE_KEY = 'newsletter_subscribers';
  var BASE = window.RC_API_BASE || '';
  var API_URL = BASE + '/api/subscribe';

  var SUBSCRIBED_KEY = 'nl_subscribed';

  function markSubscribed() {
    try { localStorage.setItem(SUBSCRIBED_KEY, 'true'); } catch (_) {}
    var overlay = document.getElementById('newsletterOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  function getLocalSubscribers() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(data) ? data : [];
    } catch (_) { return []; }
  }

  function saveLocalSubscribers(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (_) {}
  }

  function subscribeToAPI(email) {
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) { throw new Error(err.error || 'Subscription failed'); });
      }
      return res.json();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('nlSubscribeBtn');
    var input = document.getElementById('nlEmail');
    if (!btn || !input) return;

    btn.addEventListener('click', function () {
      var email = input.value.trim();
      if (!email) { alert('Please enter your email address.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Please enter a valid email address.'); return; }

      btn.disabled = true;
      btn.textContent = 'Subscribing...';

      subscribeToAPI(email).then(function () {
        markSubscribed();
        alert('Thank you for subscribing!');
        input.value = '';
        btn.textContent = 'Subscribe';
        btn.disabled = false;
      }).catch(function (err) {
        if (err.message === 'Already subscribed') {
          markSubscribed();
          alert('You are already subscribed!');
        } else {
          markSubscribed();
          var list = getLocalSubscribers();
          if (list.indexOf(email) === -1) {
            list.push(email);
            saveLocalSubscribers(list);
          }
          alert('Thank you for subscribing!');
          input.value = '';
        }
        btn.textContent = 'Subscribe';
        btn.disabled = false;
      });
    });
  });
})();
