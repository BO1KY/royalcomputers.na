module.exports = function (app, db, getUserFromRequest, hashPassword, logAudit, sendError, seedBranchPassword, seedAdminPassword, seedSuperAdminPassword) {

  /* ─── Content Management Tables ─── */
  db.exec("CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')))");
  // Branches CRUD is below
  db.exec("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, image TEXT, link TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");
  db.exec("CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, image TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");
  db.exec("CREATE TABLE IF NOT EXISTS faqs (id TEXT PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");
  db.exec("CREATE TABLE IF NOT EXISTS hero_banners (id TEXT PRIMARY KEY, image TEXT, title TEXT, subtitle TEXT, cta_text TEXT, cta_link TEXT, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");
  db.exec("CREATE TABLE IF NOT EXISTS about_stats (id TEXT PRIMARY KEY, label TEXT NOT NULL, value TEXT NOT NULL, icon TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");
  db.exec("CREATE TABLE IF NOT EXISTS about_values (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, icon TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");
  try { db.exec("ALTER TABLE branches ADD COLUMN is_headquarters INTEGER DEFAULT 0"); } catch (e) {}

  /* ─── Seed data on first run ─── */
  (function seed() {
    var branchUsers = [
      { username: 'windhoek@netmac.co.za', branch_id: 'branch-001' },
      { username: 'swakop@netmec.co.za', branch_id: 'branch-002' },
      { username: 'oshakati@netmac.co.za', branch_id: 'branch-003' },
      { username: 'walvisbay@netmac.co.za', branch_id: 'branch-004' },
      { username: 'tsumeb@netmac.co.za', branch_id: 'branch-005' },
      { username: 'grove@netmac.co.za', branch_id: 'branch-006' }
    ];
    var hasBranchUsers = false;
    try { hasBranchUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE branch_id IS NOT NULL").get().c > 0; } catch (e) {}
    if (!hasBranchUsers) {
      var insertUser = db.prepare("INSERT OR IGNORE INTO users (username, password_hash, name, permissions, branch_id, role) VALUES (?, ?, ?, ?, ?, ?)");
      branchUsers.forEach(function(bu) {
        var branch = db.prepare("SELECT name FROM branches WHERE id = ?").get(bu.branch_id);
        var name = branch ? branch.name : bu.branch_id;
        var hash = hashPassword(seedBranchPassword);
        insertUser.run(bu.username, hash, name, JSON.stringify({ job_cards: true, users: true, sales: true, livechat: true }), bu.branch_id, 'manager');
      });
      branchUsers.forEach(function(bu) {
        var branch = db.prepare("SELECT name FROM branches WHERE id = ?").get(bu.branch_id);
        var name = branch ? 'Admin - ' + branch.name : 'Admin - ' + bu.branch_id;
        var hash = hashPassword(seedAdminPassword);
        var adminUsername = 'admin-' + bu.username.replace('@netmac.co.za','').replace('@netmec.co.za','');
        try { insertUser.run(adminUsername, hash, name, JSON.stringify({ job_cards: true, users: true, sales: true, livechat: true, subscribers: true, messages: true, campaigns: true, products: true, content: true }), bu.branch_id, 'manager'); } catch(e) {}
      });
      try {
        var adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
        if (!adminExists && seedSuperAdminPassword) {
          insertUser.run('admin', hashPassword(seedSuperAdminPassword), 'Super Admin', JSON.stringify({ subscribers: true, messages: true, campaigns: true, products: true, sales: true, livechat: true, users: true, content: true, job_cards: true }), null, 'manager');
        }
      } catch(e) {}
    }

    // Seed content data if tables are empty
    if (db.prepare("SELECT COUNT(*) as c FROM categories").get().c === 0) {
      var insertCat = db.prepare("INSERT INTO categories (id, name, description, image, link, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
      insertCat.run('cat-01', 'Components', 'Motherboards, CPUs, RAM, Graphics Cards', 'ROYAL PICS/cpu core i5.webp', 'products.html?category=Components', 1);
      insertCat.run('cat-02', 'Storage', 'SSD, HDD, Flash Drives, Memory Cards', 'ROYAL PICS/120 GB SSD.webp', 'products.html?category=Storage', 2);
      insertCat.run('cat-03', 'Cables & Adapters', 'HDMI, VGA, USB, converters & switches', 'ROYAL PICS/CBL-DVI-HDMI2.webp', 'products.html?category=Cables%20%26%20Adapters', 3);
      insertCat.run('cat-04', 'Phone Parts', 'Screens, screen protectors, chargers & cables', 'ROYAL PICS/iPhone 11 XR Screen.webp', 'products.html?category=Phone%20Parts', 4);
      insertCat.run('cat-05', 'Printers & Ink', 'Printers, toner cartridges & ink bottles', 'ROYAL PICS/PRNT-01.webp', 'products.html?category=Printers%20%26%20Ink', 5);
      insertCat.run('cat-06', 'TVs & Monitors', 'LED TVs, monitors, projectors & mounts', 'ROYAL PICS/TV-03.webp', 'products.html?category=TVs%20%26%20Monitors', 6);
      insertCat.run('cat-07', 'Networking', 'Switches, Wi-Fi adapters, cables & extenders', 'ROYAL PICS/KMX-NTWK-01.webp', 'products.html?category=Networking', 7);
      insertCat.run('cat-08', 'Power & UPS', 'UPS backup, power supplies & batteries', 'ROYAL PICS/UPS1000.webp', 'products.html?category=Power%20%26%20UPS', 8);
      insertCat.run('cat-09', 'Notebook Parts', 'Screens, batteries, chargers & keyboards', 'ROYAL PICS/laptop battery replacement.webp', 'products.html?category=Notebook%20Parts', 9);
      insertCat.run('cat-10', 'POS & Software', 'Barcode scanners, receipt printers & software', 'ROYAL PICS/POS-03.webp', 'products.html?category=POS%20%26%20Software', 10);
    }

    if (db.prepare("SELECT COUNT(*) as c FROM services").get().c === 0) {
      var insertSvc = db.prepare("INSERT INTO services (id, name, description, image, sort_order) VALUES (?, ?, ?, ?, ?)");
      insertSvc.run('svc-01', 'Laptop Screen Replacement', 'Expert laptop screen repair with quality parts', 'ROYAL PICS/laptop screen replacement.webp', 1);
      insertSvc.run('svc-02', 'Cellphone Screen Replacement', 'Same-day cellphone screen replacement service', 'ROYAL PICS/phone screen replacement.webp', 2);
      insertSvc.run('svc-03', 'Laptop Charging Port Repair', 'Charging port repair for all major laptop brands', 'ROYAL PICS/laptop charging port.webp', 3);
      insertSvc.run('svc-04', 'Laptop Keyboard Replacement', 'Keyboard replacement for laptops', 'ROYAL PICS/laptop keyboard replacement.webp', 4);
      insertSvc.run('svc-05', 'Laptop Battery Replacement', 'Battery replacement for all laptop models', 'ROYAL PICS/laptop battery replacement.webp', 5);
      insertSvc.run('svc-06', 'Laptop RAM Upgrade', 'RAM upgrade services for improved performance', 'ROYAL PICS/laptop ram upgrade.webp', 6);
      insertSvc.run('svc-07', 'Virus Removal', 'Professional virus and malware removal', 'ROYAL PICS/virus removal.webp', 7);
      insertSvc.run('svc-08', 'PC & Laptop Repairs', 'Comprehensive PC and laptop repair services', 'ROYAL PICS/pc laptop repairs.webp', 8);
    }

    if (db.prepare("SELECT COUNT(*) as c FROM faqs").get().c === 0) {
      var insertFaq = db.prepare("INSERT INTO faqs (id, question, answer, sort_order) VALUES (?, ?, ?, ?)");
      insertFaq.run('faq-01', 'What products do you sell?', 'We stock a wide range of tech products including desktop and laptop computers, phone parts (screens, chargers, batteries), printers and ink, TVs and monitors, POS systems, networking equipment, cables and adapters, power supplies and UPS units, and PC components like motherboards, CPUs, RAM, and graphics cards. Browse our full catalogue on the Products page.', 1);
      insertFaq.run('faq-02', 'Do you offer repair services?', 'Yes, we offer laptop and phone repairs including screen replacements, battery replacement, charging port repair, virus removal, hardware upgrades, and diagnostics. Most repairs are completed within 24-48 hours, and screen replacements can often be done same-day. All repairs come with a 6-month warranty.', 2);
      insertFaq.run('faq-03', 'How do I order online?', 'Browse our Products page, add items to your cart, then generate a quote. You can switch between Purchase and Quote mode in the cart sidebar. After submitting your details and selecting a collection branch, we will prepare your order. Visit your chosen branch to collect and pay. For special orders not listed on our site, contact us via WhatsApp.', 3);
      insertFaq.run('faq-04', 'Where are your branches?', 'We have 6 branches across Namibia: Windhoek, Swakopmund, Oshakati, Walvis Bay, Tsumeb, and Grove Mall (Windhoek). Visit our Contact page for addresses and operating hours.', 4);
      insertFaq.run('faq-05', 'How can I find the right battery or charger for my laptop?', 'Use our interactive Guides available in the website navigation. The Battery Guide, Charger Guide, Charging Port Guide, and Screen Guide let you search by brand, model number, or specifications to find compatible parts. If you do not see what you need, we can place a special order — just contact us via WhatsApp or email with your laptop model.', 5);
      insertFaq.run('faq-06', 'What payment methods do you accept?', 'We accept cash, EFT (electronic funds transfer), and card payments at all branches. Contact our sales team for more information on available options.', 6);
      insertFaq.run('faq-07', 'How much do laptop batteries cost?', 'We stock 134 laptop battery models ranging from N$795 to N$1,700. Prices vary by cell count (3-cell, 6-cell, 9-cell, or 12-cell) and brand compatibility. Browse the Battery Guide or visit our Products page for the full price list.', 7);
      insertFaq.run('faq-08', 'How can I check if a battery is compatible with my laptop?', 'Each battery in our catalogue lists its original part numbers and compatible laptop models. You can either search by your laptop brand and model in our Battery Guide, or check the original part number printed on your current battery. If your specific model is not listed, contact us via WhatsApp for a special order.', 8);
      insertFaq.run('faq-09', 'What types of laptop chargers do you stock?', 'We carry 22 charger models covering all major brands. Our range includes HP (4.8x1.7mm, 7.4x5.0mm blue tip, 4.5x3.0mm), Lenovo (rectangular slim tip, 4.0x1.7mm, 7.9x5.5mm square, USB-C), Dell (7.4x5.0mm, 4.5x3.0mm), Acer (5.5x2.5mm, 5.5x1.7mm), Asus (4.0x1.35mm), Samsung (5.5x3.0mm, 3.0x1.0mm), Sony (6.0x4.4mm), universal 65W USB-C chargers, and more. Prices start from N$465.', 9);
    }

    if (db.prepare("SELECT COUNT(*) as c FROM about_stats").get().c === 0) {
      var insertStat = db.prepare("INSERT INTO about_stats (id, label, value, icon, sort_order) VALUES (?, ?, ?, ?, ?)");
      insertStat.run('stat-01', 'Years Experience', '20+', null, 1);
      insertStat.run('stat-02', 'Happy Customers', '50k+', null, 2);
      insertStat.run('stat-03', 'Branches', '6', null, 3);
    }

    if (db.prepare("SELECT COUNT(*) as c FROM about_values").get().c === 0) {
      var insertVal = db.prepare("INSERT INTO about_values (id, title, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)");
      insertVal.run('val-01', 'Quality First', 'We never compromise on quality. Every product we sell and every service we offer meets the highest standards.', 'ROYAL PICS/QUALITY.webp', 1);
      insertVal.run('val-02', 'Customer Focus', 'Our customers are at the heart of everything we do. We listen, understand, and deliver solutions that truly help.', 'ROYAL PICS/CUSTOMER.webp', 2);
      insertVal.run('val-03', 'Innovation', 'We stay ahead of the curve, bringing the latest technology and repair techniques to serve you better.', 'ROYAL PICS/INNOVATION.webp', 3);
      insertVal.run('val-04', 'Integrity', 'Honest pricing, transparent service, and ethical business practices are the foundation of our reputation.', 'ROYAL PICS/INTEGRITY.webp', 4);
      insertVal.run('val-05', 'Fast Service', 'Most repairs completed within 24–48 hours. We value your time and work efficiently to minimize downtime.', 'ROYAL PICS/FAST.webp', 5);
      insertVal.run('val-06', 'Community', 'Proudly Namibian, we support local communities and strive to make technology accessible to everyone.', 'ROYAL PICS/COMMUNITY.webp', 6);
    }

    if (db.prepare("SELECT COUNT(*) as c FROM hero_banners").get().c === 0) {
      var insertHero = db.prepare("INSERT INTO hero_banners (id, image, title, subtitle, sort_order) VALUES (?, ?, ?, ?, ?)");
      insertHero.run('hero-01', 'ROYAL PICS/cpu%20core%20i7.webp', null, null, 1);
      insertHero.run('hero-02', 'ROYAL PICS/120%20GB%20SSD.webp', null, null, 2);
      insertHero.run('hero-03', 'ROYAL PICS/Bluetooth%20Headset.webp', null, null, 3);
      insertHero.run('hero-04', 'ROYAL PICS/TV-03.webp', null, null, 4);
      insertHero.run('hero-05', 'ROYAL PICS/CP-01-P.webp', null, null, 5);
    }
  })();

  /* ─── Public: GET /api/site-data ─── */
  app.get('/api/site-data', function (req, res) {
    try {
      var branches = db.prepare("SELECT * FROM branches ORDER BY sort_order ASC").all();
      var categories = db.prepare("SELECT * FROM categories ORDER BY sort_order ASC").all();
      var services = db.prepare("SELECT * FROM services ORDER BY sort_order ASC").all();
      var faqs = db.prepare("SELECT * FROM faqs ORDER BY sort_order ASC").all();
      var heroBanners = db.prepare("SELECT * FROM hero_banners WHERE is_active = 1 ORDER BY sort_order ASC").all();
      var stats = db.prepare("SELECT * FROM about_stats ORDER BY sort_order ASC").all();
      var values = db.prepare("SELECT * FROM about_values ORDER BY sort_order ASC").all();
      var settings = db.prepare("SELECT * FROM site_settings").all();
      var settingsObj = {};
      settings.forEach(function (s) { settingsObj[s.key] = s.value; });
      res.json({
        success: true,
        branches: branches,
        categories: categories,
        services: services,
        faqs: faqs,
        heroBanners: heroBanners,
        aboutStats: stats,
        aboutValues: values,
        settings: settingsObj
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  function requireContentAccess(req, res) {
    var admin = getUserFromRequest(req);
    if (!admin) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    if (!admin.permissions || !admin.permissions.content) { res.status(403).json({ error: 'Forbidden: content permission required' }); return null; }
    return admin;
  }

  /* ─── Branches CRUD ─── */
  app.get('/api/admin/branches', function (req, res) {
    try {
      if (!requireContentAccess(req, res)) return;
      var rows = db.prepare("SELECT * FROM branches ORDER BY sort_order ASC").all();
      res.json({ success: true, branches: rows });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/admin/branches', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      if (!b.id || !b.name || !b.city || !b.address) return res.status(400).json({ error: 'id, name, city, and address are required' });
      db.prepare("INSERT INTO branches (id, name, city, address, phone, whatsapp, email, latitude, longitude, hours, description, image, is_headquarters, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        b.id, b.name, b.city, b.address, b.phone || null, b.whatsapp || null, b.email || null,
        b.latitude || null, b.longitude || null, b.hours || null, b.description || null,
        b.image || null, b.is_headquarters ? 1 : 0, b.sort_order || 0
      );
      logAudit(admin, 'create-branch', 'Created branch: ' + b.id + ' - ' + b.name, req);
      res.json({ success: true });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint')) return res.status(409).json({ error: 'Branch ID already exists' });
      sendError(res, err);
    }
  });

  app.put('/api/admin/branches/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      db.prepare("UPDATE branches SET name=?, city=?, address=?, phone=?, whatsapp=?, email=?, latitude=?, longitude=?, hours=?, description=?, image=?, is_headquarters=?, sort_order=? WHERE id=?").run(
        b.name, b.city, b.address || null, b.phone || null, b.whatsapp || null, b.email || null,
        b.latitude || null, b.longitude || null, b.hours || null, b.description || null,
        b.image || null, b.is_headquarters ? 1 : 0, b.sort_order || 0, req.params.id
      );
      logAudit(admin, 'update-branch', 'Updated branch: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/admin/branches/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      db.prepare("DELETE FROM branches WHERE id=?").run(req.params.id);
      logAudit(admin, 'delete-branch', 'Deleted branch: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  /* ─── Categories CRUD ─── */
  app.get('/api/admin/categories', function (req, res) {
    try {
      if (!requireContentAccess(req, res)) return;
      var rows = db.prepare("SELECT * FROM categories ORDER BY sort_order ASC").all();
      res.json({ success: true, categories: rows });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/admin/categories', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      if (!b.id || !b.name) return res.status(400).json({ error: 'id and name are required' });
      db.prepare("INSERT INTO categories (id, name, description, image, link, sort_order) VALUES (?, ?, ?, ?, ?, ?)").run(
        b.id, b.name, b.description || null, b.image || null, b.link || null, b.sort_order || 0
      );
      logAudit(admin, 'create-category', 'Created category: ' + b.id + ' - ' + b.name, req);
      res.json({ success: true });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint')) return res.status(409).json({ error: 'Category ID already exists' });
      sendError(res, err);
    }
  });

  app.put('/api/admin/categories/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      db.prepare("UPDATE categories SET name=?, description=?, image=?, link=?, sort_order=? WHERE id=?").run(
        b.name, b.description || null, b.image || null, b.link || null, b.sort_order || 0, req.params.id
      );
      logAudit(admin, 'update-category', 'Updated category: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/admin/categories/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      db.prepare("DELETE FROM categories WHERE id=?").run(req.params.id);
      logAudit(admin, 'delete-category', 'Deleted category: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  /* ─── Services CRUD ─── */
  app.get('/api/admin/services', function (req, res) {
    try {
      if (!requireContentAccess(req, res)) return;
      var rows = db.prepare("SELECT * FROM services ORDER BY sort_order ASC").all();
      res.json({ success: true, services: rows });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/admin/services', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      if (!b.id || !b.name) return res.status(400).json({ error: 'id and name are required' });
      db.prepare("INSERT INTO services (id, name, description, image, sort_order) VALUES (?, ?, ?, ?, ?)").run(
        b.id, b.name, b.description || null, b.image || null, b.sort_order || 0
      );
      logAudit(admin, 'create-service', 'Created service: ' + b.id + ' - ' + b.name, req);
      res.json({ success: true });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint')) return res.status(409).json({ error: 'Service ID already exists' });
      sendError(res, err);
    }
  });

  app.put('/api/admin/services/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      db.prepare("UPDATE services SET name=?, description=?, image=?, sort_order=? WHERE id=?").run(
        b.name, b.description || null, b.image || null, b.sort_order || 0, req.params.id
      );
      logAudit(admin, 'update-service', 'Updated service: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/admin/services/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      db.prepare("DELETE FROM services WHERE id=?").run(req.params.id);
      logAudit(admin, 'delete-service', 'Deleted service: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  /* ─── FAQs CRUD ─── */
  app.get('/api/admin/faqs', function (req, res) {
    try {
      if (!requireContentAccess(req, res)) return;
      var rows = db.prepare("SELECT * FROM faqs ORDER BY sort_order ASC").all();
      res.json({ success: true, faqs: rows });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/admin/faqs', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      if (!b.id || !b.question || !b.answer) return res.status(400).json({ error: 'id, question, and answer are required' });
      db.prepare("INSERT INTO faqs (id, question, answer, sort_order) VALUES (?, ?, ?, ?)").run(
        b.id, b.question, b.answer, b.sort_order || 0
      );
      logAudit(admin, 'create-faq', 'Created FAQ: ' + b.id, req);
      res.json({ success: true });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint')) return res.status(409).json({ error: 'FAQ ID already exists' });
      sendError(res, err);
    }
  });

  app.put('/api/admin/faqs/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      db.prepare("UPDATE faqs SET question=?, answer=?, sort_order=? WHERE id=?").run(
        b.question, b.answer, b.sort_order || 0, req.params.id
      );
      logAudit(admin, 'update-faq', 'Updated FAQ: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/admin/faqs/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      db.prepare("DELETE FROM faqs WHERE id=?").run(req.params.id);
      logAudit(admin, 'delete-faq', 'Deleted FAQ: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  /* ─── Hero Banners CRUD ─── */
  app.get('/api/admin/hero-banners', function (req, res) {
    try {
      if (!requireContentAccess(req, res)) return;
      var rows = db.prepare("SELECT * FROM hero_banners ORDER BY sort_order ASC").all();
      res.json({ success: true, banners: rows });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/admin/hero-banners', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      if (!b.id || !b.image) return res.status(400).json({ error: 'id and image are required' });
      db.prepare("INSERT INTO hero_banners (id, image, title, subtitle, cta_text, cta_link, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        b.id, b.image, b.title || null, b.subtitle || null, b.cta_text || null, b.cta_link || null,
        b.is_active !== undefined ? (b.is_active ? 1 : 0) : 1, b.sort_order || 0
      );
      logAudit(admin, 'create-banner', 'Created banner: ' + b.id, req);
      res.json({ success: true });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint')) return res.status(409).json({ error: 'Banner ID already exists' });
      sendError(res, err);
    }
  });

  app.put('/api/admin/hero-banners/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      db.prepare("UPDATE hero_banners SET image=?, title=?, subtitle=?, cta_text=?, cta_link=?, is_active=?, sort_order=? WHERE id=?").run(
        b.image, b.title || null, b.subtitle || null, b.cta_text || null, b.cta_link || null,
        b.is_active !== undefined ? (b.is_active ? 1 : 0) : 1, b.sort_order || 0, req.params.id
      );
      logAudit(admin, 'update-banner', 'Updated banner: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/admin/hero-banners/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      db.prepare("DELETE FROM hero_banners WHERE id=?").run(req.params.id);
      logAudit(admin, 'delete-banner', 'Deleted banner: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  /* ─── About Stats CRUD ─── */
  app.get('/api/admin/about-stats', function (req, res) {
    try {
      if (!requireContentAccess(req, res)) return;
      var rows = db.prepare("SELECT * FROM about_stats ORDER BY sort_order ASC").all();
      res.json({ success: true, stats: rows });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/admin/about-stats', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      if (!b.id || !b.label || !b.value) return res.status(400).json({ error: 'id, label, and value are required' });
      db.prepare("INSERT INTO about_stats (id, label, value, icon, sort_order) VALUES (?, ?, ?, ?, ?)").run(
        b.id, b.label, b.value, b.icon || null, b.sort_order || 0
      );
      logAudit(admin, 'create-stat', 'Created stat: ' + b.id + ' - ' + b.label, req);
      res.json({ success: true });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint')) return res.status(409).json({ error: 'Stat ID already exists' });
      sendError(res, err);
    }
  });

  app.put('/api/admin/about-stats/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      db.prepare("UPDATE about_stats SET label=?, value=?, icon=?, sort_order=? WHERE id=?").run(
        b.label, b.value, b.icon || null, b.sort_order || 0, req.params.id
      );
      logAudit(admin, 'update-stat', 'Updated stat: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/admin/about-stats/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      db.prepare("DELETE FROM about_stats WHERE id=?").run(req.params.id);
      logAudit(admin, 'delete-stat', 'Deleted stat: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  /* ─── About Values CRUD ─── */
  app.get('/api/admin/about-values', function (req, res) {
    try {
      if (!requireContentAccess(req, res)) return;
      var rows = db.prepare("SELECT * FROM about_values ORDER BY sort_order ASC").all();
      res.json({ success: true, values: rows });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/admin/about-values', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      if (!b.id || !b.title) return res.status(400).json({ error: 'id and title are required' });
      db.prepare("INSERT INTO about_values (id, title, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)").run(
        b.id, b.title, b.description || null, b.icon || null, b.sort_order || 0
      );
      logAudit(admin, 'create-value', 'Created value: ' + b.id + ' - ' + b.title, req);
      res.json({ success: true });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint')) return res.status(409).json({ error: 'Value ID already exists' });
      sendError(res, err);
    }
  });

  app.put('/api/admin/about-values/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var b = req.body;
      db.prepare("UPDATE about_values SET title=?, description=?, icon=?, sort_order=? WHERE id=?").run(
        b.title, b.description || null, b.icon || null, b.sort_order || 0, req.params.id
      );
      logAudit(admin, 'update-value', 'Updated value: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/admin/about-values/:id', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      db.prepare("DELETE FROM about_values WHERE id=?").run(req.params.id);
      logAudit(admin, 'delete-value', 'Deleted value: ' + req.params.id, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  /* ─── Site Settings with allowlist ─── */
  var ALLOWED_SETTINGS = [
    'site_name', 'site_description', 'site_keywords', 'footer_company', 'footer_tagline',
    'footer_address', 'footer_phone', 'footer_whatsapp', 'footer_email',
    'about_subtitle', 'about_who_we_are', 'contact_email', 'contact_phone',
    'social_facebook', 'social_instagram', 'hero_title', 'hero_subtitle'
  ];

  app.get('/api/admin/settings', function (req, res) {
    try {
      if (!requireContentAccess(req, res)) return;
      var rows = db.prepare("SELECT * FROM site_settings").all();
      var settings = {};
      rows.forEach(function (s) { settings[s.key] = s.value; });
      res.json({ success: true, settings: settings });
    } catch (err) { sendError(res, err); }
  });

  app.put('/api/admin/settings', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      var settings = req.body.settings || {};
      Object.keys(settings).forEach(function (key) {
        if (ALLOWED_SETTINGS.indexOf(key) === -1) return;
        var val = settings[key];
        if (val !== null && val !== undefined && val !== '') {
          db.prepare("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").run(key, String(val));
        }
      });
      logAudit(admin, 'update-settings', 'Updated site settings (' + Object.keys(settings).length + ' keys)', req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/admin/settings/:key', function (req, res) {
    try {
      var admin = requireContentAccess(req, res);
      if (!admin) return;
      if (ALLOWED_SETTINGS.indexOf(req.params.key) === -1) return res.status(400).json({ error: 'Invalid setting key' });
      db.prepare("DELETE FROM site_settings WHERE key=?").run(req.params.key);
      logAudit(admin, 'delete-setting', 'Deleted setting: ' + req.params.key, req);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // Job cards are managed in index.js
};
