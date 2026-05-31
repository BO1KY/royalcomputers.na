/**
 * mobile-nav.js — Royal Computers Namibia
 * Handles the hamburger menu open/close on mobile.
 * Improvements over original:
 *   • Closes on outside-tap (touching the dimmed nav overlay)
 *   • Closes on Escape key
 *   • Guards against missing DOM elements gracefully
 */
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('mobileToggle');
  var nav = document.querySelector('header nav');
  if (!toggle || !nav) return;

  function openNav() {
    nav.classList.add('mobile-open');
    toggle.classList.add('active');
    document.body.classList.add('no-scroll');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeNav() {
    nav.classList.remove('mobile-open');
    toggle.classList.remove('active');
    document.body.classList.remove('no-scroll');
    toggle.setAttribute('aria-expanded', 'false');
  }

  // Toggle on hamburger click
  toggle.addEventListener('click', function () {
    if (nav.classList.contains('mobile-open')) {
      closeNav();
    } else {
      openNav();
    }
  });

  // Close when a nav link is tapped
  nav.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeNav);
  });

  // Close button inside the nav overlay
  var closeBtn = nav.querySelector('.nav-close');
  if (closeBtn) closeBtn.addEventListener('click', closeNav);

  // Close on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('mobile-open')) {
      closeNav();
      toggle.focus();
    }
  });

  // Close when tapping the dimmed overlay area of the nav itself
  // (the nav is full-screen, so clicks on the background come from
  //  the nav element itself — not its child <ul>)
  nav.addEventListener('click', function (e) {
    if (e.target === nav) closeNav();
  });
});
