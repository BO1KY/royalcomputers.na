/* ── escapeHtml helper ── */
function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Known Brands ── */
var KNOWN_BRANDS = ['hp','lenovo','asus','dell','acer','samsung','toshiba','msi','sony','ibm','clevo','benq','packard bell','gateway','emachines','proline','connex','kmax','fujitsu','lg','nec','panasonic','huawei','xiaomi'];

/* ── Guide category mapping to PRODUCTS_DB ── */
function getGuideItemsFromDB(type) {
  var db = window.PRODUCTS_DB || [];
  var catMap = { charger: 'Chargers', port: 'Laptop Ports', screen: 'Screens' };
  var cat = catMap[type];
  if (!cat) return [];
  return db.filter(function(p) { return p.category === cat; }).map(function(p) {
    var base = {
      code: p.id,
      price: p.variants && p.variants.length ? p.variants[0].price : 0,
      image: p.image || null
    };
    if (type === 'screen') {
      base.desc = p.name;
      base.size = p.size || '';
      base.pin = p.pin || '';
    } else {
      base.brand = p.brand || '';
      base.desc = p.name;
      base.connector = p.connector || '';
      base.compat = p.compatibility || '';
    }
    return base;
  });
}

/* ── Guide Data ── */
var GUIDE_DATA_CACHE = {};
function getGuideDataCached(type) {
  if (!GUIDE_DATA_CACHE[type]) {
    var meta = {
      charger: {
        title: '\u26A1 Laptop Charger Guide',
        icon: '\u26A1',
        placeholder: 'Search by brand, voltage, or connector type\u2026',
        hint: '\uD83D\uDCD6 How to find your charger specifications',
        hintContent: '<p><strong>On the original charger:</strong> Look for the output label (e.g., "19V - 4.74A") and connector tip shape/size.</p><p><strong>On your laptop:</strong> Check the bottom sticker for the model number and power requirements.</p><p><strong>Connector types:</strong> Common sizes include 4.8x1.7mm (HP), 5.5x2.5mm (Universal), 4.0x1.7mm (Lenovo IdeaPad), rectangular slim tip (ThinkPad), blue tip 7.4x5.0mm (HP Envy).</p><p style="margin-top:6px;color:#e5383b;font-weight:600;">Tip: Search by brand, voltage (e.g., "19V"), or connector size!</p>'
      },
      port: {
        title: '\uD83D\uDCA1 Charging Port & DC Jack Guide',
        icon: '\uD83D\uDCA1',
        placeholder: 'Search by brand, laptop model, or connector type\u2026',
        hint: '\uD83D\uDCD6 How to identify your charging port',
        hintContent: '<p><strong>Check your laptop model:</strong> Look on the bottom sticker for the full model number (e.g., "HP 250 G7", "Dell Inspiron 15-5555").</p><p><strong>Inspect the port:</strong> Common types include barrel connectors (4.0x1.7mm, 4.5x3.0mm), rectangular, and USB-C.</p><p><strong>Note the shape:</strong> Some ports are soldered directly to the motherboard; others have a cable. We stock both types.</p><p style="margin-top:6px;color:#e5383b;font-weight:600;">Tip: Search by laptop brand + model number for the best results!</p>'
      },
      screen: {
        title: '\uD83D\uDCE1 LCD, LED Screen Guide',
        icon: '\uD83D\uDCE1',
        placeholder: 'Search by size, pin type, or laptop model\u2026',
        hint: '\uD83D\uDCD6 How to find your screen specifications',
        hintContent: '<p><strong>Measure the screen diagonally:</strong> Common sizes include 15.6", 14.0", 13.3", 11.6", 10.1" for laptops, and 18.5"\u201324" for monitors.</p><p><strong>Check the connector:</strong> Count the pins (30-pin or 40-pin) and note if it\'s a standard or slim connector.</p><p><strong>Look for the part number:</strong> A sticker on the back of the screen usually has a model number like "NT156WHM-N50".</p><p style="margin-top:6px;color:#e5383b;font-weight:600;">Tip: Search by part number, size (e.g., "15.6"), or pin type (e.g., "30pin")!</p>'
      }
    };
    var m = meta[type] || {};
    GUIDE_DATA_CACHE[type] = {
      type: type,
      title: m.title || '',
      icon: m.icon || '',
      placeholder: m.placeholder || '',
      hint: m.hint || '',
      hintContent: m.hintContent || '',
      items: getGuideItemsFromDB(type)
    };
  }
  return GUIDE_DATA_CACHE[type];
}

/* ── Modal Functions ── */
function getBatteryItems() {
  var items = [];
  var db = window.PRODUCTS_DB || [];
  db.forEach(function(p) {
    if (p.category === 'Batteries' && p.variants) {
      p.variants.forEach(function(v) {
        items.push({
          code: p.id,
          brand: p.brand || p.name.split(/\s/)[0],
          desc: p.name.replace(/ Notebook Battery$/, '') + ' \u2014 ' + v.label,
          price: v.price,
          compat: p.name,
          image: p.image || null,
          productId: p.id
        });
      });
    }
  });
  return items;
}

var GUIDE_DATA_BATTERY = null;

function getGuideData(type) {
  if (type === 'battery') {
    if (!GUIDE_DATA_BATTERY) {
      GUIDE_DATA_BATTERY = {
        type: 'battery',
        title: '\uD83D\uDD0B Battery Guide',
        icon: '\uD83D\uDD0B',
        placeholder: 'Search battery model or laptop model\u2026',
        hint: '\uD83D\uDCD6 Where to find your battery model number',
        hintContent: '<p><strong>On the battery itself:</strong> Remove the battery from your laptop. Look for a label with a model number like "HSTNN-FB40" or "PA3536u".</p><p><strong>On your laptop:</strong> Check the sticker on the bottom of your laptop for the full model number (e.g., "HP Pavilion DV4", "Dell Latitude E7240").</p><p><strong>In System Settings:</strong> On Windows, go to <strong>Settings &gt; System &gt; About</strong> to find your laptop model.</p><p style="margin-top:6px;color:#e5383b;font-weight:600;">Tip: Search by either battery part number OR laptop brand + model!</p>',
        items: getBatteryItems()
      };
    }
    return GUIDE_DATA_BATTERY;
  }
  return getGuideDataCached(type);
}

function openGuideModal(type) {
  var modal = document.getElementById('guideModal');
  if (!modal) return;

  var data = getGuideData(type);
  if (!data) return;

  document.getElementById('guideModalTitle').innerHTML = '<span>' + data.icon + '</span> ' + data.title.replace(/^.*?\s/, '');

  var body = document.getElementById('guideModalBody');
  var chips = '';
  var brandSet = {};
  data.items.forEach(function(item) {
    var key = item.brand || item.size;
    if (key && !brandSet[key]) { brandSet[key] = true; chips += '<span class="brand-chip" data-key="' + key.replace(/"/g, '&quot;') + '">' + key + '</span> '; }
  });

  body.innerHTML =
    '<div class="bg-search">' +
      '<input type="text" id="gmSearchInput" placeholder="' + data.placeholder + '" autocomplete="off" inputmode="text">' +
      '<button class="bg-search-btn" id="gmSearchBtn">Search</button>' +
    '</div>' +
    '<details class="bg-hint">' +
      '<summary>' + data.hint + '</summary>' +
      '<div class="hint-content">' + data.hintContent + '</div>' +
    '</details>' +
    '<div class="bg-results" id="gmResults">' +
      '<div class="bg-initial" id="gmInitial">' +
        '<p>Search above or click to browse:</p>' +
        '<div class="brand-chips">' + chips + '</div>' +
      '</div>' +
    '</div>';

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  var input = document.getElementById('gmSearchInput');
  if (input) input.focus();

  var currentData = data;

  function debounce(fn, ms) {
    var timer;
    return function () {
      clearTimeout(timer);
      var args = arguments;
      var ctx = this;
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  var debouncedSearch = debounce(function () {
    searchGuideItems(currentData, document.getElementById('gmSearchInput').value);
  }, 300);

  document.getElementById('gmSearchBtn').onclick = function () { searchGuideItems(currentData, document.getElementById('gmSearchInput').value); };
  document.getElementById('gmSearchInput').oninput = debouncedSearch;
  document.getElementById('gmSearchInput').onkeydown = function(e) { if (e.key === 'Enter') searchGuideItems(currentData, this.value); };
  document.querySelectorAll('#gmResults .brand-chip').forEach(function(chip) {
    chip.onclick = function() {
      document.getElementById('gmSearchInput').value = this.dataset.key;
      searchGuideItems(currentData, this.dataset.key);
    };
  });
}

function closeGuideModal() {
  var modal = document.getElementById('guideModal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
  window.closeCloverSuggestion && window.closeCloverSuggestion();
}

function searchGuideItems(data, query) {
  var resultsEl = document.getElementById('gmResults');
  var initialEl = document.getElementById('gmInitial');
  if (!resultsEl) return;
  if (initialEl) initialEl.style.display = 'none';

  var q = query.trim().toLowerCase();
  if (!q) {
    if (initialEl) initialEl.style.display = '';
    resultsEl.innerHTML = '';
    return;
  }

  // Show skeleton while searching
  resultsEl.innerHTML =
    '<div class="bg-skeleton-card"><div class="bg-skeleton-img"></div><div class="bg-skeleton-lines"><div class="bg-skel-line wide"></div><div class="bg-skel-line medium"></div><div class="bg-skel-line short"></div></div></div>' +
    '<div class="bg-skeleton-card"><div class="bg-skeleton-img"></div><div class="bg-skeleton-lines"><div class="bg-skel-line wide"></div><div class="bg-skel-line medium"></div><div class="bg-skel-line short"></div></div></div>' +
    '<div class="bg-skeleton-card"><div class="bg-skeleton-img"></div><div class="bg-skeleton-lines"><div class="bg-skel-line wide"></div><div class="bg-skel-line medium"></div><div class="bg-skel-line short"></div></div></div>';

  clearTimeout(resultsEl._skelTimer);
  resultsEl._skelTimer = setTimeout(function() {
    var matches;

    // ── Battery-specific search ──
    if (data.type === 'battery') {
      matches = searchBatteries(q, data);
    } else {
      // Standard search for chargers / ports / screens
      matches = data.items.filter(function(item) {
        return (item.brand && item.brand.toLowerCase().includes(q)) ||
               (item.desc && item.desc.toLowerCase().includes(q)) ||
               (item.connector && item.connector.toLowerCase().includes(q)) ||
               (item.compat && item.compat.toLowerCase().includes(q)) ||
               (item.code && item.code.toLowerCase().includes(q)) ||
               (item.size && item.size.toLowerCase().includes(q)) ||
               (item.pin && item.pin.toLowerCase().includes(q));
      });
    }

    if (matches.length === 0) {
      var label = data.title.replace(/^.*?\s/, '');
      var specialPrice = data.type === 'battery' ? 'N$1,700' : 'market price';
      var safeQuery = escHtml(query.trim());
      var safeQueryAttr = query.trim().replace(/'/g, "\\'").replace(/</g, '').replace(/>/g, '').replace(/"/g, '&quot;');
      resultsEl.innerHTML =
        '<div class="bg-no-results">' +
          '<p>No ' + label + ' found matching "' + safeQuery + '"</p>' +
          '<p>We may still be able to help!</p>' +
          '<div class="special-order-box">' +
            '<p><strong>Special Order Available</strong></p>' +
            '<p>Estimated price: <strong>' + specialPrice + '</strong> | Delivery: <strong>6\u20138 weeks</strong></p>' +
            '<p style="background:#fff3cd;padding:8px 12px;border-radius:4px;font-size:13px;"><strong>Note:</strong> A <strong>50% deposit</strong> is required to proceed with special orders.</p>' +
            '<p>Click below to inquire:</p>' +
            '<button class="special-order-btn" onclick="openStockCheck(\'SPECIAL\',\'\',\'' + safeQueryAttr + '\',0,\'\')">\uD83D\uDCF1 Request Special Order</button>' +
          '</div>' +
        '</div>';
      return;
    }

    resultsEl.innerHTML = matches.map(function(item) {
    var label = item.brand || item.size || '';
    var detail = item.desc + (item.connector && item.connector !== '\u2013' ? ' \u00B7 ' + item.connector : '') + (item.pin ? ' \u00B7 ' + item.pin : '');
    var imgHtml = item.image ? '<div class="bg-result-img"><img src="' + item.image + '" alt="' + label + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'"></div>' : '';
    var code = (item.code || '').replace(/'/g, "\\'");
    var brand = (item.brand || item.size || '').replace(/'/g, "\\'");
    var desc = item.desc.replace(/'/g, "\\'");
    var img = (item.image || '').replace(/'/g, "\\'");
    return '<div class="bg-result-item">' +
      imgHtml +
      '<div class="bg-result-info">' +
      '<span class="bg-result-brand">' + label + '</span>' +
      '<span class="bg-result-model">' + detail + '</span>' +
      '<span class="bg-result-price">N$' + item.price.toFixed(2) + '</span>' +
      '</div>' +
      '<div class="bg-result-actions">' +
        '<button class="bg-add-btn" onclick="addGuideItemToCart(\'' + code + '\',\'' + brand + '\',\'' + desc + '\',' + item.price + ',\'' + img + '\')">\uD83D\uDED2 Add to Cart</button>' +
        '<button class="bg-inquire-btn" onclick="openStockCheck(\'' + code + '\',\'' + brand + '\',\'' + desc + '\',' + item.price + ',\'' + img + '\')">\uD83D\uDCF1 Check Stock</button>' +
      '</div>' +
    '</div>';
  }).join('');
    });
  }

/* ── Battery-specific search logic ── */
function searchBatteries(q, data) {
  var db = window.PRODUCTS_DB || [];
  var map = window.ORIGINAL_TO_FACTORY || {};
  var ql = q.toLowerCase();

  // 1. Check if query matches an original battery code
  var factoryMatch = map[ql];
  if (factoryMatch) {
    var codes = Array.isArray(factoryMatch) ? factoryMatch : [factoryMatch];
    var found = [];
    codes.forEach(function(code) {
      var product = db.find(function(p) { return p.id === code && p.category === 'Batteries'; });
      if (product) {
        product.variants.forEach(function(v) {
          found.push({
            code: product.id,
            brand: product.brand || product.name.split(/\s/)[0],
            desc: product.name.replace(/ Notebook Battery$/, '') + ' \u2014 ' + v.label,
            price: v.price,
            compat: product.name,
            image: product.image || null,
            productId: product.id
          });
        });
      }
    });
    if (found.length > 0) return found;
    // Factory code not in DB -> fall through to special order
  }

  // 2. Check if query matches a known brand name
  var isBrand = false;
  KNOWN_BRANDS.forEach(function(brand) {
    if (q === brand || q.indexOf(brand) === 0 || q.indexOf(' ' + brand) >= 0) isBrand = true;
  });
  if (isBrand) {
    var brandResults = [];
    db.forEach(function(p) {
      if (p.category === 'Batteries' && p.variants) {
        var brandField = (p.brand || '').toLowerCase();
        var nameField = (p.name || '').toLowerCase();
        if (brandField.indexOf(q) >= 0 || nameField.indexOf(q) >= 0) {
          p.variants.forEach(function(v) {
            brandResults.push({
              code: p.id,
              brand: p.brand || p.name.split(/\s/)[0],
              desc: p.name.replace(/ Notebook Battery$/, '') + ' \u2014 ' + v.label,
              price: v.price,
              compat: p.name,
              image: p.image || null,
              productId: p.id
            });
          });
        }
      }
    });
    if (brandResults.length > 0) return brandResults;
  }

  // 3. Fallback: search by factory code, description, compatible models
  return data.items.filter(function(item) {
    return (item.code && item.code.toLowerCase().includes(q)) ||
           (item.desc && item.desc.toLowerCase().includes(q)) ||
           (item.compat && item.compat.toLowerCase().includes(q)) ||
           (item.brand && item.brand.toLowerCase().includes(q));
  });
}

/* ── Add to Cart from Guide ── */
window.addGuideItemToCart = function(code, brand, desc, price, image) {
  var db = window.PRODUCTS_DB || [];
  var product = db.find(function(p) { return p.id === code; });
  if (product && window.CART) {
    window.CART.add(product, 0);
    showGuideToast('\u2705 Added to cart: ' + product.name);
  } else if (window.CART) {
    var fallback = {
      id: code,
      name: desc + ' (' + brand + ')',
      category: 'Guide Items',
      image: image || 'ROYAL PICS/laptop battery replacement.webp',
      badge: null,
      date: new Date().toISOString().slice(0, 10),
      variants: [{ label: brand || 'Standard', price: price }]
    };
    window.CART.add(fallback, 0);
    showGuideToast('\u2705 Added to cart: ' + (desc || code));
  }

  // Suggest clover power cable for charger purchases
  if (code && code.indexOf('NTCHR-') === 0) {
    setTimeout(function() { window.suggestCloverCable && window.suggestCloverCable(); }, 500);
  }
};

/* ── Clover Cable Upsell ── */
window.suggestCloverCable = function() {
  if (document.getElementById('cloverSuggestion')) return;
  var db = window.PRODUCTS_DB || [];
  var cbl10 = db.find(function(p) { return p.id === 'cbl10'; });
  if (!cbl10 || !window.CART) return;
  var clover = cbl10.variants.find(function(v) { return v.label.toLowerCase().indexOf('clover') >= 0; });
  if (!clover) return;

  var el = document.createElement('div');
  el.id = 'cloverSuggestion';
  el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#fff;border:2px solid #e5383b;border-radius:12px;padding:18px 24px;max-width:420px;width:90%;box-shadow:0 8px 30px rgba(0,0,0,0.25);z-index:99997;font-family:inherit;color:#1a1a1a;text-align:center;animation:fadeInUp 0.3s;';
  el.innerHTML =
    '<div style="font-size:15px;font-weight:700;margin-bottom:6px;">\u26A1 Need a power cable?</div>' +
    '<div style="font-size:13px;color:#555;margin-bottom:14px;">Add a <strong>Notebook Clover Power 1.2m</strong> (N$' + clover.price.toFixed(2) + ') to go with your charger?</div>' +
    '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<button onclick="addCloverAndClose()" style="padding:10px 22px;background:#e5383b;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">Yes, Add It</button>' +
      '<button onclick="closeCloverSuggestion()" style="padding:10px 22px;background:#f0f0f0;color:#555;border:none;border-radius:8px;font-weight:500;font-size:13px;cursor:pointer;">No, Thanks</button>' +
    '</div>';
  document.body.appendChild(el);
};

window.addCloverAndClose = function() {
  var db = window.PRODUCTS_DB || [];
  var cbl10 = db.find(function(p) { return p.id === 'cbl10'; });
  if (cbl10 && window.CART) {
    window.CART.add(cbl10, 1); // variant index 1 = Notebook Clover Power
    showGuideToast('\u2705 Added Notebook Clover Power to cart');
  }
  closeCloverSuggestion();
};

window.closeCloverSuggestion = function() {
  var el = document.getElementById('cloverSuggestion');
  if (el) { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 200); }
};

/* ── Toast Notification ── */
function showGuideToast(msg) {
  var el = document.getElementById('guideToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'guideToast';
    el.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:14px 28px;border-radius:8px;font-size:14px;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:opacity 0.3s;font-family:inherit;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.style.opacity = '0'; }, 2500);
}

/* ── Stock Check Modal ── */
var _scItem = null;

window.openStockCheck = function(code, brand, desc, price, image) {
  _scItem = { code: code, brand: brand, desc: desc, price: price, image: image };
  var existing = document.getElementById('stockCheckModal');
  if (existing) existing.remove();

  var branchOpts = '';
  if (window.BRANCHES) {
    var all = window.BRANCHES.getAllBranches();
    all.forEach(function(b) {
      branchOpts += '<option value="' + b.id + '" ' + (b.isHeadquarters ? 'selected' : '') + '>' + b.name + '</option>';
    });
  }

  var modal = document.createElement('div');
  modal.id = 'stockCheckModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99998;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.25s;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:12px;padding:28px;max-width:480px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;color:#1a1a1a;font-family:inherit;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<h3 style="margin:0;font-size:18px;">\uD83D\uDCF1 Check Stock</h3>' +
        '<button onclick="closeStockCheckModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;padding:0;line-height:1;">&times;</button>' +
      '</div>' +
      (code !== 'SPECIAL' ? '<div style="background:#f5f5f5;padding:14px;border-radius:8px;margin-bottom:18px;border-left:4px solid #e5383b;">' +
        '<div style="font-size:15px;font-weight:600;margin:4px 0;">' + escHtml(desc) + '</div>' +
        (brand ? '<div style="font-size:13px;color:#888;">' + escHtml(brand) + '</div>' : '') +
        (price > 0 ? '<div style="font-size:16px;font-weight:700;color:#e5383b;margin-top:6px;">N$' + Number(price).toFixed(2) + '</div>' : '') +
      '</div>' : '<div style="background:#f5f5f5;padding:14px;border-radius:8px;margin-bottom:18px;border-left:4px solid #e5383b;"><div style="font-size:15px;">Special Request: ' + escHtml(desc) + '</div></div>') +
      '<label style="display:block;font-weight:600;margin-bottom:6px;font-size:14px;">Select Branch</label>' +
      '<select id="scBranchSelect" style="width:100%;padding:10px 12px;border:1.5px solid #ddd;border-radius:6px;font-size:14px;margin-bottom:20px;font-family:inherit;background:#fff;">' +
        branchOpts +
      '</select>' +
      '<div id="scBranchInfo" style="font-size:13px;color:#555;margin-bottom:16px;padding:10px 12px;background:#f9f9f9;border-radius:6px;"></div>' +
      '<div style="display:flex;gap:12px;">' +
        '<button onclick="scWhatsApp()" style="flex:1;padding:12px;background:#25D366;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;">\uD83D\uDCF1 WhatsApp</button>' +
        '<button onclick="scEmail()" style="flex:1;padding:12px;background:#e5383b;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;">\u2709 Email</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
  var sel = document.getElementById('scBranchSelect');
  function updateBranchInfo() {
    var b = scGetBranch();
    var info = document.getElementById('scBranchInfo');
    if (b && info) {
      info.innerHTML = '<strong>' + escHtml(b.name) + '</strong><br>' + escHtml(b.address) +
        '<br>Phone: ' + escHtml(b.phone) +
        (b.whatsapp ? '<br>WhatsApp: ' + escHtml(b.whatsapp) : '') +
        '<br>Email: ' + escHtml(b.email);
    }
  }
  if (sel) { sel.onchange = updateBranchInfo; }
  updateBranchInfo();
  requestAnimationFrame(function() { modal.style.opacity = '1'; });
};

window.closeStockCheckModal = function() {
  var modal = document.getElementById('stockCheckModal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(function() { modal.remove(); }, 250);
  }
};

function scGetBranch() {
  var sel = document.getElementById('scBranchSelect');
  if (!sel || !window.BRANCHES) return null;
  return window.BRANCHES.getBranchById(sel.value);
}

window.scWhatsApp = function() {
  var branch = scGetBranch();
  var phone = branch ? (branch.whatsapp || branch.phone).replace(/[^0-9]/g, '') : '264813631483';
  var branchName = branch ? branch.name : 'Royal Computers';
  var item = _scItem;
  var itemLine = '';
  var isSpecial = item && item.code === 'SPECIAL';
  if (item && !isSpecial) {
    itemLine = ' - ' + (item.desc || '') + (item.brand ? ' (' + item.brand + ')' : '') + (item.price > 0 ? ' - N$' + Number(item.price).toFixed(2) : '');
  } else if (item) {
    itemLine = ' - ' + (item.desc || 'Special Request');
  }
  var msg = isSpecial ? 'Good day, I would like to place a special order for:' + itemLine : 'Good day, I would like to check stock availability for:' + itemLine;
  closeStockCheckModal();
  setTimeout(function() {
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank');
  }, 300);
};

window.scEmail = function() {
  var branch = scGetBranch();
  var email = branch ? branch.email : 'windhoek@netmac.co.za';
  var branchName = branch ? branch.name : 'Royal Computers';
  var item = _scItem;
  var isSpecial = item && item.code === 'SPECIAL';
  var itemBlock = 'Stock Inquiry';
  if (item && !isSpecial) {
    itemBlock = 'Item: ' + (item.desc || '') + '\nCode: ' + item.code + (item.brand ? '\nBrand: ' + item.brand : '') + (item.price > 0 ? '\nPrice: N$' + Number(item.price).toFixed(2) : '');
  } else if (item) {
    itemBlock = 'Special Order: ' + (item.desc || '');
  }
  var subject = encodeURIComponent((isSpecial ? 'Special Order Request' : 'Stock Inquiry') + ' - ' + (item && item.desc ? item.desc : ''));
  var body = encodeURIComponent(isSpecial
    ? 'Good day,\n\nI would like to place a special order for the following item:\n\n' + itemBlock + '\n\nRegards'
    : 'Good day,\n\nI would like to check the stock availability for the following item:\n\n' + itemBlock + '\n\nRegards');
  closeStockCheckModal();
  setTimeout(function() {
    window.location.href = 'mailto:' + email + '?subject=' + subject + '&body=' + body;
  }, 300);
};

// Close stock check on overlay click
document.addEventListener('click', function(e) {
  var modal = document.getElementById('stockCheckModal');
  if (modal && modal.style.opacity === '1' && e.target === modal) {
    closeStockCheckModal();
  }
});

/* ── Dropdown Toggle ── */
function toggleGuidesDropdown(el) {
  var li = el.tagName === 'LI' ? el : (el.closest ? el.closest('li') : null);
  if (!li) li = el.parentElement;
  if (!li || li.tagName !== 'LI') return false;

  var isOpen = li.classList.contains('dropdown-open');

  document.querySelectorAll('nav li.dropdown-open').forEach(function(l) {
    if (l !== li) l.classList.remove('dropdown-open');
  });

  if (!isOpen) {
    li.classList.add('dropdown-open');
  } else {
    li.classList.remove('dropdown-open');
  }

  return false;
}

/* Handle all guide clicks via delegation */
document.addEventListener('click', function(e) {
  var target = e.target;

  var guideLink = target.closest ? target.closest('[data-guide]') : null;
  if (guideLink) {
    e.preventDefault();
    var type = guideLink.getAttribute('data-guide');
    if (type) openGuideModal(type);
    return;
  }

  var toggleLink = target.closest ? target.closest('[data-toggle-guides]') : null;
  if (toggleLink) {
    e.preventDefault();
    toggleGuidesDropdown(toggleLink);
    return;
  }

  var li = target.closest ? target.closest('nav li') : null;
  if (!li || (!li.querySelector('.nav-dropdown') && !li.querySelector('.guides-dropdown'))) {
    document.querySelectorAll('nav li.dropdown-open').forEach(function(l) { l.classList.remove('dropdown-open'); });
  }
});

/* Close modal on overlay click (separate handler) */
document.addEventListener('click', function(e) {
  var modal = document.getElementById('guideModal');
  if (modal && modal.classList.contains('open') && e.target === modal) {
    closeGuideModal();
  }
});
