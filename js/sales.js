function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
  });
}

window.SALES = {
  active: [],
  loaded: false,

  load: function (callback) {
    var self = this;
    fetch('/api/sales')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        self.active = (data && data.sales) || [];
        self.loaded = true;
        if (callback) callback(self.active);
      })
      .catch(function () {
        self.loaded = true;
        if (callback) callback([]);
      });
  },

  getSaleFor: function (productId) {
    return (
      (this.loaded &&
        this.active.find(function (s) {
          return s.product_id === productId;
        })) ||
      null
    );
  },

  applyToProduct: function (product) {
    if (!product || !this.loaded) return product;
    var sale = this.getSaleFor(product.id);
    if (!sale) {
      // Guard: _productOverrides may not exist in the codebase
      var overrides = window._productOverrides || {};
      if (overrides[product.id] && overrides[product.id].price) {
        product = Object.assign({}, product);
        product.variants = product.variants.map(function (v) {
          return Object.assign({}, v, { price: overrides[product.id].price });
        });
      }
      return product;
    }
    product = Object.assign({}, product);
    product._sale = sale;
    product.badge = sale.label || 'sale';
    product.oldPrice =
      product.oldPrice || sale.old_price || product.variants[0].price;
    product.variants = product.variants.map(function (v) {
      return Object.assign({}, v, { price: sale.sale_price });
    });
    return product;
  },

  getActiveSales: function () {
    return this.active;
  },

  hasActiveSales: function () {
    return this.active.length > 0;
  },

  closeSalePopup: function () {
    document.getElementById('salePopup').classList.remove('open');
    sessionStorage.setItem('sale_popup_shown', '1');
  },

  showSalePopup: function (sales) {
    if (sessionStorage.getItem('sale_popup_shown')) return;
    if (!sales || !sales.length) return;

    var body = document.getElementById('salePopupBody');
    var media = document.getElementById('salePopupMedia');
    if (!body) return;

    var html = '';
    sales.forEach(function (s) {
      var product = (window.PRODUCTS_DB || []).find(function (p) {
        return p.id === s.product_id;
      });
      html +=
        '<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--gray-200);">';
      if (product) {
        html += '<strong>' + escapeHtml(product.name) + '</strong><br>';
      }
      html +=
        '<span style="color:var(--red);font-weight:700;">N$' +
        escapeHtml(s.sale_price) +
        '</span>';
      if (s.old_price) {
        html +=
          ' <span style="text-decoration:line-through;color:var(--gray-400);font-size:13px;">N$' +
          escapeHtml(s.old_price) +
          '</span>';
      }
      html += '</div>';
    });
    body.innerHTML = html;

    if (sales[0].ad_image) {
      media.innerHTML =
        '<img src="' +
        escapeHtml(sales[0].ad_image) +
        '" alt="Sale" loading="lazy" style="max-width:100%;border-radius:var(--radius-sm);max-height:180px;object-fit:cover;" />';
    } else if (sales[0].ad_video) {
      media.innerHTML =
        '<video src="' +
        escapeHtml(sales[0].ad_video) +
        '" autoplay muted loop style="max-width:100%;border-radius:var(--radius-sm);max-height:180px;object-fit:cover;"></video>';
    }

    setTimeout(function () {
      document.getElementById('salePopup').classList.add('open');
    }, 1500);
  },

  loadAll: function (callback) {
    var self = this;
    Promise.all([
      fetch('/api/product-overrides')
        .then(function (r) {
          return r
            .json()
            .then(function (d) {
              return (d && d.overrides) || [];
            })
            .catch(function () {
              return [];
            });
        }),
      fetch('/api/sales')
        .then(function (r) {
          return r
            .json()
            .then(function (d) {
              return (d && d.sales) || [];
            })
            .catch(function () {
              return [];
            });
        }),
      fetch('/api/custom-products')
        .then(function (r) {
          return r
            .json()
            .then(function (d) {
              return (d && d.products) || [];
            })
            .catch(function () {
              return [];
            });
        }),
    ]).then(function (results) {
      var overrides = results[0];
      var sales = results[1];
      var customProducts = results[2];

      window._productOverrides = {};
      overrides.forEach(function (o) {
        window._productOverrides[o.product_id] = o;
      });

      self.active = sales;
      self.loaded = true;

      var db = window.PRODUCTS_DB;
      if (db) {
        customProducts.forEach(function (cp) {
          var variants = [];
          try {
            variants = JSON.parse(cp.variants_json || '[]');
          } catch (e) {
            variants = [{ label: 'Default', price: 0 }];
          }
          var product = {
            id: cp.id,
            name: cp.name,
            category: cp.category || 'Uncategorized',
            image: cp.image || '',
            badge: cp.badge || null,
            date: cp.date || null,
            description: cp.description || '',
            compatibility: cp.compatibility || '',
            specs: cp.specs || '',
            variants: variants,
          };
          var idx = db.findIndex(function (p) {
            return p.id === cp.id;
          });
          if (idx >= 0) {
            db[idx] = product;
          } else {
            db.push(product);
          }
        });

        var hidden = {};
        overrides.forEach(function (o) {
          if (o.hidden) hidden[o.product_id] = true;
        });
        for (var i = 0; i < db.length; ) {
          if (hidden[db[i].id]) {
            db.splice(i, 1);
          } else {
            i++;
          }
        }

        sales.forEach(function (s) {
          var p = db.find(function (x) {
            return x.id === s.product_id;
          });
          if (p) {
            p._sale = s;
            p.badge = s.label || 'sale';
            p.oldPrice =
              p.oldPrice || s.old_price || p.variants[0].price;
            p.variants.forEach(function (v) {
              v.price = s.sale_price;
            });
          }
        });

        overrides.forEach(function (o) {
          if (o.hidden) return;
          var p = db.find(function (x) {
            return x.id === o.product_id;
          });
          if (!p) return;
          if (o.price) {
            p.variants.forEach(function (v) {
              v.price = o.price;
            });
          }
          if (o.description) p.description = o.description;
          if (o.compatibility) p.compatibility = o.compatibility;
          if (o.specs) p.specs = o.specs;
          if (o.name) p.name = o.name;
          if (o.image) {
            p.image = o.image;
            p.variants.forEach(function (v) {
              if (v.image) v.image = o.image;
            });
          }
          if (o.variants_json) {
            try {
              p.variants = JSON.parse(o.variants_json);
            } catch (e) {}
          }
        });
      }

      if (callback) callback({ overrides: overrides, sales: sales });
    });
  },
};

window.closeSalePopup = function () {
  window.SALES.closeSalePopup();
};
