(function() {
  var loader = document.getElementById('pageLoader');
  if (!loader) return;
  function hide() {
    loader.classList.add('hidden');
    setTimeout(function() { loader.style.display = 'none'; }, 600);
  }
  if (document.readyState === 'complete') {
    hide();
  } else {
    window.addEventListener('load', hide);
  }
})();
