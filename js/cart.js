/**
 * UNIFIED CART & QUOTE MODULE
 * Manages shopping cart and quote building with localStorage persistence
 * Merged functionality: cart.js + quote-manager.js
 * Global: window.CART
 * 
 * Modes:
 * - 'purchase': Standard checkout flow
 * - 'quote': Generate quote with account type and reference fields
 */

/**
 * Global HTML sanitizer — escapes HTML special chars
 * Safe to use in innerHTML to prevent XSS
 */
window.escapeHtml = function (str) {
  if (typeof str !== 'string' && typeof str !== 'number') return str || '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
};

window.CART = (function() {
  const STORAGE_KEY = 'shopping_cart';
  const LEGACY_STORAGE_KEYS = ['royalcart_items', 'quote_items'];
  const TAX_RATE = 0.15; // 15% tax
  const QUOTE_EXPIRY_DAYS = 7;

  /** Prevents prototype pollution by stripping __proto__, constructor, prototype */
  function safeAssign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src || typeof src !== 'object') continue;
      var keys = Object.keys(src);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        target[key] = src[key];
      }
    }
    return target;
  }

  let items = [];
  let mode = 'purchase'; // 'purchase' or 'quote'
  let quoteFields = {
    accountType: '',
    customerRef: '',
    guestName: '',
    guestEmail: '',
    branch: '', // Branch ID for quote delivery/processing
    billingAddress: '', // Customer billing address
    billingCity: '',
    billingPostal: '',
    shippingAddress: '', // Optional shipping address
    shippingCity: '',
    shippingPostal: ''
  };

  function persistItems() {
    try {
      const data = {
        items: items,
        mode: mode,
        quoteFields: quoteFields
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.warn('Could not save cart to localStorage');
    }
  }

  function removePersistedItems() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.warn('Could not clear cart from localStorage');
    }
  }

  function save() {
    persistItems();
    updateBadge();
    dispatchCartChange();
  }

  function load() {
    let loadedItems = [];
    let loadedMode = 'purchase';
    let loadedQuoteFields = { 
      accountType: '', 
      customerRef: '', 
      guestName: '', 
      guestEmail: '',
      branch: '',
      billingAddress: '',
      billingCity: '',
      billingPostal: '',
      shippingAddress: '',
      shippingCity: '',
      shippingPostal: ''
    };
    let sourceKey = null;

    // Try to load from new format first (with mode and quoteFields)
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.items && Array.isArray(parsed.items)) {
          loadedItems = parsed.items;
          loadedMode = parsed.mode || 'purchase';
          loadedQuoteFields = safeAssign({ 
            accountType: '', 
            customerRef: '', 
            guestName: '', 
            guestEmail: '',
            branch: '',
            billingAddress: '',
            billingCity: '',
            billingPostal: '',
            shippingAddress: '',
            shippingCity: '',
            shippingPostal: ''
          }, parsed.quoteFields || {});
          sourceKey = STORAGE_KEY;
        } else if (Array.isArray(parsed)) {
          // Old format: just array of items
          loadedItems = parsed;
          sourceKey = STORAGE_KEY;
        }
      }
    } catch (e) {
      console.warn('Could not parse new format');
    }

    // Try legacy keys if nothing found
    if (loadedItems.length === 0) {
      for (const key of LEGACY_STORAGE_KEYS) {
        try {
          const raw = localStorage.getItem(key);
          if (raw === null) continue;

          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            loadedItems = parsed;
            sourceKey = key;
            break;
          }
        } catch (e) {
          console.warn(`Could not load cart data from ${key}`);
        }
      }
    }

    items = loadedItems;
    mode = loadedMode;
    quoteFields = loadedQuoteFields;

    if (sourceKey && sourceKey !== STORAGE_KEY) {
      persistItems();
    }

    updateBadge();
  }

  function updateBadge() {
    const badge = document.getElementById('cartCount');
    if (badge) {
      badge.textContent = items.length;
      if (items.length > 0) {
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  function dispatchCartChange() {
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { items, total: getTotal() } }));
  }

  function add(product, variantIndex) {
    if (!product || !product.id) return false;
    
    const variant = product.variants[variantIndex] || product.variants[0];
    if (!variant) return false;

    const existingItem = items.find(
      item => item.productId === product.id && item.variantIndex === variantIndex
    );

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      items.push({
        productId: product.id,
        variantIndex: variantIndex,
        quantity: 1,
        price: variant.price,
        image: variant.image || product.image,
        name: product.name,
        categoryName: product.category,
        variantLabel: variant.label
      });
    }

    save();
    showAddedToast(product.name, 1);
    return true;
  }

  function remove(productId, variantIndex) {
    items = items.filter(item => !(item.productId === productId && item.variantIndex === variantIndex));
    save();
  }

  function updateQuantity(productId, variantIndex, quantity) {
    const item = items.find(i => i.productId === productId && i.variantIndex === variantIndex);
    if (item) {
      if (quantity <= 0) {
        remove(productId, variantIndex);
      } else {
        item.quantity = Math.max(1, parseInt(quantity) || 1);
        save();
      }
    }
  }

  function clear(removeStorage = false) {
    items = [];
    if (removeStorage) {
      removePersistedItems();
      updateBadge();
      dispatchCartChange();
      return;
    }

    save();
  }

  function getTotal() {
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * TAX_RATE;
    return {
      subtotal: subtotal,
      tax: tax,
      total: subtotal + tax,
      itemCount: items.length,
      itemQuantity: items.reduce((sum, item) => sum + item.quantity, 0)
    };
  }

  function getItems() {
    return [...items]; // Return copy to prevent external mutation
  }

  // Mode management
  function setMode(newMode) {
    if (newMode === 'purchase' || newMode === 'quote') {
      mode = newMode;
      persistItems();
      dispatchCartChange();
      return true;
    }
    return false;
  }

  function getMode() {
    return mode;
  }

  // Quote field management
  function setQuoteFields(fields) {
    if (fields.accountType !== undefined) quoteFields.accountType = fields.accountType;
    if (fields.customerRef !== undefined) quoteFields.customerRef = fields.customerRef;
    if (fields.guestName !== undefined) quoteFields.guestName = fields.guestName;
    if (fields.guestEmail !== undefined) quoteFields.guestEmail = fields.guestEmail;
    if (fields.branch !== undefined) quoteFields.branch = fields.branch;
    if (fields.billingAddress !== undefined) quoteFields.billingAddress = fields.billingAddress;
    if (fields.billingCity !== undefined) quoteFields.billingCity = fields.billingCity;
    if (fields.billingPostal !== undefined) quoteFields.billingPostal = fields.billingPostal;
    if (fields.shippingAddress !== undefined) quoteFields.shippingAddress = fields.shippingAddress;
    if (fields.shippingCity !== undefined) quoteFields.shippingCity = fields.shippingCity;
    if (fields.shippingPostal !== undefined) quoteFields.shippingPostal = fields.shippingPostal;
    persistItems();
  }

  function getQuoteFields() {
    return { ...quoteFields };
  }

  function clearQuoteFields() {
    quoteFields = { 
      accountType: '', 
      customerRef: '', 
      guestName: '', 
      guestEmail: '',
      branch: '',
      billingAddress: '',
      billingCity: '',
      billingPostal: '',
      shippingAddress: '',
      shippingCity: '',
      shippingPostal: ''
    };
    persistItems();
  }

  function replaceItems(newItems) {
    items = newItems.map(function(it) { return safeAssign({}, it); });
    save();
  }

  function validateItems(productDb) {
    if (!productDb || !Array.isArray(productDb)) return;
    var removed = 0;
    items = items.filter(function(item) {
      var product = productDb.find(function(p) { return p.id === item.productId; });
      if (!product) { removed++; return false; }
      var variant = product.variants && product.variants[item.variantIndex];
      if (!variant) { removed++; return false; }
      var qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty < 1) { removed++; return false; }
      item.quantity = qty;
      item.price = variant.price;
      item.name = product.name;
      item.categoryName = product.category;
      item.variantLabel = variant.label;
      item.image = variant.image || product.image;
      return true;
    });
    if (removed > 0) {
      save();
      if (typeof showToast === 'function') showToast('Removed ' + removed + ' invalid item(s) from cart.', 'info', 4000);
    }
  }

  function showAddedToast(productName, qty) {
    const msg = `Added ${qty}x ${productName} to cart`;
    showToast(msg, 'success', 3000);
  }

  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'cart-toast cart-toast-' + type;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      background: ${type === 'success' ? '#22c55e' : '#3b82f6'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      animation: slideInRight 0.3s ease-out;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    if (type === 'success') {
      toast.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;"><polyline points="20 6 9 17 4 12"/></svg>${message}`;
    }

    document.body.appendChild(toast);

    const timeout = setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, duration);

    toast.addEventListener('click', () => {
      clearTimeout(timeout);
      toast.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    });
  }

  return {
    add: add,
    remove: remove,
    updateQuantity: updateQuantity,
    clear: clear,
    replaceItems: replaceItems,
    validateItems: validateItems,
    getTotal: getTotal,
    getItems: getItems,
    save: save,
    load: load,
    updateBadge: updateBadge,
    showToast: showToast,
    dispatchCartChange: dispatchCartChange,
    STORAGE_KEY: STORAGE_KEY,
    setMode: setMode,
    getMode: getMode,
    setQuoteFields: setQuoteFields,
    getQuoteFields: getQuoteFields,
    clearQuoteFields: clearQuoteFields,
    QUOTE_EXPIRY_DAYS: QUOTE_EXPIRY_DAYS,
    TAX_RATE: TAX_RATE
  };
})();

// Auto-load on page load
document.addEventListener('DOMContentLoaded', function() {
  window.CART.load();
  function tryValidate() {
    if (window.PRODUCTS_DB && Array.isArray(window.PRODUCTS_DB)) {
      if (window.CART) window.CART.validateItems(window.PRODUCTS_DB);
    } else {
      setTimeout(tryValidate, 100);
    }
  }
  setTimeout(tryValidate, 200);
});