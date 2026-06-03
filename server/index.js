var express = require('express');
var cors = require('cors');
var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
var Database = require('better-sqlite3');
var nodemailer = require('nodemailer');
var multer = require('multer');
require('dotenv').config({ path: path.join(__dirname, '.env') });

var app = express();
var PORT = process.env.PORT || 3000;
var ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH;
var DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

var sessions = new Map();
var SESSION_TTL = 120 * 60 * 1000;

setInterval(function () {
  var now = Date.now();
  for (var key of sessions.keys()) {
    if (now > sessions.get(key).expires) sessions.delete(key);
  }
}, 60000);

var db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec("CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, created_at TEXT DEFAULT (datetime('now')))");
db.exec("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, email TEXT, company TEXT, subject TEXT, message TEXT, date TEXT)");
db.exec("CREATE TABLE IF NOT EXISTS unsubscribed_notified (email TEXT PRIMARY KEY, notified_at TEXT DEFAULT (datetime('now')))");
db.exec("CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL, sale_price REAL NOT NULL, old_price REAL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, label TEXT DEFAULT 'sale', ad_image TEXT, ad_video TEXT, description TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))");
db.exec("CREATE TABLE IF NOT EXISTS product_overrides (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL UNIQUE, price REAL, description TEXT, compatibility TEXT, specs TEXT, name TEXT, variants_json TEXT, hidden INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')))");
try { db.exec("ALTER TABLE product_overrides ADD COLUMN compatibility TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE product_overrides ADD COLUMN specs TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE product_overrides ADD COLUMN name TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE product_overrides ADD COLUMN hidden INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE product_overrides ADD COLUMN image TEXT"); } catch(e) {}

db.exec("CREATE TABLE IF NOT EXISTS quotations (doc_number TEXT PRIMARY KEY, customer_info TEXT NOT NULL, items TEXT NOT NULL, subtotal REAL, tax REAL, total REAL, branch_id TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");

db.exec("CREATE TABLE IF NOT EXISTS custom_products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, image TEXT, badge TEXT, date TEXT, description TEXT, compatibility TEXT, specs TEXT, variants_json TEXT NOT NULL DEFAULT '[]', hidden INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");

var UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Users table for admin multi-user support
db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')))");

var storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOADS_DIR); },
  filename: function (req, file, cb) {
    var ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext);
  }
});
function imageFilter(req, file, cb) {
  var allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  var ext = path.extname(file.originalname).toLowerCase();
  if (allowed.indexOf(ext) >= 0) { cb(null, true); }
  else { cb(new Error('Only image files are allowed (jpg, jpeg, png, gif, webp, bmp, svg).')); }
}
var upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: imageFilter });

var transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
}

var ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(function (req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(function (req, res, next) {
  var blocked = ['/server/data', '/server/data.db', '/server/data.db-shm', '/server/data.db-wal', '/server/.env'];
  if (blocked.indexOf(req.path) !== -1 || req.path.startsWith('/server/data/')) {
    return res.status(403).send('Forbidden');
  }
  next();
});

app.use(express.static(path.join(__dirname, '..')));

app.get('*', function (req, res, next) {
  if (req.path.indexOf('.') !== -1 || req.path === '/') return next();
  var htmlPath = path.join(__dirname, '..', req.path + '.html');
  try {
    if (require('fs').existsSync(htmlPath)) return res.sendFile(htmlPath);
  } catch (_) {}
  next();
});

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function hashPassword(password) {
  var salt = crypto.randomBytes(16).toString('hex');
  var hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  var parts = stored.split(':');
  if (parts.length !== 2) return false;
  var hash = crypto.scryptSync(password, parts[0], 64).toString('hex');
  return hash === parts[1];
}

function getUserFromToken(body) {
  if (body && body.token && sessions.has(body.token)) {
    var s = sessions.get(body.token);
    if (Date.now() < s.expires) {
      s.expires = Date.now() + SESSION_TTL;
      return s.user || null;
    }
    sessions.delete(body.token);
  }
  return null;
}

function authorize(body) {
  if (body && body.token && sessions.has(body.token)) {
    var s = sessions.get(body.token);
    if (Date.now() < s.expires) {
      s.expires = Date.now() + SESSION_TTL;
      return true;
    }
    sessions.delete(body.token);
  }
  // Master admin password fallback
  if (body && body.password && ADMIN_HASH && sha256(body.password) === ADMIN_HASH) {
    return true;
  }
  return false;
}

app.post('/api/admin/login', function (req, res) {
  try {
    var b = req.body;
    // Try user-based login (username + password)
    if (b && b.username && b.password) {
      var user = db.prepare("SELECT * FROM users WHERE username = ?").get(b.username);
      if (user && verifyPassword(b.password, user.password_hash)) {
        var token = crypto.randomBytes(32).toString('hex');
        var userInfo = { id: user.id, username: user.username, name: user.name, permissions: JSON.parse(user.permissions || '{}') };
        sessions.set(token, { expires: Date.now() + SESSION_TTL, user: userInfo });
        return res.json({ success: true, token: token, user: userInfo });
      }
    }
    // Fallback to master admin password
    if (b && b.password && ADMIN_HASH && sha256(b.password) === ADMIN_HASH) {
      var token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { expires: Date.now() + SESSION_TTL, user: { id: 0, username: 'admin', name: 'Admin', permissions: { subscribers: true, messages: true, campaigns: true, products: true, sales: true, livechat: true, users: true } } });
      return res.json({ success: true, token: token, user: { id: 0, username: 'admin', name: 'Admin', permissions: { subscribers: true, messages: true, campaigns: true, products: true, sales: true, livechat: true, users: true } } });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.get('/api/admin/me', function (req, res) {
  try {
    var user = getUserFromToken(req.query);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ success: true, user: user });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ── User Management (admin only) ──
app.get('/api/admin/users', function (req, res) {
  try {
    var user = getUserFromToken(req.query);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!user.permissions.users) return res.status(403).json({ error: 'Forbidden' });
    var users = db.prepare("SELECT id, username, name, permissions, created_at FROM users ORDER BY id").all();
    res.json({ success: true, users: users });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/admin/users', function (req, res) {
  try {
    var user = getUserFromToken(req.body);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!user.permissions.users) return res.status(403).json({ error: 'Forbidden' });
    var b = req.body;
    if (!b.username || !b.password || !b.name) return res.status(400).json({ error: 'username, password, and name are required' });
    var existing = db.prepare("SELECT id FROM users WHERE username = ?").get(b.username);
    if (existing) return res.status(409).json({ error: 'Username already exists' });
    var password_hash = hashPassword(b.password);
    var permissions = JSON.stringify(b.permissions || {});
    var result = db.prepare("INSERT INTO users (username, password_hash, name, permissions) VALUES (?, ?, ?, ?)").run(b.username, password_hash, b.name, permissions);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/admin/users/:id', function (req, res) {
  try {
    var user = getUserFromToken(req.body);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!user.permissions.users) return res.status(403).json({ error: 'Forbidden' });
    var b = req.body;
    if (b.password) {
      var password_hash = hashPassword(b.password);
      db.prepare("UPDATE users SET password_hash = ?, name = ?, permissions = ? WHERE id = ?").run(password_hash, b.name, JSON.stringify(b.permissions || {}), req.params.id);
    } else {
      db.prepare("UPDATE users SET name = ?, permissions = ? WHERE id = ?").run(b.name, JSON.stringify(b.permissions || {}), req.params.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.delete('/api/admin/users/:id', function (req, res) {
  try {
    var user = getUserFromToken(req.body);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!user.permissions.users) return res.status(403).json({ error: 'Forbidden' });
    db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/subscribe', function (req, res) {
  try {
    var email = (req.body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    var existing = db.prepare("SELECT email FROM subscribers WHERE email = ?").get(email);
    if (existing) {
      return res.status(409).json({ error: 'Already subscribed' });
    }

    db.prepare("INSERT INTO subscribers (email) VALUES (?)").run(email);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/contact', function (req, res) {
  try {
    var name = (req.body.name || '').trim();
    var phone = (req.body.phone || '').trim();
    var email = (req.body.email || '').trim();
    var company = (req.body.company || '').trim();
    var subject = req.body.subject || '';
    var message = (req.body.message || '').trim();
    var date = req.body.date || new Date().toISOString();

    if (!name || !phone || !email || !subject || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    db.prepare("INSERT INTO messages (name, phone, email, company, subject, message, date) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(name, phone, email, company, subject, message, date);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/get-data', function (req, res) {
  try {
    if (!authorize(req.body)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    var subscribers = db.prepare("SELECT email FROM subscribers ORDER BY created_at ASC").all().map(function (r) { return r.email; });
    var messages = db.prepare("SELECT * FROM messages ORDER BY id ASC").all();
    var notified = db.prepare("SELECT email FROM unsubscribed_notified").all().map(function (r) { return r.email; });

    res.json({ subscribers: subscribers, messages: messages, notified: notified });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/check-subscriber', function (req, res) {
  try {
    var email = (req.body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    var existing = db.prepare("SELECT email FROM subscribers WHERE email = ?").get(email);
    res.json({ subscribed: !!existing });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/unsubscribe', function (req, res) {
  try {
    var email = (req.body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    var result = db.prepare("DELETE FROM subscribers WHERE email = ?").run(email);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Email not found in our subscribers list.' });
    }

    res.json({ success: true, message: 'You have been unsubscribed successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/delete-subscriber', function (req, res) {
  try {
    if (!authorize(req.body)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    var email = (req.body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    var result = db.prepare("DELETE FROM subscribers WHERE email = ?").run(email);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/notify-unsubscribe', function (req, res) {
  try {
    if (!authorize(req.body)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    var email = (req.body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    db.prepare("INSERT OR IGNORE INTO unsubscribed_notified (email) VALUES (?)").run(email);

    res.json({ success: true, message: email + ' has been notified of unsubscription.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/clear-data', function (req, res) {
  try {
    if (!authorize(req.body)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    var type = req.body.type || '';
    if (type === 'subscribers') {
      db.prepare("DELETE FROM subscribers").run();
    } else if (type === 'messages') {
      db.prepare("DELETE FROM messages").run();
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/upload', function (req, res) {
  upload.single('file')(req, res, function (err) {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.body || !authorize(req.body)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    var url = '/uploads/' + req.file.filename;
    res.json({ success: true, url: url, filename: req.file.originalname });
  });
});

app.post('/api/send-campaign', function (req, res) {
  try {
    if (!authorize(req.body)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    var t = getTransporter();
    if (!t) {
      return res.status(500).json({ error: 'SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env' });
    }

    var type = req.body.type || 'general';
    var subject = (req.body.subject || '').trim();
    var html = (req.body.html || '').trim();
    var baseUrl = req.body.baseUrl || '';

    if (!subject || !html) {
      return res.status(400).json({ error: 'Subject and content are required' });
    }

    var subscribers = db.prepare("SELECT email FROM subscribers ORDER BY created_at ASC").all().map(function (r) { return r.email; });
    if (!subscribers.length) {
      return res.status(400).json({ error: 'No subscribers to send to' });
    }

    var typeLabels = { promotion: 'Promotion', sale: 'Sale', 'new': 'New Arrival', general: 'Announcement' };
    var typeLabel = typeLabels[type] || 'Announcement';

    var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
      '<title>' + subject + '</title></head><body style="margin:0;padding:0;background:#f4f4f6;font-family:Arial,sans-serif;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;"><tr><td align="center" style="padding:20px;">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">' +
      '<tr><td style="background:#e5383b;padding:20px;text-align:center;">' +
      '<h1 style="color:#fff;margin:0;font-size:22px;">Royal Computers Namibia</h1>' +
      '<p style="color:#fff;opacity:0.9;margin:4px 0 0;font-size:13px;">' + typeLabel + '</p>' +
      '</td></tr>' +
      '<tr><td style="padding:24px;font-size:15px;line-height:1.6;color:#333;">' +
      html +
      '</td></tr>' +
      '<tr><td style="padding:0 24px 24px;"><hr style="border:none;border-top:1px solid #ddd;margin:0 0 16px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
      '<tr><td width="60" style="vertical-align:top;padding-right:12px;">' +
      '<img src="' + baseUrl + '/ROYAL PICS/royal logo.png" alt="Royal Computers" style="width:50px;height:auto;border-radius:4px;" onerror="this.style.display=\'none\'">' +
      '</td>' +
      '<td style="vertical-align:top;font-size:12px;color:#555;line-height:1.5;">' +
      '<strong style="color:#1a1a2e;font-size:13px;">ROYAL COMPUTERS</strong><br>' +
      'GF Shop 12 Gustav Voigts Center, Independence Ave, Windhoek<br>' +
      'Tel: 061228179 | Email: windhoek@netmac.co.za<br>' +
      'www.netmac.co.za | Mon-Fri: 08:30-17:30 | Sat: 08:30-13:00 | Sun: 09:00-13:00' +
      '</td></tr></table>' +
      '</td></tr>' +
      '<tr><td style="background:#1a1a2e;padding:16px;text-align:center;">' +
      '<p style="color:#fff;font-size:12px;margin:0;">&copy; ' + new Date().getFullYear() + ' Royal Computers Namibia</p>' +
      '<p style="color:#aaa;font-size:11px;margin:4px 0 0;">You received this because you subscribed. <a href="' + baseUrl + '/unsubscribe" style="color:#e5383b;">Unsubscribe</a></p>' +
      '</td></tr></table></td></tr></table></body></html>';

    var adminEmail = process.env.SMTP_USER || '';
    var mailOptions = {
      from: '"Royal Computers Namibia" <' + process.env.SMTP_USER + '>',
      to: adminEmail,
      bcc: subscribers.join(', '),
      subject: subject,
      html: fullHtml
    };

    t.sendMail(mailOptions, function (err) {
      if (err) {
        res.status(500).json({ error: err.message || 'Failed to send' });
      } else {
        res.json({ success: true, sent: subscribers.length, total: subscribers.length });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* ─── Sales API ─── */
app.get('/api/sales', function (req, res) {
  try {
    var now = new Date().toISOString();
    var sales = db.prepare("SELECT * FROM sales WHERE active = 1 AND start_date <= ? AND end_date >= ? ORDER BY created_at DESC").all(now, now);
    res.json({ success: true, sales: sales });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.get('/api/sales/all', function (req, res) {
  try {
    if (!authorize(req.query)) return res.status(401).json({ error: 'Unauthorized' });
    var sales = db.prepare("SELECT * FROM sales ORDER BY created_at DESC").all();
    res.json({ success: true, sales: sales });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/sales', function (req, res) {
  try {
    if (!authorize(req.body)) return res.status(401).json({ error: 'Unauthorized' });
    var b = req.body;
    if (!b.product_id || !b.sale_price || !b.start_date || !b.end_date) {
      return res.status(400).json({ error: 'Missing required fields: product_id, sale_price, start_date, end_date' });
    }
    var result = db.prepare("INSERT INTO sales (product_id, sale_price, old_price, start_date, end_date, label, ad_image, ad_video, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      b.product_id, b.sale_price, b.old_price || null, b.start_date, b.end_date, b.label || 'sale', b.ad_image || null, b.ad_video || null, b.description || null
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/sales/:id', function (req, res) {
  try {
    if (!authorize(req.body)) return res.status(401).json({ error: 'Unauthorized' });
    var b = req.body;
    db.prepare("UPDATE sales SET product_id=?, sale_price=?, old_price=?, start_date=?, end_date=?, label=?, ad_image=?, ad_video=?, description=?, active=? WHERE id=?").run(
      b.product_id, b.sale_price, b.old_price || null, b.start_date, b.end_date, b.label || 'sale', b.ad_image || null, b.ad_video || null, b.description || null, b.active !== undefined ? (b.active ? 1 : 0) : 1, req.params.id
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.delete('/api/sales/:id', function (req, res) {
  try {
    if (!authorize(req.body)) return res.status(401).json({ error: 'Unauthorized' });
    db.prepare("DELETE FROM sales WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* ─── Product Overrides API ─── */
app.get('/api/product-overrides', function (req, res) {
  try {
    var overrides = db.prepare("SELECT * FROM product_overrides").all();
    res.json({ success: true, overrides: overrides });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/product-overrides/:productId', function (req, res) {
  try {
    if (!authorize(req.body)) return res.status(401).json({ error: 'Unauthorized' });
    var b = req.body;
    db.prepare("INSERT INTO product_overrides (product_id, price, description, compatibility, specs, name, image, variants_json, hidden, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(product_id) DO UPDATE SET price=excluded.price, description=excluded.description, compatibility=excluded.compatibility, specs=excluded.specs, name=excluded.name, image=excluded.image, variants_json=excluded.variants_json, hidden=excluded.hidden, updated_at=datetime('now')").run(
      req.params.productId, b.price || null, b.description || null, b.compatibility || null, b.specs || null, b.name || null, b.image || null, b.variants_json || null, b.hidden !== undefined ? (b.hidden ? 1 : 0) : 0
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.delete('/api/product-overrides/:productId', function (req, res) {
  try {
    if (!authorize(req.body)) return res.status(401).json({ error: 'Unauthorized' });
    db.prepare("DELETE FROM product_overrides WHERE product_id = ?").run(req.params.productId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* ─── Custom Products API ─── */
app.get('/api/custom-products', function (req, res) {
  try {
    var products = db.prepare("SELECT * FROM custom_products ORDER BY created_at DESC").all();
    res.json({ success: true, products: products });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/custom-products', function (req, res) {
  try {
    if (!authorize(req.body)) return res.status(401).json({ error: 'Unauthorized' });
    var b = req.body;
    if (!b.id || !b.name) return res.status(400).json({ error: 'id and name are required' });
    db.prepare("INSERT INTO custom_products (id, name, category, image, badge, date, description, compatibility, specs, variants_json, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      b.id, b.name, b.category || null, b.image || null, b.badge || null, b.date || null,
      b.description || null, b.compatibility || null, b.specs || null,
      b.variants_json || JSON.stringify([{ label: 'Default', price: 0 }]),
      b.hidden || 0
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/custom-products/:id', function (req, res) {
  try {
    if (!authorize(req.body)) return res.status(401).json({ error: 'Unauthorized' });
    var b = req.body;
    var sets = []; var vals = [];
    ['name','category','image','badge','date','description','compatibility','specs','variants_json','hidden'].forEach(function(k) {
      if (b[k] !== undefined) { sets.push(k + '=?'); vals.push(b[k]); }
    });
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id);
    db.prepare("UPDATE custom_products SET " + sets.join(',') + " WHERE id=?").run.apply(null, vals);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.delete('/api/custom-products/:id', function (req, res) {
  try {
    if (!authorize(req.body)) return res.status(401).json({ error: 'Unauthorized' });
    db.prepare("DELETE FROM custom_products WHERE id=?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* ─── Quotations API ─── */
app.get('/api/quotations', function (req, res) {
  try {
    if (!authorize(req.query)) return res.status(401).json({ error: 'Unauthorized' });
    var search = req.query.search || '';
    var rows;
    if (search) {
      rows = db.prepare("SELECT * FROM quotations WHERE doc_number LIKE ? ORDER BY created_at DESC").all('%' + search + '%');
    } else {
      rows = db.prepare("SELECT * FROM quotations ORDER BY created_at DESC").all();
    }
    res.json({ success: true, quotations: rows });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.get('/api/quotations/:docNumber', function (req, res) {
  try {
    if (!authorize(req.query)) return res.status(401).json({ error: 'Unauthorized' });
    var row = db.prepare("SELECT * FROM quotations WHERE doc_number = ?").get(req.params.docNumber);
    if (!row) return res.status(404).json({ error: 'Quotation not found' });
    res.json({ success: true, quotation: row });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/quotations', function (req, res) {
  try {
    var b = req.body;
    if (!b.doc_number || !b.items) return res.status(400).json({ error: 'doc_number and items are required' });
    db.prepare("INSERT INTO quotations (doc_number, customer_info, items, subtotal, tax, total, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      b.doc_number, JSON.stringify(b.customer_info || {}), JSON.stringify(b.items),
      b.subtotal || 0, b.tax || 0, b.total || 0, b.branch_id || null
    );
    res.json({ success: true });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Quotation with this document number already exists' });
    }
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.put('/api/quotations/:docNumber', function (req, res) {
  try {
    if (!authorize(req.body)) return res.status(401).json({ error: 'Unauthorized' });
    var b = req.body;
    db.prepare("UPDATE quotations SET customer_info=?, items=?, subtotal=?, tax=?, total=?, branch_id=?, updated_at=datetime('now') WHERE doc_number=?").run(
      JSON.stringify(b.customer_info || {}), JSON.stringify(b.items || []),
      b.subtotal || 0, b.tax || 0, b.total || 0, b.branch_id || null, req.params.docNumber
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.delete('/api/quotations/:docNumber', function (req, res) {
  try {
    if (!authorize(req.body)) return res.status(401).json({ error: 'Unauthorized' });
    db.prepare("DELETE FROM quotations WHERE doc_number = ?").run(req.params.docNumber);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.listen(PORT, function () {
  console.log('Royal Computers running on http://localhost:' + PORT);
});
