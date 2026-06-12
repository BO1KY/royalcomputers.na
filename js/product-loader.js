/* ─── Product Loader ─── */
/* Fetches product overrides and custom products, merges with window.PRODUCTS_DB */
/* Include AFTER products-data.js, BEFORE any script that reads PRODUCTS_DB */
/* Uses async fetch via DOMContentLoaded to avoid blocking the main thread */

(function() {
  var base = window.PRODUCTS_DB;
  if (!base || !base.length) return;

  var API_BASE = window.location.origin;

  function mergeData(overridesData, customData) {
    var overrides = (overridesData && overridesData.overrides) || [];
    var customs = (customData && customData.customProducts) || [];

    var overrideMap = {};
    overrides.forEach(function(o) { overrideMap[o.product_id] = o; });
    window._productOverrides = overrideMap;

    var merged = base.map(function(p) { return JSON.parse(JSON.stringify(p)); });

    merged.forEach(function(p) {
      var ov = overrideMap[p.id];
      if (!ov) return;
      if (ov.hidden) { p._hidden = true; return; }
      if (ov.name) p.name = ov.name;
      if (ov.image) p.image = ov.image;
      if (ov.description) p.description = ov.description;
      if (ov.compatibility) p.compatibility = ov.compatibility;
      if (ov.specs) p.specs = ov.specs;
      if (ov.badge) p.badge = ov.badge;
      if (ov.variants_json) {
        try { p.variants = JSON.parse(ov.variants_json); } catch(e) {}
      }
    });

    merged = merged.filter(function(p) { return !p._hidden; });

    customs.forEach(function(cp) {
      var variants;
      try { variants = JSON.parse(cp.variants_json || '[]'); } catch(e) { variants = []; }
      merged.push({
        id: cp.id,
        name: cp.name,
        category: cp.category,
        image: cp.image || '',
        badge: cp.badge || '',
        date: cp.date || '',
        description: cp.description || '',
        compatibility: cp.compatibility || '',
        specs: cp.specs || '',
        variants: variants,
        hidden: cp.hidden || 0
      });
    });

    window.PRODUCTS_DB = merged;
    if (window._productLoaderResolve) window._productLoaderResolve();
  }

  // Try async fetch; fall back to sync if already past DOMContentLoaded
  function loadAsync() {
    Promise.all([
      fetch(API_BASE + '/api/product-overrides').then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
      fetch(API_BASE + '/api/custom-products').then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; })
    ]).then(function(results) {
      mergeData(results[0], results[1]);
    }).catch(function() {
      // fallback: empty data
      mergeData(null, null);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAsync);
  } else {
    loadAsync();
  }
})();
