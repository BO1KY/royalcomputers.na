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

  // Contact form fallback
  var contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      alert('Thank you for your message! We will get back to you soon.');
      this.reset();
    });
  }

  // Newsletter form fallback
  var newsletterForm = document.querySelector('.newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', function (e) {
      e.preventDefault();
      alert('Thank you for subscribing to our newsletter!');
      this.querySelector('input').value = '';
    });
  }
});
