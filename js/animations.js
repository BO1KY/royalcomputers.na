/**
 * ──────────────────────────────────────────────────────────────────
 * ANIMATIONS INITIALIZATION MODULE
 * ──────────────────────────────────────────────────────────────────
 * 
 * Complete animation system for Royal Computers website
 * Includes: scroll reveals, header shadows, nav effects, buttons,
 * cards, grids, FAQ, counters, forms, lazy loading, and more
 */

// ──────────────────────────────────────────────────────────────────
// ANIMATION 1: SCROLL REVEAL (FADE-UP)
// ──────────────────────────────────────────────────────────────────

function initScrollAnimations() {
  const revealElements = document.querySelectorAll('.reveal');
  if (!revealElements.length) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        observer.unobserve(entry.target); // One-time only
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });
  
  revealElements.forEach(el => observer.observe(el));
}

// ──────────────────────────────────────────────────────────────────
// ANIMATION 2: HEADER SCROLL SHADOW
// ──────────────────────────────────────────────────────────────────

function initHeaderScroll() {
  const header = document.querySelector('header');
  if (!header) return;
  
  let ticking = false;
  
  function updateHeader() {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    ticking = false;
  }
  
  window.addEventListener('scroll', function() {
    if (!ticking) {
      requestAnimationFrame(updateHeader);
      ticking = true;
    }
  });
}

// ──────────────────────────────────────────────────────────────────
// ANIMATION 3: NAV LINK UNDERLINE
// (Already implemented in your existing header CSS)
// No additional JS needed
// ──────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────
// ANIMATION 4: BUTTON HOVER LIFT
// (Implemented via CSS .btn classes)
// No additional JS needed
// ──────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────
// ANIMATION 5: CARD HOVER LIFT
// (Implemented via CSS .card class)
// No additional JS needed
// ──────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────
// ANIMATION 6: COLOUR GRID / SERVICE GRID HOVER
// (Implemented via CSS .colour-grid classes)
// No additional JS needed
// ──────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────
// ANIMATION 7: FAQ ACCORDION
// ──────────────────────────────────────────────────────────────────

function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  if (!faqItems.length) return;
  
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    
    if (question) {
      question.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        
        // Close all others (accordion behavior)
        faqItems.forEach(other => {
          other.classList.remove('active');
        });
        
        // Toggle current
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });
}

// ──────────────────────────────────────────────────────────────────
// ANIMATION 8: COUNTER ANIMATION
// ──────────────────────────────────────────────────────────────────

function animateCounter(element, target, duration = 2000) {
  let start = 0;
  const increment = target / (duration / 16); // 60fps
  
  function updateCounter() {
    start += increment;
    if (start < target) {
      element.textContent = Math.floor(start).toLocaleString();
      requestAnimationFrame(updateCounter);
    } else {
      element.textContent = target.toLocaleString();
    }
  }
  
  updateCounter();
}

function initCounters() {
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.dataset.count, 10);
        if (!isNaN(target)) {
          animateCounter(entry.target, target);
          counterObserver.unobserve(entry.target); // One-time only
        }
      }
    });
  }, { threshold: 0.5 });
  
  document.querySelectorAll('[data-count]').forEach(counter => {
    counterObserver.observe(counter);
  });
}

// ──────────────────────────────────────────────────────────────────
// ANIMATION 9: BACK-TO-TOP BUTTON
// ──────────────────────────────────────────────────────────────────

function initBackToTop() {
  const backToTop = document.createElement('button');
  backToTop.className = 'back-to-top';
  backToTop.innerHTML = '<i class="fas fa-arrow-up"></i>';
  backToTop.setAttribute('aria-label', 'Back to top');
  
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  document.body.appendChild(backToTop);
  
  window.addEventListener('scroll', () => {
    if (window.scrollY > 500) {
      backToTop.classList.add('visible');
    } else {
      backToTop.classList.remove('visible');
    }
  });
}

// ──────────────────────────────────────────────────────────────────
// ANIMATION 10: COOKIE CONSENT BANNER
// ──────────────────────────────────────────────────────────────────

function initCookieBanner() {
  const banner = document.querySelector('.cookie-banner');
  const acceptBtn = document.querySelector('.cookie-accept');
  const declineBtn = document.querySelector('.cookie-decline');
  
  if (!banner) return;
  
  const cookieChoice = localStorage.getItem('cookieConsent');
  
  if (!cookieChoice) {
    setTimeout(() => {
      banner.classList.add('active');
    }, 2000);
  }
  
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      localStorage.setItem('cookieConsent', 'accepted');
      banner.classList.remove('active');
    });
  }
  
  if (declineBtn) {
    declineBtn.addEventListener('click', () => {
      localStorage.setItem('cookieConsent', 'declined');
      banner.classList.remove('active');
    });
  }
}

// ──────────────────────────────────────────────────────────────────
// MOBILE HAMBURGER MENU
// ──────────────────────────────────────────────────────────────────

function initMobileMenu() {
  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('nav ul');
  
  if (!toggle || !nav) return;
  
  toggle.addEventListener('click', function() {
    this.classList.toggle('active');
    nav.classList.toggle('active');
    document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
  });
  
  // Close on link click
  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      toggle.classList.remove('active');
      nav.classList.remove('active');
      document.body.style.overflow = '';
    });
  });
}

// ──────────────────────────────────────────────────────────────────
// ANIMATION 13: SMOOTH SCROLL WITH OFFSET
// ──────────────────────────────────────────────────────────────────

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const headerOffset = 80; // Adjust to your header height
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// ──────────────────────────────────────────────────────────────────
// ANIMATION 14: FORM VALIDATION
// ──────────────────────────────────────────────────────────────────

function showFormError(field, message) {
  const error = document.createElement('span');
  error.className = 'form-error';
  error.textContent = message;
  field.parentElement.appendChild(error);
}

function showFormSuccess(form, message) {
  const successMsg = document.createElement('div');
  successMsg.className = 'form-success';
  successMsg.innerHTML = '<i class="fas fa-check-circle"></i> ' + message;
  
  const existingSuccess = form.querySelector('.form-success');
  if (existingSuccess) existingSuccess.remove();
  
  form.appendChild(successMsg);
  setTimeout(() => successMsg.remove(), 5000);
}

function initFormValidation() {
  const forms = document.querySelectorAll('form[data-validate]');
  if (!forms.length) return;
  
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      
      let isValid = true;
      const requiredFields = form.querySelectorAll('[required]');
      
      requiredFields.forEach(field => {
        // Remove old errors
        const existingError = field.parentElement.querySelector('.form-error');
        if (existingError) existingError.remove();
        field.classList.remove('error');
        
        // Check empty
        if (!field.value.trim()) {
          isValid = false;
          field.classList.add('error');
          showFormError(field, 'This field is required');
        }
        
        // Check email format
        if (field.type === 'email' && field.value) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(field.value)) {
            isValid = false;
            field.classList.add('error');
            showFormError(field, 'Please enter a valid email address');
          }
        }
      });
      
      if (isValid) {
        showFormSuccess(form, 'Thank you! Your message has been sent successfully.');
        form.reset();
      }
    });
  });
}

// ──────────────────────────────────────────────────────────────────
// ANIMATION 15: LAZY LOADING IMAGES
// ──────────────────────────────────────────────────────────────────

function initLazyLoading() {
  const lazyImages = document.querySelectorAll('img[data-src]');
  
  if (!lazyImages.length) return;
  
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        img.classList.add('loaded');
        imageObserver.unobserve(img);
      }
    });
  }, {
    rootMargin: '50px 0px'
  });
  
  lazyImages.forEach(img => imageObserver.observe(img));
}

// ──────────────────────────────────────────────────────────────────
// ANIMATION 16: SPOTLIGHT BACKGROUND
// ──────────────────────────────────────────────────────────────────

function initSpotlightBackground() {
  if (document.querySelector('.spotlight-container-global')) return;

  const spotlightContainer = document.createElement('div');
  spotlightContainer.className = 'spotlight-container-global';
  
  const spotlightOverlay = document.createElement('div');
  spotlightOverlay.className = 'spotlight-overlay-global';
  
  const leftSpotlight = document.createElement('div');
  leftSpotlight.className = 'spotlight-global spotlight-left-global';
  
  const midSpotlight = document.createElement('div');
  midSpotlight.className = 'spotlight-global spotlight-mid-global';
  
  const rightSpotlight = document.createElement('div');
  rightSpotlight.className = 'spotlight-global spotlight-right-global';
  
  spotlightOverlay.appendChild(leftSpotlight);
  spotlightOverlay.appendChild(midSpotlight);
  spotlightOverlay.appendChild(rightSpotlight);
  spotlightContainer.appendChild(spotlightOverlay);
  
  document.body.prepend(spotlightContainer);
}

// ──────────────────────────────────────────────────────────────────
// MASTER INITIALIZATION
// ──────────────────────────────────────────────────────────────────
// Run all animations on page load

document.addEventListener('DOMContentLoaded', function() {
  console.log('[Animations] Initializing animation system...');
  
  initSpotlightBackground(); // Animation 16 (Prepend to body)
  initHeaderScroll();      // Animation 2
  // initMobileMenu();     // Disabled — handled by mobile-nav.js
  initScrollAnimations();  // Animation 1
  initCookieBanner();      // Animation 10
  initFAQ();               // Animation 7
  initCounters();          // Animation 8
  initLazyLoading();       // Animation 15
  initFormValidation();    // Animation 14
  initSmoothScroll();      // Animation 13
  initBackToTop();         // Animation 9
  
  console.log('[Animations] All animations initialized successfully!');
});

// ──────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ──────────────────────────────────────────────────────────────────

/**
 * Manually trigger scroll reveal for specific element
 * Usage: revealElement(document.querySelector('.my-element'))
 */
function revealElement(element) {
  if (element) {
    element.classList.add('reveal');
    element.classList.add('active');
  }
}

/**
 * Manually trigger counter animation
 * Usage: manualCounter(document.querySelector('.stat-number'), 100)
 */
function manualCounter(element, target, duration = 2000) {
  if (element) {
    animateCounter(element, target, duration);
  }
}

/**
 * Scroll to specific element with offset
 * Usage: smoothScrollTo('#section-id')
 */
function smoothScrollTo(selector) {
  const target = document.querySelector(selector);
  if (target) {
    const headerOffset = 80;
    const elementPosition = target.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
    
    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  }
}

/**
 * Toggle dark mode manually
 * Usage: toggleDarkMode()
 */
function toggleDarkMode() {
  const toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.click();
  }
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initScrollAnimations,
    initHeaderScroll,
    initFAQ,
    initCounters,
    initBackToTop,
    initCookieBanner,
    initMobileMenu,
    initSmoothScroll,
    initFormValidation,
    initLazyLoading,
    revealElement,
    manualCounter,
    smoothScrollTo,
    toggleDarkMode
  };
}
