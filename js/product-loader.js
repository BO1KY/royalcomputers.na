/* ─── Product Loader ─── */
/* Fetches product overrides and custom products, merges with window.PRODUCTS_DB */
/* Include AFTER products-data.js, BEFORE any script that reads PRODUCTS_DB */

(function() {
  var base = window.PRODUCTS_DB;
  if (!base || !base.length) return;

  var API_BASE = window.location.origin;

  function syncGet(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send();
      if (xhr.status === 200) return JSON.parse(xhr.responseText);
    } catch(e) {}
    return null;
  }

  var overridesData = syncGet(API_BASE + '/api/product-overrides');
  var customData = syncGet(API_BASE + '/api/custom-products');

  var overrides = (overridesData && overridesData.overrides) || [];
  var customs = (customData && customData.customProducts) || [];

  // Build override map for sales.js
  var overrideMap = {};
  overrides.forEach(function(o) { overrideMap[o.product_id] = o; });
  window._productOverrides = overrideMap;

  // Deep-clone PRODUCTS_DB
  var merged = base.map(function(p) { return JSON.parse(JSON.stringify(p)); });

  // Apply overrides
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

  // Filter out hidden
  merged = merged.filter(function(p) { return !p._hidden; });

  // Add custom products
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

  // Replace PRODUCTS_DB with merged data
  window.PRODUCTS_DB = merged;
})();
