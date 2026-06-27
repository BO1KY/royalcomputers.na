(function(){
  var STORAGE_KEY = "newsletter_subscribers";
  var API_BASE = window.RC_API_BASE || "";
  var SUBSCRIBE_URL = API_BASE + "/api/subscribe";
  var CSRF_URL = API_BASE + "/api/csrf-token";
  var SUBSCRIBED_KEY = "nl_subscribed";

  function closeOverlay() {
    try { localStorage.setItem(SUBSCRIBED_KEY, "true"); } catch(e) {}
    var overlay = document.getElementById("newsletterOverlay");
    if (overlay) overlay.classList.remove("open");
  }

  function getStored() {
    try { var d = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(d) ? d : []; } catch(e) { return []; }
  }

  function setStored(val) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)); } catch(e) {}
  }

  function fetchCsrfToken() {
    return fetch(CSRF_URL).then(function(r) { return r.json(); }).then(function(d) { return d.csrfToken; });
  }

  function subscribe(email, csrfToken) {
    return fetch(SUBSCRIBE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ email: email })
    }).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data.error || "Subscription failed");
        return data;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function() {
    var btn = document.getElementById("nlSubscribeBtn");
    var input = document.getElementById("nlEmail");
    if (!btn || !input) return;

    btn.addEventListener("click", function() {
      var email = input.value.trim();
      if (!email) { alert("Please enter your email address."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert("Please enter a valid email address."); return; }

      btn.disabled = true;
      btn.textContent = "Subscribing...";

      fetchCsrfToken().then(function(token) {
        return subscribe(email, token);
      }).then(function() {
        closeOverlay();
        alert("Thank you for subscribing!");
        input.value = "";
        btn.textContent = "Subscribe";
        btn.disabled = false;
      }).catch(function(err) {
        btn.textContent = "Subscribe";
        btn.disabled = false;
        if (err && err.message === "Already subscribed") {
          closeOverlay();
          alert("You are already subscribed!");
          return;
        }
        alert(err && err.message || "Subscription failed. Please try again later.");
      });
    });
  });
})();
