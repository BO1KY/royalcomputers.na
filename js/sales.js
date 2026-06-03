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
  }
};
