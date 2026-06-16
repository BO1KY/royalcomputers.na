document.addEventListener('DOMContentLoaded', function () {
  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var href = this.getAttribute('href');
      if (!href || href === '#') return;
      e.preventDefault();
      var target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Navbar background on scroll
  window.addEventListener('scroll', function () {
    var navbar = document.querySelector('.navbar');
    if (navbar) {
      navbar.style.background =
        window.scrollY > 100
          ? 'rgba(10, 10, 10, 0.95)'
          : 'rgba(10, 10, 10, 0.8)';
    }
  });

  // Contact form delegated to page-specific handler (e.g., handleContactSubmit)
  // Newsletter form delegated to newsletter.js
});
