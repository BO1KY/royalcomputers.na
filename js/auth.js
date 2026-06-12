window.RoyalAuth = (function () {
  var listeners = [];
  var currentUser = null;

  function getToken() {
    return localStorage.getItem('user_token') || null;
  }

  function setToken(token) {
    if (token) localStorage.setItem('user_token', token);
    else localStorage.removeItem('user_token');
  }

  function getUser() {
    return currentUser || null;
  }

  function isSignedIn() {
    return !!getToken();
  }

  function notify(user) {
    currentUser = user;
    listeners.forEach(function (fn) { fn(user); });
  }

  function onAuthChange(fn) {
    listeners.push(fn);
    if (currentUser) fn(currentUser);
  }

  function login(email, password) {
    return fetch('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Login failed'); });
      return r.json();
    }).then(function (d) {
      if (d.token) setToken(d.token);
      notify(d.user || { email: email });
      return d;
    });
  }

  function register(data) {
    return fetch('/api/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Registration failed'); });
      return r.json();
    }).then(function (d) {
      if (d.token) setToken(d.token);
      notify(d.user || { email: data.email });
      return d;
    });
  }

  function logout() {
    setToken(null);
    currentUser = null;
    notify(null);
    return fetch('/api/user/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() } }).catch(function () {});
  }

  function fetchWithAuth(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    var token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, opts);
  }

  function loadProfile() {
    var token = getToken();
    if (!token) return Promise.resolve(null);
    return fetch('/api/user/profile', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && d.success) { notify(d.user); return d.user; }
      return null;
    }).catch(function () { return null; });
  }

  return {
    login: login,
    register: register,
    logout: logout,
    getToken: getToken,
    isSignedIn: isSignedIn,
    getUser: getUser,
    onAuthChange: onAuthChange,
    fetchWithAuth: fetchWithAuth,
    loadProfile: loadProfile
  };
})();

// Auto-load profile on page load if token exists
if (localStorage.getItem('user_token')) {
  (function () {
    window.RoyalAuth.loadProfile();
  })();
}
