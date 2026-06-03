(function() {
  var WIDGET_ID = '6a200e851ebc591c2b76c8c5/1jq6jhfdn';
  var CHAT_URL = 'https://tawk.to/chat/' + WIDGET_ID;

  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = new Date();

  var s1 = document.createElement('script'),
      s0 = document.getElementsByTagName('script')[0];
  s1.async = true;
  s1.src = 'https://embed.tawk.to/' + WIDGET_ID;
  s1.charset = 'UTF-8';
  s1.setAttribute('crossorigin', 'anonymous');
  s0.parentNode.insertBefore(s1, s0);

  var style = document.createElement('style');
  style.textContent = '.tawk-min-container{display:none!important}';
  document.head.appendChild(style);

  var btn = document.createElement('div');
  btn.id = 'chatButton';
  btn.setAttribute('aria-label', 'Chat with us');
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;width:56px;height:56px;background:#e5383b;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:99999;box-shadow:0 4px 20px rgba(229,56,59,0.4);transition:transform .2s ease,box-shadow .2s ease;border:none;';
  btn.onmouseover = function() { this.style.transform = 'scale(1.1)'; this.style.boxShadow = '0 6px 28px rgba(229,56,59,0.6)'; };
  btn.onmouseout = function() { this.style.transform = 'scale(1)'; this.style.boxShadow = '0 4px 20px rgba(229,56,59,0.4)'; };
  btn.onclick = function() {
    var ta = window.Tawk_API;
    if (typeof ta !== 'undefined') {
      if (typeof ta.maximize === 'function') { ta.maximize(); return; }
      if (typeof ta.toggle === 'function') { ta.toggle(); return; }
      if (typeof ta.showWidget === 'function') { ta.showWidget(); return; }
    }
    var checkReady = setInterval(function() {
      if (typeof window.Tawk_API !== 'undefined') {
        var api = window.Tawk_API;
        if (typeof api.maximize === 'function') { api.maximize(); clearInterval(checkReady); return; }
        if (typeof api.toggle === 'function') { api.toggle(); clearInterval(checkReady); return; }
        if (typeof api.showWidget === 'function') { api.showWidget(); clearInterval(checkReady); return; }
      }
    }, 200);
    setTimeout(function() {
      clearInterval(checkReady);
      window.open(CHAT_URL, '_blank', 'noopener,noreferrer');
    }, 5000);
  };
  btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>';

  var appInterval = setInterval(function() {
    if (document.body) { document.body.appendChild(btn); clearInterval(appInterval); }
  }, 50);
})();
