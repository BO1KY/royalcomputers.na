/* PC BUILDER — Pre-built computer configurations
   Depends on: products-data.js (window.PRODUCTS_DB), cart.js (window.CART)
*/

window.PC_BUILDER = (function () {
  'use strict';

  /* ── Preset Definitions ── */
  // Each item: { productId, variantIndex, category }
  // productId matches window.PRODUCTS_DB[i].id
  const WORKSHOP_FEE = 750;
  const PRESETS = {
    entry: {
      name: 'Entry Level',
      desc: 'Perfect for basic home, office & browsing',
      components: [
        { productId: 'KMX-MB-08',  variantIndex: 0, category: 'Motherboard' },
        { productId: 'CPU-INTEL06', variantIndex: 0, category: 'CPU' },
        { productId: 'DDR4-04/08/16', variantIndex: 0, category: 'RAM' },
        { productId: 'st7',         variantIndex: 1, category: 'Storage' },
        { productId: 'KMX-ATX-01', variantIndex: 0, category: 'Case' },
        { productId: 'KMX-ATX-PSU450', variantIndex: 0, category: 'PSU' },
        { productId: 'cbl10', variantIndex: 0, category: 'Power Cable' },
        { productId: 'KMX-NTWK-02', variantIndex: 0, category: 'Network' },
        { productId: 'CPU-INTEL02', variantIndex: 0, category: 'CPU Fan' },
        { productId: 'CPU-INTEL08', variantIndex: 0, category: 'Heat Paste' },
      ]
    },
    mid: {
      name: 'Mid Range',
      desc: 'Great for multitasking, media & light gaming',
      components: [
        { productId: 'KMX-MB-08',  variantIndex: 0, category: 'Motherboard' },
        { productId: 'CPU-INTEL01', variantIndex: 0, category: 'CPU' },
        { productId: 'DDR4-04/08/16', variantIndex: 1, category: 'RAM' },
        { productId: 'st7',         variantIndex: 2, category: 'Storage' },
        { productId: 'KMX-ATX-01', variantIndex: 0, category: 'Case' },
        { productId: 'KMX-ATX-PSU450', variantIndex: 0, category: 'PSU' },
        { productId: 'cbl10', variantIndex: 0, category: 'Power Cable' },
        { productId: 'KMX-NTWK-02', variantIndex: 0, category: 'Network' },
        { productId: 'CPU-INTEL02', variantIndex: 0, category: 'CPU Fan' },
        { productId: 'CPU-INTEL08', variantIndex: 0, category: 'Heat Paste' },
      ]
    },
    high: {
      name: 'High Performance',
      desc: 'Built for gaming, design & heavy workloads',
      components: [
        { productId: 'KMX-MB-08',  variantIndex: 0, category: 'Motherboard' },
        { productId: 'CPU-INTEL07', variantIndex: 0, category: 'CPU' },
        { productId: 'DDR4-04/08/16', variantIndex: 2, category: 'RAM' },
        { productId: 'st8',         variantIndex: 1, category: 'SSD (OS)' },
        { productId: 'st7',         variantIndex: 3, category: 'SSD (Storage)' },
        { productId: 'KMX-GRPH-02', variantIndex: 0, category: 'Graphics' },
        { productId: 'KMX-ATX-01', variantIndex: 0, category: 'Case' },
        { productId: 'KMX-ATX-PSU450', variantIndex: 0, category: 'PSU' },
        { productId: 'cbl10', variantIndex: 0, category: 'Power Cable' },
        { productId: 'KMX-NTWK-02', variantIndex: 0, category: 'Network' },
        { productId: 'CPU-INTEL02', variantIndex: 0, category: 'CPU Fan' },
        { productId: 'CPU-INTEL08', variantIndex: 0, category: 'Heat Paste' },
      ]
    }
  };

  /* ── Helpers ── */
  function findProduct(id) {
    return (window.PRODUCTS_DB || []).find(function (p) { return p.id === id; });
  }

  function fmt(n) {
    return 'N$\u202f' + Number(n).toLocaleString('en-NA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /* ── Build component data for a preset ── */
  function getPresetData(key) {
    var preset = PRESETS[key];
    if (!preset) return null;

    var components = preset.components.map(function (c) {
      var product = findProduct(c.productId);
      if (!product) return null;
      var variant = (product.variants || [])[c.variantIndex];
      if (!variant) return null;
      return {
        product: product,
        variantIndex: c.variantIndex,
        variant: variant,
        category: c.category,
        price: variant.price
      };
    }).filter(Boolean);

    var total = components.reduce(function (sum, c) { return sum + c.price; }, 0) + WORKSHOP_FEE;

    return {
      key: key,
      name: preset.name,
      desc: preset.desc,
      components: components,
      total: total,
      workshopFee: WORKSHOP_FEE
    };
  }

  /* ── Modal Render ── */
  function renderModal() {
    var existing = document.getElementById('pcBuilderModal');
    if (existing) return existing;

    var overlay = document.createElement('div');
    overlay.className = 'pcb-modal-overlay';
    overlay.id = 'pcBuilderModal';
    overlay.innerHTML =
      '<div class="pcb-modal">' +
        '<div class="pcb-header">' +
          '<span style="font-size:24px;">\uD83D\uDDA5\uFE0F</span>' +
          '<h2>Build a Computer</h2>' +
          '<button class="pcb-close" id="pcbCloseBtn" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="pcb-body">' +
          '<div class="pcb-tier-selector" id="pcbTierSelector"></div>' +
          '<div id="pcbComponentList" class="pcb-component-list"></div>' +
          '<div class="pcb-total">' +
            '<span class="pcb-total-label">Estimated Total (incl. Workshop Fee)</span>' +
            '<span class="pcb-total-amount" id="pcbTotal">N$\u202f0.00</span>' +
          '</div>' +
          '<div class="pcb-actions">' +
            '<button class="pcb-btn pcb-btn-secondary" id="pcbCancelBtn">Cancel</button>' +
            '<button class="pcb-btn pcb-btn-primary" id="pcbAddToCartBtn">Add All to Cart & Customize</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Events
    document.getElementById('pcbCloseBtn').addEventListener('click', closeModal);
    document.getElementById('pcbCancelBtn').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    var addBtn = document.getElementById('pcbAddToCartBtn');
    addBtn.addEventListener('click', function () {
      var active = overlay.querySelector('.pcb-tier-btn.active');
      if (!active) {
        window.CART.showToast('Please select a tier first.', 'info', 3000);
        return;
      }
      addPresetToCart(active.dataset.tier);
    });

    return overlay;
  }

  function renderTiers(overlay, activeKey) {
    var container = document.getElementById('pcbTierSelector');
    if (!container) return;

    var keys = ['entry', 'mid', 'high'];
    container.innerHTML = keys.map(function (key) {
      var preset = PRESETS[key];
      var data = getPresetData(key);
      var total = data ? data.total : 0;
      var active = key === activeKey ? ' active' : '';
      return (
        '<button class="pcb-tier-btn' + active + '" data-tier="' + key + '">' +
          '<span class="tier-name">' + preset.name + '</span>' +
          '<span class="tier-price">' + fmt(total) + '</span>' +
          '<span class="tier-desc">' + preset.desc + '</span>' +
        '</button>'
      );
    }).join('');

    // Click handler
    container.querySelectorAll('.pcb-tier-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('.pcb-tier-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderComponents(btn.dataset.tier);
      });
    });
  }

  function renderComponents(tierKey) {
    var container = document.getElementById('pcbComponentList');
    var totalEl = document.getElementById('pcbTotal');
    if (!container) return;

    var data = getPresetData(tierKey);
    if (!data) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Tier not available.</div>';
      if (totalEl) totalEl.textContent = fmt(0);
      return;
    }

    var html = data.components.map(function (c) {
      var name = c.category === 'Power Cable' ? 'Power Cable' : c.product.name + ' (' + c.variant.label + ')';
      return (
        '<div class="pcb-component-item">' +
          '<span class="pcb-component-category">' + c.category + '</span>' +
          '<span class="pcb-component-name">' + name + '</span>' +
          '<span class="pcb-component-price">' + fmt(c.price) + '</span>' +
        '</div>'
      );
    }).join('');

    // Workshop fee line
    html +=
      '<div class="pcb-component-item pcb-workshop-fee">' +
        '<span class="pcb-component-category">Service</span>' +
        '<span class="pcb-component-name">Workshop Fee (PC Assembly)</span>' +
        '<span class="pcb-component-price">' + fmt(data.workshopFee) + '</span>' +
      '</div>';

    container.innerHTML = html;

    if (totalEl) totalEl.textContent = fmt(data.total);
  }

  /* ── Add preset to cart ── */
  function addPresetToCart(tierKey) {
    var data = getPresetData(tierKey);
    if (!data) {
      window.CART.showToast('Could not load preset. Try again.', 'info', 3000);
      return;
    }

    var added = 0;
    data.components.forEach(function (c) {
      var ok = window.CART.add(c.product, c.variantIndex);
      if (ok) added++;
    });
    // Workshop fee is NOT a cart item — it's added during checkout

    if (added > 0) {
      closeModal();
      window.CART.showToast(data.name + ' PC added to cart! ' + added + ' components. Customize any item below.', 'success', 5000);
      // Open cart sidebar so user can review/edit
      if (typeof window.openCart === 'function') {
        window.openCart();
      } else {
        // Fallback: click the cart button
        var cartBtn = document.getElementById('openCartBtn');
        if (cartBtn) cartBtn.click();
      }
    }
  }

  /* ── Modal open/close ── */
  function openModal() {
    var overlay = renderModal();
    renderTiers(overlay, 'mid');
    renderComponents('mid');
    // default to mid tier as active
    var midBtn = overlay.querySelector('.pcb-tier-btn[data-tier="mid"]');
    if (midBtn) midBtn.classList.add('active');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    var overlay = document.getElementById('pcBuilderModal');
    if (overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  /* ── Public API ── */
  function init() {
    /* Use event delegation so dynamically re-rendered buttons still work */
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('#openPcBuilderBtn');
      if (btn) {
        e.preventDefault();
        openModal();
      }
    });
  }

  return {
    init: init,
    openModal: openModal,
    closeModal: closeModal,
    getPresetData: getPresetData,
    PRESETS: PRESETS
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  window.PC_BUILDER.init();
});
