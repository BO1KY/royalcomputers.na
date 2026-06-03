/* ─── Sales & Promotions Manager ─── */
window.SALES = {
  active: [],
  loaded: false,

  load: function(callback) {
    var self = this;
    fetch('/api/sales').then(function(r) { return r.json(); }).then(function(data) {
      self.active = (data && data.sales) || [];
      self.loaded = true;
      if (callback) callback(self.active);
    }).catch(function() {
      self.loaded = true;
      if (callback) callback([]);
    });
  },

  getSaleFor: function(productId) {
    if (!this.loaded) return null;
    return this.active.find(function(s) { return s.product_id === productId; }) || null;
  },

  applyToProduct: function(product) {
    if (!product || !this.loaded) return product;
    var sale = this.getSaleFor(product.id);
    if (!sale) {
      var ov = window._productOverrides || {};
      if (ov[product.id] && ov[product.id].price) {
        product = Object.assign({}, product);
        product.variants = product.variants.map(function(v) {
          return Object.assign({}, v, { price: ov[product.id].price });
        });
      }
      return product;
    }
    product = Object.assign({}, product);
    product._sale = sale;
    product.badge = sale.label || 'sale';
    product.oldPrice = product.oldPrice || sale.old_price || product.variants[0].price;
    product.variants = product.variants.map(function(v) {
      return Object.assign({}, v, { price: sale.sale_price });
    });
    return product;
  },

  getActiveSales: function() {
    return this.active;
  },

  hasActiveSales: function() {
    return this.active.length > 0;
  },

  // ─── Shared helpers ───

  closeSalePopup: function() {
    document.getElementById('salePopup').classList.remove('open');
    sessionStorage.setItem('sale_popup_shown', '1');
  },

  showSalePopup: function(sales) {
    if (sessionStorage.getItem('sale_popup_shown')) return;
    if (!sales || !sales.length) return;
    var body = document.getElementById('salePopupBody');
    var media = document.getElementById('salePopupMedia');
    if (!body) return;
    var html = '';
    sales.forEach(function(s) {
      var product = (window.PRODUCTS_DB || []).find(function(p) { return p.id === s.product_id; });
      html += '<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--gray-200);">';
      if (product) html += '<strong>' + product.name + '</strong><br>';
      html += '<span style="color:var(--accent);font-weight:700;">N$' + s.sale_price + '</span>';
      if (s.old_price) html += ' <span style="text-decoration:line-through;color:var(--gray-400);font-size:13px;">N$' + s.old_price + '</span>';
      html += '</div>';
    });
    body.innerHTML = html;
    if (sales[0].ad_image) {
      media.innerHTML = '<img src="' + sales[0].ad_image + '" alt="Sale" style="max-width:100%;border-radius:var(--radius-sm);max-height:180px;object-fit:cover;" />';
    } else if (sales[0].ad_video) {
      media.innerHTML = '<video src="' + sales[0].ad_video + '" autoplay muted loop style="max-width:100%;border-radius:var(--radius-sm);max-height:180px;object-fit:cover;"></video>';
    }
    setTimeout(function() {
      document.getElementById('salePopup').classList.add('open');
    }, 1500);
  },

  // ─── Consolidated loading ───

  loadAll: function(callback) {
    var self = this;
    Promise.all([
      fetch('/api/product-overrides').then(function(r) { return r.json().then(function(d) { return (d && d.overrides) || []; }).catch(function() { return []; }); }),
      fetch('/api/sales').then(function(r) { return r.json().then(function(d) { return (d && d.sales) || []; }).catch(function() { return []; }); }),
      fetch('/api/custom-products').then(function(r) { return r.json().then(function(d) { return (d && d.products) || []; }).catch(function() { return []; }); })
    ]).then(function(results) {
      var overrides = results[0];
      var sales = results[1];
      var customProducts = results[2];

      window._productOverrides = {};
      overrides.forEach(function(ov) {
        window._productOverrides[ov.product_id] = ov;
      });

      self.active = sales;
      self.loaded = true;

      var db = window.PRODUCTS_DB;
      if (db) {
        customProducts.forEach(function(cp) {
          var variants = [];
          try { variants = JSON.parse(cp.variants_json || '[]'); } catch(e) { variants = [{label:'Default',price:0}]; }
          var p = {
            id: cp.id, name: cp.name, category: cp.category || 'Uncategorized',
            image: cp.image || '', badge: cp.badge || null, date: cp.date || null,
            description: cp.description || '', compatibility: cp.compatibility || '', specs: cp.specs || '',
            variants: variants
          };
          var idx = db.findIndex(function(x) { return x.id === cp.id; });
          if (idx >= 0) { db[idx] = p; } else { db.push(p); }
        });

        var hiddenIds = {};
        overrides.forEach(function(ov) { if (ov.hidden) hiddenIds[ov.product_id] = true; });
        var removed = 0;
        while (removed < db.length) {
          if (hiddenIds[db[removed].id]) { db.splice(removed, 1); }
          else { removed++; }
        }

        sales.forEach(function(sale) {
          var product = db.find(function(p) { return p.id === sale.product_id; });
          if (!product) return;
          product._sale = sale;
          product.badge = sale.label || 'sale';
          product.oldPrice = product.oldPrice || sale.old_price || product.variants[0].price;
          product.variants.forEach(function(v) { v.price = sale.sale_price; });
        });

        overrides.forEach(function(ov) {
          if (ov.hidden) return;
          var product = db.find(function(p) { return p.id === ov.product_id; });
          if (!product) return;
          if (ov.price) { product.variants.forEach(function(v) { v.price = ov.price; }); }
          if (ov.description) product.description = ov.description;
          if (ov.compatibility) product.compatibility = ov.compatibility;
          if (ov.specs) product.specs = ov.specs;
          if (ov.name) product.name = ov.name;
          if (ov.image) {
            product.image = ov.image;
            product.variants.forEach(function(v) { if (v.image) v.image = ov.image; });
          }
          if (ov.variants_json) {
            try { product.variants = JSON.parse(ov.variants_json); } catch(e) {}
          }
        });
      }

      if (callback) callback({ overrides: overrides, sales: sales });
    });
  }
};

window.closeSalePopup = function() { window.SALES.closeSalePopup(); };
