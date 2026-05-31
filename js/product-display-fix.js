/**
 * PRODUCT DISPLAY INITIALIZATION & FIX
 * Ensures products are loaded and displayed correctly in the grid
 */

(function() {
  'use strict';

  function initializeProductDisplay() {
    console.log('[Product Display] Initializing...');
    
    // Wait for PRODUCTS_DB to be loaded
    if (!window.PRODUCTS_DB || !Array.isArray(window.PRODUCTS_DB)) {
      console.warn('[Product Display] PRODUCTS_DB not available, retrying...');
      setTimeout(initializeProductDisplay, 100);
      return;
    }

    console.log(`[Product Display] Loaded ${window.PRODUCTS_DB.length} products`);

    // Ensure skeleton is hidden after content loads
    const skeleton = document.getElementById('skeletonGrid');
    if (skeleton) {
      skeleton.style.display = 'none';
    }

    // Verify grid container exists
    const grid = document.getElementById('productsGrid');
    if (!grid) {
      console.error('[Product Display] Grid container not found');
      return;
    }

    console.log('[Product Display] Grid container found');

    // Make sure the render function is called
    if (window.renderProductGrid && typeof window.renderProductGrid === 'function') {
      console.log('[Product Display] Calling renderProductGrid function');
      window.renderProductGrid();
    } else {
      console.log('[Product Display] renderProductGrid not available yet');
    }

    // Add category filtering to links
    addCategoryFilters();
  }

  function addCategoryFilters() {
    document.querySelectorAll('a[href*="?category="]').forEach(link => {
      link.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        console.log('[Category Filter] Navigating to:', href);
        // The URL will trigger the filtering logic in products.html
      });
    });
  }

  // Initialize on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeProductDisplay);
  } else {
    initializeProductDisplay();
  }

  // Also initialize after a short delay to ensure everything is loaded
  setTimeout(initializeProductDisplay, 500);
})();
