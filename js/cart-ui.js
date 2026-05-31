/**
 * UNIVERSAL CART & CHECKOUT — Royal Computers
 * Upgraded features vs. original:
 *  - Multi-step checkout wizard (3 steps)
 *  - Step progress indicator
 *  - Per-field inline validation
 *  - Form data persisted to localStorage between steps
 *  - Defensive null-checks on every DOM query
 *  - Loading spinner on generate button
 * Depends on: cart.js, quote.js, branches.js
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  const FORM_STORAGE_KEY = 'rc_checkout_form_v2';

  /* ── Guard: required modules ── */
  if (!window.CART) {
    console.error('[cart-ui] CART module missing — include cart.js first.');
    return;
  }
  if (!window.QUOTE) {
    console.error('[cart-ui] QUOTE module missing — include quote.js first.');
    return;
  }

  /* ── DOM refs ── */
  const $  = id => document.getElementById(id);
  const cartOverlay    = $('cartOverlay');
  const cartSidebar    = $('cartSidebar');
  const cartItemsEl    = $('cartItems');
  const cartTotalEl    = $('cartTotalPrice');
  const openCartBtn    = $('openCartBtn');
  const closeCartBtn   = $('closeCartBtn');
  const continueShopping = $('continueShopping');
  const checkoutBtn    = $('checkoutBtn');
  const checkoutModal  = $('checkoutModal');
  const quoteModal     = $('quoteModal');
  const closeCheckoutBtn = $('closeCheckoutBtn');
  const cancelCheckoutBtn = $('cancelCheckoutBtn');
  const checkoutFormEl = $('checkoutFormElement');
  const generateQuoteBtn = $('generateQuoteBtn');
  const closeQuoteBtn  = $('closeQuoteBtn');
  const quoteContent   = $('quoteContent');

  /* ── Price formatter ── */
  function fmt(n) {
    return 'N$\u202f' + Number(n).toLocaleString('en-NA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /* ════════════════════════════════════════
     CART DISPLAY
  ════════════════════════════════════════ */
  function updateCartDisplay() {
    const items = window.CART.getItems();
    const total = window.CART.getTotal();

    if (!cartItemsEl) return;

    if (!items.length) {
      cartItemsEl.innerHTML = '<div class="cart-empty"><span>Your cart is empty</span><a href="products.html" class="start-shopping-btn">\u2190 Start Shopping</a></div>';
    } else {
      cartItemsEl.innerHTML = items.map(item => `
        <div class="cart-item">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="cart-item-img"
               loading="lazy" onerror="this.src='https://placehold.co/80x80/f3f4f6/1a1a1a?text=?'">
          <div class="cart-item-info">
            <div class="cart-item-name">${escapeHtml(item.name)}</div>
            <div class="cart-item-variant">${escapeHtml(item.variantLabel)}</div>
            <div class="cart-item-price">${fmt(item.price)}</div>
            <div class="cart-item-qty">
              <button class="qty-btn qty-decrease"
                      data-id="${item.productId}" data-variant="${item.variantIndex}"
                      aria-label="Decrease quantity">−</button>
              <span aria-label="Quantity">${item.quantity}</span>
              <button class="qty-btn qty-increase"
                      data-id="${item.productId}" data-variant="${item.variantIndex}"
                      aria-label="Increase quantity">+</button>
            </div>
          </div>
          <button class="cart-item-remove"
                  data-id="${item.productId}" data-variant="${item.variantIndex}"
                  aria-label="Remove ${escapeHtml(item.name)}">&times;</button>
        </div>`
      ).join('');

      /* qty / remove events via delegation */
      cartItemsEl.querySelectorAll('.qty-decrease').forEach(btn => {
        btn.addEventListener('click', () => {
          const it = items.find(i =>
            i.productId === btn.dataset.id &&
            i.variantIndex == btn.dataset.variant
          );
          if (it) window.CART.updateQuantity(btn.dataset.id, +btn.dataset.variant, it.quantity - 1);
          updateCartDisplay();
        });
      });
      cartItemsEl.querySelectorAll('.qty-increase').forEach(btn => {
        btn.addEventListener('click', () => {
          const it = items.find(i =>
            i.productId === btn.dataset.id &&
            i.variantIndex == btn.dataset.variant
          );
          if (it) window.CART.updateQuantity(btn.dataset.id, +btn.dataset.variant, it.quantity + 1);
          updateCartDisplay();
        });
      });
      cartItemsEl.querySelectorAll('.cart-item-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          window.CART.remove(btn.dataset.id, +btn.dataset.variant);
          updateCartDisplay();
        });
      });
    }

    if (cartTotalEl) cartTotalEl.textContent = fmt(total.subtotal);
  }

  /* ════════════════════════════════════════
     CART OPEN / CLOSE
  ════════════════════════════════════════ */
  function openCart() {
    if (cartOverlay)  cartOverlay.classList.add('open');
    if (cartSidebar)  cartSidebar.classList.add('open');
    document.body.style.overflow = 'hidden';
    updateCartDisplay();
  }

  function closeCart() {
    if (cartOverlay)  cartOverlay.classList.remove('open');
    if (cartSidebar)  cartSidebar.classList.remove('open');
    document.body.style.overflow = '';
  }

  function clearCart() {
    if (!window.CART.getItems().length) return;
    if (confirm('Clear all items from your cart?')) {
      window.CART.clear(true);
      updateCartDisplay();
    }
  }
  if (openCartBtn)    openCartBtn.addEventListener('click', openCart);
  if (closeCartBtn)   closeCartBtn.addEventListener('click', closeCart);
  if (continueShopping) continueShopping.addEventListener('click', closeCart);
  const clearCartBtn = $('clearCartBtn');
  if (clearCartBtn) clearCartBtn.addEventListener('click', clearCart);
  if (cartOverlay) {
    cartOverlay.addEventListener('click', e => {
      if (e.target === cartOverlay) closeCart();
    });
  }

  /* ════════════════════════════════════════
     MULTI-STEP WIZARD
     Steps: 1 = Contact  2 = Branch/Notes  3 = Review
  ════════════════════════════════════════ */
  let currentStep = 1;
  const TOTAL_STEPS = 3;

  function getStep(n) { return document.querySelector(`.checkout-step[data-step="${n}"]`); }

  function buildProgressBar() {
    const container = document.getElementById('checkoutProgress');
    if (!container) return;
    const labels = ['Contact Info', 'Branch & Notes', 'Review'];
    container.innerHTML = labels.map((lbl, i) => {
      const stepNum = i + 1;
      const cls = stepNum < currentStep ? 'done' : stepNum === currentStep ? 'active' : '';
      return `
        <div class="progress-step ${cls}" data-step="${stepNum}">
          <div class="progress-dot">${stepNum < currentStep ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : stepNum}</div>
          <div class="progress-label">${lbl}</div>
        </div>
        ${i < labels.length - 1 ? '<div class="progress-line' + (stepNum < currentStep ? ' done' : '') + '"></div>' : ''}
      `;
    }).join('');
  }

  function showStep(n) {
    currentStep = n;
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const el = getStep(i);
      if (el) el.style.display = i === n ? 'block' : 'none';
    }
    buildProgressBar();

    // Populate review on step 3
    if (n === 3) populateReview();
  }

  function populateReview() {
    const rev = document.getElementById('reviewSummary');
    if (!rev) return;

    const email   = ($('emailInput')   || {}).value  || '—';
    const phone   = ($('phoneInput')   || {}).value  || '—';
    const name    = ($('nameInput')    || {}).value  || '—';
    const company = ($('companyInput') || {}).value  || '';
    const address = ($('addressInput') || {}).value  || '';
    const branch  = $('branchSelect');
    const branchText = branch
      ? branch.options[branch.selectedIndex]?.text
      : '—';
    const notes   = ($('notesInput')   || {}).value  || '';
    const items   = window.CART.getItems();
    const total   = window.CART.getTotal();

    rev.innerHTML = `
      <div class="review-section">
        <h4>Contact</h4>
        <p><strong>Name:</strong> ${name}${company ? ` (${company})` : ''}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        ${address ? `<p><strong>Address:</strong> ${address}</p>` : ''}
      </div>
      <div class="review-section">
        <h4>Collection Branch</h4>
        <p>${branchText}</p>
        ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
      </div>
      <div class="review-section">
        <h4>Items (${items.length})</h4>
        ${items.map(it => `
          <div class="review-item">
            <span>${it.name} <em>${it.variantLabel}</em> × ${it.quantity}</span>
            <span>${fmt(it.price * it.quantity)}</span>
          </div>`).join('')}
        <div class="review-total">
          <span>Subtotal (excl. VAT)</span>
          <strong>${fmt(total.subtotal)}</strong>
        </div>
      </div>`;
  }

  /* ─── Validation helpers ─── */
  function showFieldError(fieldId, msg) {
    const errEl = document.getElementById(fieldId + 'Error');
    if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
    const input = $(fieldId);
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  function clearFieldError(fieldId) {
    const errEl = document.getElementById(fieldId + 'Error');
    if (errEl) errEl.classList.remove('show');
    const input = $(fieldId);
    if (input) input.removeAttribute('aria-invalid');
  }

  function clearAllErrors() {
    document.querySelectorAll('.form-error').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  }

  function validateStep1() {
    clearAllErrors();
    let ok = true;

    const email = ($('emailInput') || {}).value?.trim() || '';
    const phone = ($('phoneInput') || {}).value?.trim() || '';

    if (!window.QUOTE.validateEmail(email)) {
      showFieldError('emailInput', 'Please enter a valid email address.');
      ok = false;
    }
    if (!window.QUOTE.validatePhone(phone)) {
      showFieldError('phoneInput', 'Please enter a valid phone number (min 7 digits).');
      ok = false;
    }
    return ok;
  }

  function validateStep2() {
    clearAllErrors();
    let ok = true;
    const branch = $('branchSelect');
    if (!branch || !branch.value) {
      showFieldError('branchSelect', 'Please select a collection branch.');
      ok = false;
    }
    return ok;
  }

  /* ─── Persist / restore form data ─── */
  function saveFormData() {
    const fields = ['emailInput','phoneInput','nameInput','companyInput',
                    'addressInput','branchSelect','paymentMethodSelect','notesInput','additionalDetailsInput'];
    const data = {};
    fields.forEach(id => {
      const el = $(id);
      if (el) data[id] = el.value;
    });
    try { localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function restoreFormData() {
    try {
      const raw = localStorage.getItem(FORM_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.entries(data).forEach(([id, val]) => {
        const el = $(id);
        if (el) el.value = val;
      });
    } catch (_) {}
  }

  function clearFormData() {
    try { localStorage.removeItem(FORM_STORAGE_KEY); } catch (_) {}
  }

  /* ─── Open / close checkout ─── */
  function openCheckout() {
    if (checkoutModal && checkoutModal.classList.contains('open')) return; // already open
    const items = window.CART.getItems();
    if (!items.length) {
      window.CART.showToast('Add at least one product to generate a quote.', 'info', 4000);
      return;
    }
    closeCart();
    restoreFormData();
    showStep(1);
    if (checkoutModal) checkoutModal.classList.add('open');
  }

  function closeCheckout() {
    if (checkoutModal) checkoutModal.classList.remove('open');
    clearAllErrors();
  }

  /* expose globally for checkout button onclick handler */
  window.handleCheckout = openCheckout;
  window.openCheckoutModal = openCheckout;
  window.openCart = openCart;

  /* ─── Wire checkout button — strip inline onclick to prevent double-fire ─── */
  if (checkoutBtn) {
    checkoutBtn.removeAttribute('onclick');
    checkoutBtn.addEventListener('click', openCheckout);
  }

  /* ─── Close buttons ─── */
  if (closeCheckoutBtn)  closeCheckoutBtn.addEventListener('click', closeCheckout);
  if (cancelCheckoutBtn) cancelCheckoutBtn.addEventListener('click', closeCheckout);
  if (checkoutModal) {
    checkoutModal.addEventListener('click', e => {
      if (e.target === checkoutModal) closeCheckout();
    });
  }

  /* ─── Step navigation buttons ─── */
  document.addEventListener('click', e => {
    if (e.target.matches('[data-next-step]')) {
      const next = +e.target.dataset.nextStep;
      const ok = (next - 1 === 1) ? validateStep1()
               : (next - 1 === 2) ? validateStep2()
               : true;
      if (ok) { saveFormData(); showStep(next); }
    }
    if (e.target.matches('[data-prev-step]')) {
      showStep(+e.target.dataset.prevStep);
    }
  });

  /* Auto-save form on any input change */
  if (checkoutFormEl) {
    checkoutFormEl.addEventListener('input',  saveFormData);
    checkoutFormEl.addEventListener('change', saveFormData);

    /* clear per-field error on input */
    ['emailInput','phoneInput','branchSelect'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', () => clearFieldError(id));
    });
  }

  /* ─── Final submit — generate quote ─── */
  if (checkoutFormEl) {
    checkoutFormEl.addEventListener('submit', async e => {
      e.preventDefault();
      if (!validateStep2()) { showStep(2); return; }

      const email   = ($('emailInput')    || {}).value?.trim() || '';
      const phone   = ($('phoneInput')    || {}).value?.trim() || '';
      const name    = ($('nameInput')     || {}).value?.trim() || '';
      const company = ($('companyInput')  || {}).value?.trim() || '';
      const address = ($('addressInput')  || {}).value?.trim() || '';
      const branchId = ($('branchSelect') || {}).value || 'branch-001';
      const paymentMethod = ($('paymentMethodSelect') || {}).value || 'CASH';
      const notes   = ($('notesInput')    || {}).value?.trim() || '';
      const additionalDetails = ($('additionalDetailsInput') || {}).value?.trim() || '';

      /* loading state */
      if (generateQuoteBtn) {
        generateQuoteBtn.classList.add('loading');
        generateQuoteBtn.disabled = true;
        generateQuoteBtn.textContent = 'Generating…';
      }

      try {
        await new Promise(r => setTimeout(r, 400)); // brief UX delay

        if (window.BRANCHES) window.BRANCHES.saveBranchSelection(branchId);

        const cartItems = window.CART.getItems();
        const quote    = window.QUOTE.createQuote(cartItems, {
          email, phone, name, company, address,
          branchId, notes, additionalDetails, paymentMethod
        });
        const quoteHTML = window.QUOTE.generateHTMLSummary(quote);

        clearFormData();
        closeCheckout();

        // Save snapshot and clear cart for modify-quote flow
        try { sessionStorage.setItem('rc_quote_snapshot', JSON.stringify(window.CART.getItems())); } catch (_) {}
        window.CART.clear(true);

        if (quoteContent) {
          quoteContent.innerHTML = quoteHTML;
          quoteContent.dataset.quoteNumber = quote.number;
        }
        if (quoteModal) openQuoteFullScreen();

        updateCartDisplay();

      } catch (err) {
        console.error('[cart-ui] Quote generation failed:', err);
        window.CART.showToast('Something went wrong. Please try again.', 'info', 4000);
      } finally {
        if (generateQuoteBtn) {
          generateQuoteBtn.classList.remove('loading');
          generateQuoteBtn.disabled = false;
          generateQuoteBtn.textContent = 'Generate Quote';
        }
      }
    });
  }

  /* ════════════════════════════════════════
     QUOTE MODAL
  ════════════════════════════════════════ */
  function openQuoteFullScreen() {
    if (!quoteModal) return;

    // Force overlay to fill entire screen
    quoteModal.style.cssText =
      "display:flex;position:fixed;inset:0;z-index:3000;" +
      "background:#e8e8e8;flex-direction:column;overflow:hidden;";

    // Inner .modal-content becomes a full-height scroll container
    var modalContent = quoteModal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.style.cssText =
        "max-width:100%;width:100%;height:100%;max-height:100%;" +
        "border-radius:0;box-shadow:none;overflow-y:auto;" +
        "background:#e8e8e8;padding:0;display:flex;flex-direction:column;";
    }

    // Hide the original modal close button
    if (closeQuoteBtn) closeQuoteBtn.style.display = 'none';

    // Remove any previously injected action bar
    var existingBar = quoteModal.querySelector('#quoteActionBar');
    if (existingBar) existingBar.remove();

    // Sticky top action bar
    var bar = document.createElement('div');
    bar.id = 'quoteActionBar';
    bar.style.cssText =
      "position:sticky;top:0;z-index:10;display:flex;align-items:center;" +
      "gap:10px;padding:10px 20px;background:#1a1a2e;color:#fff;" +
      "box-shadow:0 2px 8px rgba(0,0,0,0.3);flex-shrink:0;flex-wrap:wrap;";
    bar.innerHTML =
      '<span style="font-weight:700;font-size:14px;flex:1;min-width:120px;">' +
        '&#128203; Quote Preview' +
      '</span>' +
      '<button onclick="printQuoteAsPDF()" style="' +
        'padding:8px 18px;background:#e5383b;color:#fff;border:none;' +
        'border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">' +
        '&#128229; Save / Print PDF' +
      '</button>' +
      '<button onclick="handleModifyQuote()" style="' +
        'padding:8px 18px;background:#444;color:#fff;border:none;' +
        'border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">' +
        '&#9998; Modify Order' +
      '</button>' +
      '<button onclick="(function(){var m=document.getElementById(\'quoteModal\');if(m)m.style.display=\'none\';})()" style="' +
        'padding:8px 14px;background:transparent;color:#fff;' +
        'border:1px solid rgba(255,255,255,0.4);' +
        'border-radius:6px;font-weight:700;cursor:pointer;font-size:18px;line-height:1;" ' +
        'title="Close">&times;</button>';

    if (modalContent) {
      modalContent.insertBefore(bar, modalContent.firstChild);
    } else {
      quoteModal.insertBefore(bar, quoteModal.firstChild);
    }

    // Wrap quote document in a centred A4-like page container
    if (quoteContent) {
      quoteContent.style.cssText =
        "flex:1;padding:30px 20px 60px;display:flex;justify-content:center;";
      var inner = quoteContent.querySelector('.quote-inner-wrap');
      if (!inner) {
        var wrap = document.createElement('div');
        wrap.className = 'quote-inner-wrap';
        wrap.style.cssText =
          "width:100%;max-width:860px;background:#fff;" +
          "box-shadow:0 4px 24px rgba(0,0,0,0.12);border-radius:4px;overflow:hidden;";
        while (quoteContent.firstChild) wrap.appendChild(quoteContent.firstChild);
        quoteContent.appendChild(wrap);
      }
    }

    quoteModal.style.display = 'flex';
  }


  /* ── Print / PDF ── */
  window.printQuoteAsPDF = function () {
    if (!quoteContent) { alert('Quote content not found.'); return; }

    const quoteNum  = quoteContent.dataset.quoteNumber || ('Q' + Date.now());
    // Extract the clean quote HTML — get content inside the inner-wrap, exclude action bar
    const innerWrap = quoteContent.querySelector('.quote-inner-wrap');
    const bodyHTML  = (innerWrap || quoteContent).innerHTML;

    const printDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Proforma Invoice – Royal Computers – ${quoteNum}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;background:#fff;font-size:11px;color:#222}
    @page{size:A4;margin:15mm 12mm}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style>
</head>
<body>
  ${bodyHTML}
  <script>setTimeout(function(){window.focus();window.print();},400);<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) {
      win.document.open();
      win.document.write(printDoc);
      win.document.close();
    } else {
      /* fallback: blob download */
      const blob = new Blob([printDoc], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), {
        href: url, download: `Royal-Proforma-${quoteNum}.html`
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  window.handleModifyQuote = function () {
    if (quoteModal) {
      quoteModal.style.display = 'none';
      // Restore inner wrap children back to quoteContent for next quote
      var innerWrap = quoteModal.querySelector('.quote-inner-wrap');
      if (innerWrap && quoteContent) {
        while (innerWrap.firstChild) quoteContent.appendChild(innerWrap.firstChild);
        innerWrap.remove();
      }
      var bar = quoteModal.querySelector('#quoteActionBar');
      if (bar) bar.remove();
      if (closeQuoteBtn) closeQuoteBtn.style.display = '';
    }
    // Restore cart snapshot so items appear for modification
    try {
      var snapshot = sessionStorage.getItem('rc_quote_snapshot');
      if (snapshot) {
        var items = JSON.parse(snapshot);
        if (items.length) window.CART.replaceItems(items);
      }
    } catch (_) {}
    openCheckout();
  };

  /* ════════════════════════════════════════
     LAZY-LOAD IMAGE OBSERVER (performance)
  ════════════════════════════════════════ */
  if ('IntersectionObserver' in window) {
    const imgObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
        obs.unobserve(img);
      });
    }, { rootMargin: '200px' });

    /* Observe any img with data-src (lazy) */
    document.querySelectorAll('img[data-src]').forEach(img => imgObserver.observe(img));

    /* Also observe images added dynamically (e.g., cart items) */
    window._lazyObserver = imgObserver;
  }

  /* ── Cart update listener ── */
  window.addEventListener('cartUpdated', updateCartDisplay);

  /* ── Initial render ── */
  updateCartDisplay();

});