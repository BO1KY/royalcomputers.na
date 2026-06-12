(function () {
  var API_BASE = window.RC_API_BASE || '';

  function getSetting(key, fallback) {
    return window.SITE_DATA &&
      window.SITE_DATA.settings &&
      window.SITE_DATA.settings[key] !== void 0 &&
      window.SITE_DATA.settings[key] !== ''
      ? window.SITE_DATA.settings[key]
      : fallback;
  }

  function getBranchImage(id, fallback) {
    if (window.SITE_DATA && window.SITE_DATA.branches) {
      for (var i = 0; i < window.SITE_DATA.branches.length; i++) {
        if (
          window.SITE_DATA.branches[i].id === id &&
          window.SITE_DATA.branches[i].image
        ) {
          return window.SITE_DATA.branches[i].image;
        }
      }
    }
    return fallback;
  }

  /**
   * Escape for HTML text content (escapes & < > " ')
   */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  /**
   * Escape for HTML attribute values (escapes " ')
   */
  function escapeAttr(str) {
    return String(str).replace(/["']/g, function (c) {
      return c === '"' ? '&quot;' : '&#039;';
    });
  }

  // ---------- Footer data ----------
  function renderFooter() {
    var map = {
      'site-footer-company': getSetting('footer_company_name', 'Royal Computers Namibia'),
      'site-footer-tagline': getSetting('footer_tagline', 'Leading the way in digital lifestyle'),
      'site-footer-address': getSetting('footer_address', 'GF Shop 12 Gustav Voigts Center, Independence Ave, Windhoek'),
      'site-footer-phone': getSetting('footer_phone', '061228179'),
      'site-footer-whatsapp': getSetting('footer_whatsapp', '+264813631483'),
      'site-footer-email': getSetting('footer_email', 'windhoek@netmac.co.za'),
      'site-footer-facebook': getSetting('footer_facebook_url', 'https://www.facebook.com/RoyalComputersNamibia/'),
      'site-footer-instagram': getSetting('footer_instagram_url', 'https://www.instagram.com/royalcomputernam/'),
      'site-footer-copyright': getSetting('footer_copyright', 'Copyright \u00A9 Royal Computers Namibia'),
      'site-hero-title': getSetting('hero_title', 'Royal Computers Namibia'),
      'site-hero-subtitle': getSetting('hero_subtitle', 'Leading the way in digital lifestyle'),
      'site-about-subtitle': getSetting('about_subtitle', 'Your trusted technology partner since 2005'),
    };

    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.value = map[id];
      } else if (el.tagName === 'A' && el.getAttribute('href')) {
        el.setAttribute('href', map[id]);
      } else {
        el.textContent = map[id];
      }
    });
  }

  // ---------- Categories ----------
  function renderCategories() {
    var container = document.getElementById('site-categories');
    if (!container || !window.SITE_DATA || !window.SITE_DATA.categories) return;

    container.innerHTML = window.SITE_DATA.categories
      .map(function (cat) {
        var link = cat.link || 'products.html?category=' + encodeURIComponent(cat.name);
        var imgHtml = cat.image
          ? '<div class="category-icon"><img src="' +
            escapeAttr(cat.image) +
            '" alt="' +
            escapeAttr(cat.name) +
            '" loading="lazy"></div>'
          : '';
        return (
          '<a href="' +
          escapeAttr(link) +
          '" class="category-card-link"><div class="category-card">' +
          imgHtml +
          '<h3>' +
          escapeHtml(cat.name) +
          '</h3>' +
          (cat.description ? '<p>' + escapeHtml(cat.description) + '</p>' : '') +
          '</div></a>'
        );
      })
      .join('');
  }

  // ---------- Services ----------
  function renderServices() {
    var container = document.getElementById('site-services');
    if (!container || !window.SITE_DATA || !window.SITE_DATA.services) return;

    container.innerHTML = window.SITE_DATA.services
      .map(function (svc) {
        var imgHtml = svc.image
          ? '<div class="service-img-wrap"><img src="' +
            escapeAttr(svc.image) +
            '" alt="' +
            escapeAttr(svc.name) +
            '" loading="lazy"></div>'
          : '';
        return '<div class="service-card">' + imgHtml + '<p>' + escapeHtml(svc.name) + '</p></div>';
      })
      .join('');
  }

  // ---------- Hero banners ----------
  function renderHeroBanners() {
    if (!window.SITE_DATA || !window.SITE_DATA.heroBanners || !window.SITE_DATA.heroBanners.length) return;

    var banners = window.SITE_DATA.heroBanners;
    var bg1 = document.getElementById('heroBg1');
    var bg2 = document.getElementById('heroBg2');
    if (!bg1 || !bg2) return;

    var titleEl = document.getElementById('site-hero-title');
    var subtitleEl = document.getElementById('site-hero-subtitle');
    if (titleEl) titleEl.textContent = getSetting('hero_title', 'Royal Computers Namibia');
    if (subtitleEl) subtitleEl.textContent = getSetting('hero_subtitle', 'Leading the way in digital lifestyle');

    var images = banners
      .map(function (b) {
        return b.image;
      })
      .filter(Boolean);
    if (!images.length) return;

    function setBg(el, url) {
      el.style.backgroundImage = 'url(' + url + ')';
    }

    var current = 0;
    var activeEl = bg1;
    var inactiveEl = bg2;

    // Preload images
    images.forEach(function (url) {
      var img = new Image();
      img.src = decodeURIComponent ? decodeURIComponent(url) : url;
    });

    function rotate() {
      current = (current + 1) % images.length;
      setBg(inactiveEl, images[current]);
      inactiveEl.classList.add('active');
      activeEl.classList.remove('active');
      var tmp = activeEl;
      activeEl = inactiveEl;
      inactiveEl = tmp;
    }

    setBg(bg1, images[0]);
    bg1.classList.add('active');
    setInterval(rotate, 7000);
  }

  // ---------- About section ----------
  function renderAbout() {
    if (!window.SITE_DATA) return;

    var subtitleEl = document.getElementById('site-about-subtitle');
    if (subtitleEl) subtitleEl.textContent = getSetting('about_subtitle', 'Your trusted technology partner since 2005');

    var whoEl = document.getElementById('site-who-we-are');
    if (whoEl && window.SITE_DATA.settings && window.SITE_DATA.settings.about_who_we_are) {
      whoEl.textContent = window.SITE_DATA.settings.about_who_we_are;
    }

    var statsEl = document.getElementById('site-about-stats');
    if (statsEl && window.SITE_DATA.aboutStats) {
      statsEl.innerHTML = window.SITE_DATA.aboutStats
        .map(function (stat) {
          return (
            '<div class="stat-card"><div class="stat-number">' +
            escapeHtml(stat.value) +
            '</div><div class="stat-label">' +
            escapeHtml(stat.label) +
            '</div></div>'
          );
        })
        .join('');
    }

    var valuesEl = document.getElementById('site-about-values');
    if (valuesEl && window.SITE_DATA.aboutValues) {
      valuesEl.innerHTML = window.SITE_DATA.aboutValues
        .map(function (val) {
          var iconHtml = val.icon
            ? '<div class="value-icon"><img src="' +
              escapeAttr(val.icon) +
              '" alt="' +
              escapeAttr(val.title) +
              '" class="value-img" loading="lazy"></div>'
            : '';
          return (
            '<div class="value-card">' +
            iconHtml +
            '<h3>' +
            escapeHtml(val.title) +
            '</h3><p>' +
            escapeHtml(val.description) +
            '</p></div>'
          );
        })
        .join('');
    }

    var faqsEl = document.getElementById('site-about-faqs');
    if (faqsEl && window.SITE_DATA.faqs) {
      faqsEl.innerHTML = window.SITE_DATA.faqs
        .map(function (faq) {
          return (
            '<div class="faq-item"><button class="faq-question" onclick="toggleFaq(this)">' +
            escapeHtml(faq.question) +
            ' <span class="faq-question-icon">&#9660;</span></button><div class="faq-answer"><div class="faq-answer-inner">' +
            escapeHtml(faq.answer) +
            '</div></div></div>'
          );
        })
        .join('');
    }
  }

  // ---------- Branches ----------
  function renderBranches() {
    if (!window.SITE_DATA || !window.SITE_DATA.branches) return;

    var homeBranches = document.getElementById('site-home-branches');
    if (homeBranches) {
      homeBranches.innerHTML = window.SITE_DATA.branches
        .map(function (b) {
          var img = b.image || '';
          var imgHtml = img
            ? '<div class="branch-img"><img src="' +
              escapeAttr(img) +
              '" alt="' +
              escapeAttr(b.city) +
              '" loading="lazy"></div>'
            : '';
          var hoursHtml = escapeHtml(b.hours || '').replace(/\|/g, '<br>');
          var hqLabel = b.is_headquarters ? ' (HQ)' : '';
          return (
            imgHtml +
            '<h3>' +
            escapeHtml(b.name.replace('Royal Computers - ', '')) +
            hqLabel +
            '</h3><div class="branch-address">' +
            escapeHtml(b.address) +
            '</div>' +
            (b.phone
              ? '<div class="branch-phone"><a href="tel:' +
                escapeAttr(b.phone) +
                '">' +
                escapeHtml(b.phone) +
                '</a></div>'
              : '') +
            (b.email
              ? '<div class="branch-email"><a href="mailto:' +
                escapeAttr(b.email) +
                '">' +
                escapeHtml(b.email) +
                '</a></div>'
              : '') +
            (hoursHtml ? '<div class="branch-hours">' + hoursHtml + '</div>' : '')
          );
        })
        .join('');
    }

    var contactBranches =
      document.getElementById('site-contact-branches') ||
      document.getElementById('branchesContainer');
    if (contactBranches) {
      contactBranches.innerHTML = window.SITE_DATA.branches
        .map(function (b) {
          var img = b.image || '';
          var imgHtml = img
            ? '<div class="branch-img"><img src="' +
              escapeAttr(img) +
              '" alt="' +
              escapeAttr(b.city) +
              '" loading="lazy"></div>'
            : '';
          return (
            '<div class="branch-card">' +
            imgHtml +
            '<h3>' +
            escapeHtml(b.name) +
            (b.is_headquarters
              ? ' <span style="font-size:11px;color:#2563eb;">(HQ)</span>'
              : '') +
            '</h3><div class="branch-address">' +
            escapeHtml(b.address) +
            '</div>' +
            (b.phone
              ? '<div class="branch-phone"><a href="tel:' +
                escapeAttr(b.phone) +
                '">' +
                escapeHtml(b.phone) +
                '</a></div>'
              : '') +
            (b.email
              ? '<div class="branch-email"><a href="mailto:' +
                escapeAttr(b.email) +
                '">' +
                escapeHtml(b.email) +
                '</a></div>'
              : '') +
            (b.hours
              ? '<div class="branch-hours">' +
                escapeHtml(b.hours).replace(/\|/g, '<br>') +
                '</div>'
              : '') +
            '</div>'
          );
        })
        .join('');
    }
  }

  // ---------- Init ----------
  window.SITE_DATA_LOADED = false;
  fetch(API_BASE + '/api/site-data')
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data && data.success) {
        window.SITE_DATA = data;
        window.SITE_DATA_LOADED = true;
        renderFooter();
        renderCategories();
        renderServices();
        renderHeroBanners();
        renderAbout();
        renderBranches();
      }
    })
    .catch(function () {});
})();
