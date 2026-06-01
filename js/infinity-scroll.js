/**
 * Random Products Module - Royal Computers
 * Displays 8 random products that refresh every 4 minutes
 * Global: window.INFINITY_SCROLL
 */

window.INFINITY_SCROLL = (function () {
  'use strict';

  const CONTAINER_ID = 'infinityScrollContainer';
  const LOADING_ID = 'loadingIndicator';
  const DISPLAY_COUNT = 10;
  const REFRESH_INTERVAL = 240000; // 4 minutes

  let container = null;
  let loadingIndicator = null;
  let refreshTimer = null;

  /**
   * Format price for display
   */
  function formatPrice(price) {
    return 'N$\u202f' + Number(price).toLocaleString('en-NA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /**
   * Get all products from database
   */
  function getAllProducts() {
    if (!window.PRODUCTS_DB || !Array.isArray(window.PRODUCTS_DB)) {
      console.error('[Random Products] PRODUCTS_DB not found');
      return [];
    }
    return window.PRODUCTS_DB;
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Pick random products from the database
   */
  function getRandomProducts(count) {
    const allProducts = getAllProducts();
    if (allProducts.length === 0) return [];
    const shuffled = shuffleArray(allProducts);
    return shuffled.slice(0, Math.min(count, allProducts.length));
  }

  /**
   * Create product HTML element
   */
  function createProductElement(product) {
    const variant = product.variants[0] || {};
    const image = variant.image || product.image || 'https://via.placeholder.com/240x180?text=Product';

    return `
      <div class="product-item-scroll">
        <div class="product-image-scroll" style="position: relative;">
          <img src="${image}" alt="${product.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/240x180?text=No+Image'">
        </div>
        <div class="product-info-scroll">
          <p class="product-category-scroll">${product.category}</p>
          <h3 class="product-name-scroll">${product.name}</h3>
          <p class="product-price-scroll">${formatPrice(variant.price || 0)}</p>
          <button class="add-to-cart-btn-scroll" data-product-id="${product.id}" onclick="addToCart('${product.id}', event)">
            Add to Cart
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Add product to cart
   */
  function addToCart(productId, event) {
    event.preventDefault();
    event.stopPropagation();

    if (!window.CART) {
      console.error('[Random Products] CART module not found');
      return;
    }

    const allProducts = getAllProducts();
    const product = allProducts.find(p => p.id === productId);

    if (!product) {
      console.error('[Random Products] Product not found:', productId);
      return;
    }

    window.CART.add(product, 0);
  }

  /**
   * Display random products in the container
   */
  function displayRandomProducts() {
    if (!container) return;

    const products = getRandomProducts(DISPLAY_COUNT);

    if (products.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">No products available.</p>';
      return;
    }

    const html = products.map(product => createProductElement(product)).join('');
    container.innerHTML = html;

    // Attach event listeners to buttons
    container.querySelectorAll('.add-to-cart-btn-scroll').forEach(button => {
      button.addEventListener('click', function(e) {
        const productId = this.getAttribute('data-product-id');
        addToCart(productId, e);
      });
    });

    console.log(`[Random Products] Displayed ${products.length} random products`);
  }

  /**
   * Initialize random products
   */
  function init() {
    container = document.getElementById(CONTAINER_ID);
    loadingIndicator = document.getElementById(LOADING_ID);

    if (!container) {
      console.error(`[Random Products] Container with ID "${CONTAINER_ID}" not found`);
      return;
    }

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    // Wait for PRODUCTS_DB to be available
    const checkDB = setInterval(() => {
      if (window.PRODUCTS_DB && Array.isArray(window.PRODUCTS_DB)) {
        clearInterval(checkDB);

        // Show initial random products
        displayRandomProducts();

        // Refresh every 4 minutes
        refreshTimer = setInterval(displayRandomProducts, REFRESH_INTERVAL);

        console.log('[Random Products] Initialized successfully (refresh every 4 min)');
      }
    }, 100);

    // Fallback timeout
    setTimeout(() => clearInterval(checkDB), 5000);
  }

  // Make addToCart globally available
  window.addToCart = addToCart;

  // Auto-initialize on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  return {
    refresh: displayRandomProducts,
    reset: function() {
      if (container) container.innerHTML = '';
      if (refreshTimer) clearInterval(refreshTimer);
    }
  };
})();
