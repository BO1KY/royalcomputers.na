(function () {
  'use strict';

  const STORAGE_KEY = 'shopping_cart';

  function getStoredItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
    } catch (error) {
      console.warn('[Cart Badge] Could not read cart storage:', error);
    }

    return [];
  }

  function getCartItems() {
    if (window.CART && typeof window.CART.getItems === 'function') {
      try {
        return window.CART.getItems();
      } catch (error) {
        console.warn('[Cart Badge] Could not read live cart:', error);
      }
    }

    return getStoredItems();
  }

  function updateCartBadge() {
    const items = getCartItems();
    const count = Array.isArray(items) ? items.length : 0;

    document.querySelectorAll('.cart-count').forEach(function (badge) {
      badge.textContent = String(count);
      badge.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  function syncCartFromStorage() {
    if (window.CART && typeof window.CART.load === 'function') {
      window.CART.load();

      if (typeof window.CART.dispatchCartChange === 'function') {
        window.CART.dispatchCartChange();
      }
    }

    updateCartBadge();
  }

  function onPageReady() {
    window.setTimeout(updateCartBadge, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageReady);
  } else {
    onPageReady();
  }

  window.addEventListener('cartUpdated', updateCartBadge);
  window.addEventListener('pageshow', updateCartBadge);
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY || event.key === null) {
      window.setTimeout(syncCartFromStorage, 50);
    }
  });

  window.setInterval(updateCartBadge, 500);
  window.updateCartBadge = updateCartBadge;
})();