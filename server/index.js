var express = require('express');
var cors = require('cors');
var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
var os = require('os');
var cp = require('child_process');
var Database = require('better-sqlite3');
var nodemailer = require('nodemailer');
var multer = require('multer');
var sharp = require('sharp');
require('dotenv').config({ path: path.join(__dirname, '.env') });

var app = express();
var PORT = process.env.PORT || 3000;
var ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH;
var DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
var SEED_BRANCH_PASSWORD = process.env.SEED_BRANCH_PASSWORD;
var SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
var SEED_SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD || '';
if (!SEED_BRANCH_PASSWORD || !SEED_ADMIN_PASSWORD) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: SEED_BRANCH_PASSWORD and SEED_ADMIN_PASSWORD must be set in production.');
    process.exit(1);
  }
  SEED_BRANCH_PASSWORD = SEED_BRANCH_PASSWORD || 'insecure-dev-only-branch-123';
  SEED_ADMIN_PASSWORD = SEED_ADMIN_PASSWORD || 'insecure-dev-only-admin-123';
  console.warn('WARNING: Using insecure default seed passwords (dev mode only). Set SEED_BRANCH_PASSWORD and SEED_ADMIN_PASSWORD env vars.');
}

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
try { db.exec("ALTER TABLE product_overrides ADD COLUMN badge TEXT"); } catch(e) {}

db.exec("CREATE TABLE IF NOT EXISTS quotations (doc_number TEXT PRIMARY KEY, customer_info TEXT NOT NULL, items TEXT NOT NULL, subtotal REAL, tax REAL, total REAL, branch_id TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");

db.exec("CREATE TABLE IF NOT EXISTS custom_products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, image TEXT, badge TEXT, date TEXT, description TEXT, compatibility TEXT, specs TEXT, variants_json TEXT NOT NULL DEFAULT '[]', hidden INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");
db.exec("CREATE TABLE IF NOT EXISTS branch_products (branch_id TEXT NOT NULL, product_id TEXT NOT NULL, is_available INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (branch_id, product_id))");

var UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Users table for admin multi-user support
db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT '{}', branch_id TEXT, created_at TEXT DEFAULT (datetime('now')))");
try { db.exec("ALTER TABLE users ADD COLUMN branch_id TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'staff'"); } catch (e) {}

db.exec("CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, branch_id TEXT, status TEXT NOT NULL DEFAULT 'pending', requested_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolved_by TEXT)");

// ─── Feature enhancements: new columns & tables ───
try { db.exec("ALTER TABLE subscribers ADD COLUMN source TEXT DEFAULT 'website'"); } catch(e) {}
try { db.exec("ALTER TABLE subscribers ADD COLUMN notes TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE messages ADD COLUMN replied_at TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE messages ADD COLUMN assigned_to TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE quotations ADD COLUMN status TEXT DEFAULT 'pending'"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN last_login TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN created_by INTEGER"); } catch(e) {}
try { db.exec("ALTER TABLE branches ADD COLUMN is_active INTEGER DEFAULT 1"); } catch(e) {}
try { db.exec("ALTER TABLE branches ADD COLUMN latitude REAL"); } catch(e) {}
try { db.exec("ALTER TABLE branches ADD COLUMN longitude REAL"); } catch(e) {}
try { db.exec("ALTER TABLE branches ADD COLUMN hours_json TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE faqs ADD COLUMN category TEXT DEFAULT 'General'"); } catch(e) {}
try { db.exec("ALTER TABLE faqs ADD COLUMN is_active INTEGER DEFAULT 1"); } catch(e) {}

db.exec(`CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_for TEXT,
  sent_at TEXT,
  sent_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS campaign_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  subject TEXT,
  html TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS chat_transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_phone TEXT,
  messages TEXT NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'closed',
  assigned_to TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
try { db.exec("ALTER TABLE audit_log ADD COLUMN ip_address TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE audit_log ADD COLUMN user_agent TEXT"); } catch(e) {}

var storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOADS_DIR); },
  filename: function (req, file, cb) {
    var ext = path.extname(file.originalname).toLowerCase();
    // Save with original extension; endpoints that use sharp conversion handle .webp separately
    cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext);
  }
});
function imageFilter(req, file, cb) {
  var allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];
  var ext = path.extname(file.originalname).toLowerCase();
  if (allowed.indexOf(ext) >= 0) { cb(null, true); }
  else { cb(new Error('Only image files are allowed (jpg, jpeg, png, gif, webp, bmp, tiff). SVGs and PDFs are not accepted.')); }
}
var upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFilter });

// Validate file content via magic bytes (runs after multer saves the file)
function validateMagicBytes(filePath) {
  var fd = fs.openSync(filePath, 'r');
  var buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  // BMP: 42 4D
  if (buf[0] === 0x42 && buf[1] === 0x4D) return true;
  // TIFF (LE): 49 49 2A 00
  if (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2A && buf[3] === 0x00) return true;
  // TIFF (BE): 4D 4D 00 2A
  if (buf[0] === 0x4D && buf[1] === 0x4D && buf[2] === 0x00 && buf[3] === 0x2A) return true;
  // WebP: RIFF (52 49 46 46) .... WEBP (57 45 42 50 at offset 8)
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
  return false;
}

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
  origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : false,
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

// General API rate limiter (per-IP, 120 requests per minute)
var apiLimiter = new Map();
app.use('/api/', function (req, res, next) {
  var ip = req.ip || req.connection.remoteAddress || 'unknown';
  var now = Date.now();
  var entry = apiLimiter.get(ip) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
  entry.count++;
  apiLimiter.set(ip, entry);
  if (entry.count > 120) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  next();
});

// Strip null bytes from request body strings to prevent injection
app.use(function (req, res, next) {
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(function(k) {
      if (typeof req.body[k] === 'string') {
        req.body[k] = req.body[k].replace(/\0/g, '');
      }
    });
  }
  next();
});

function requireAuth(req, res, next) {
  if (authorizeRequest(req)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.use('/uploads', express.static(UPLOADS_DIR));

app.use(function (req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

app.use(function (req, res, next) {
  var blocked = ['/server/data', '/server/data.db', '/server/data.db-shm', '/server/data.db-wal', '/server/.env'];
  if (blocked.indexOf(req.path) !== -1 || req.path.startsWith('/server/data/')) {
    return res.status(403).send('Forbidden');
  }
  next();
});

app.get('/tracking', function(req, res) {
  res.sendFile('tracking.html', { root: path.join(__dirname, '..') });
});

app.use(express.static(path.join(__dirname, '..')));

app.get('*', function (req, res, next) {
  if (req.path.indexOf('.') !== -1 || req.path === '/') return next();
  if (req.path.indexOf('..') !== -1 || req.path.indexOf('~') !== -1) return next();
  var htmlPath = req.path + '.html';
  try {
    if (fs.existsSync(path.join(__dirname, '..', htmlPath))) return res.sendFile(htmlPath, { root: path.join(__dirname, '..') });
  } catch (_) {}
  next();
});

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Master password verification — scrypt only.
// SHA-256 fallback REMOVED for security.
// If ADMIN_HASH is a legacy SHA-256 hash, migrate it to scrypt:
//   1. Set a new password via env: ADMIN_PASSWORD_HASH=salt:scrypt64hash
//   2. Or use the helper: node -e "console.log(require('crypto').randomBytes(16).toString('hex')+':'+require('crypto').scryptSync('your-password',require('crypto').randomBytes(16).toString('hex'),64).toString('hex'))"
function verifyMasterPassword(password) {
  if (!ADMIN_HASH) return false;
  if (ADMIN_HASH.indexOf(':') < 0) {
    console.error('SECURITY: ADMIN_PASSWORD_HASH is a legacy SHA-256 hash. Migrate to scrypt immediately.');
    return false;
  }
  return verifyPassword(password, ADMIN_HASH);
}

// Simple in-memory rate limiter (per-IP, sliding window)
var loginAttempts = new Map();
function checkRateLimit(ip) {
  var now = Date.now();
  var entry = loginAttempts.get(ip) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
  entry.count++;
  loginAttempts.set(ip, entry);
  return entry.count <= 10;
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Origin/Referer check for CSRF protection on public endpoints
function validateSameOrigin(req) {
  var origin = req.headers['origin'];
  var referer = req.headers['referer'];
  var host = req.headers['host'];
  // If no Origin and no Referer, allow (browser always sends Origin/Referer for cross-origin POSTs)
  if (!origin && !referer) return true;
  // Check if origin/referer matches the host
  var allowed = (origin || referer || '').toLowerCase();
  // Accept same-origin requests: origin matches host
  if (allowed.indexOf('://' + host) > 0 || allowed.indexOf('://www.' + host) > 0) return true;
  // Allow localhost in non-production
  if (process.env.NODE_ENV !== 'production' && allowed.indexOf('://localhost') > 0) return true;
  return false;
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

function sendError(res, err) {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

function statusLabel(s) {
  return (s || '').replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

function sendTrackingEmail(jobCard, statusUpdateMsg) {
  try {
    if (!jobCard.client_email) return;
    var branchInfo = db.prepare('SELECT * FROM branches WHERE id = ?').get(jobCard.branch_id);
    var siteData = db.prepare("SELECT value FROM site_settings WHERE key='footer_company'").get();
    var companyName = siteData ? siteData.value : 'Royal Computers Namibia';
    var branchName = branchInfo ? branchInfo.name : '';
    var baseUrl = 'https://netmac.co.za';
    var trackUrl = baseUrl + '/tracking.html?token=' + (jobCard.public_token || '');

    var mailOpts = {
      from: process.env.SMTP_FROM || '"Royal Computers" <noreply@royalcomputers.na>',
      to: jobCard.client_email,
      subject: (statusUpdateMsg || 'Job Card Created') + ' - ' + jobCard.id,
      text: [
        'Dear ' + jobCard.client_name + ',',
        '',
        statusUpdateMsg || 'Your job card has been created.',
        '',
        'Job Card: ' + jobCard.id,
        'Branch: ' + branchName,
        'Status: ' + statusLabel(jobCard.status),
        '',
        'Track your repair status online:',
        trackUrl,
        '',
        'Thank you for choosing ' + companyName + '.',
        'Regards,',
        companyName + ' Workshop Team'
      ].join('\n'),
      html: [
        '<div style="font-family:sans-serif;max-width:500px;">',
        '<h2 style="color:#dc2626;">' + esc(statusUpdateMsg || 'Job Card Created') + '</h2>',
        '<p>Dear <strong>' + esc(jobCard.client_name) + '</strong>,</p>',
        '<p>' + esc(statusUpdateMsg || 'Your job card has been created.') + '</p>',
        '<table style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0;">',
        '<tr><td style="padding:4px 12px 4px 0;font-weight:700;">Job Card:</td><td>' + esc(jobCard.id) + '</td></tr>',
        '<tr><td style="padding:4px 12px 4px 0;font-weight:700;">Branch:</td><td>' + esc(branchName) + '</td></tr>',
        '<tr><td style="padding:4px 12px 4px 0;font-weight:700;">Status:</td><td>' + esc(statusLabel(jobCard.status)) + '</td></tr>',
        '</table>',
        '<p>You can track your repair status anytime:</p>',
        '<p><a href="' + trackUrl + '" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Track Repair Status</a></p>',
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">',
        '<p style="font-size:12px;color:#6b7280;">If you did not request this repair, please ignore this email.</p>',
        '</div>'
      ].join('')
    };

    var t = getTransporter();
    if (t) {
      t.sendMail(mailOpts).catch(function(mailErr) {
        console.error('Failed to send tracking email:', mailErr.message);
      });
    }
  } catch (emailErr) {
    console.error('Tracking email error:', emailErr.message);
  }
}

function logAudit(user, action, details, req) {
  try {
    var ip = req ? (req.ip || req.connection.remoteAddress || '') : '';
    var ua = req ? (req.headers['user-agent'] || '') : '';
    var uid = user ? user.id : null;
    var uname = user ? (user.username || user.name || '') : '';
    db.prepare("INSERT INTO audit_log (user_id, username, action, details, ip_address, user_agent) VALUES (?,?,?,?,?,?)").run(uid, uname, action, details || '', ip, ua);
  } catch (_) {}
}

function getTokenFromRequest(req) {
  var auth = req.headers && req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  // Allow query param token for GET requests only (needed for PDF download links)
  if (req.method === 'GET' && req.query && req.query.token) return req.query.token;
  return null;
}

function getUserFromRequest(req) {
  var token = getTokenFromRequest(req);
  if (token && sessions.has(token)) {
    var s = sessions.get(token);
    if (Date.now() < s.expires) {
      s.expires = Date.now() + SESSION_TTL;
      return s.user || null;
    }
    sessions.delete(token);
  }
  return null;
}

function authorizeRequest(req) {
  var token = getTokenFromRequest(req);
  if (token && sessions.has(token)) {
    var s = sessions.get(token);
    if (Date.now() < s.expires) {
      s.expires = Date.now() + SESSION_TTL;
      return true;
    }
    sessions.delete(token);
  }
  return false;
}

app.post('/api/admin/login', function (req, res) {
  try {
    // Rate limiting
    var ip = req.ip || req.connection.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      logAudit(null, 'login-rate-limited', 'IP: ' + ip, req);
      return res.status(429).json({ error: 'Too many login attempts. Try again in 60 seconds.' });
    }
    var b = req.body;
    // Try user-based login (username + password)
    if (b && b.username && b.password) {
      var user = db.prepare("SELECT * FROM users WHERE username = ?").get(b.username);
      if (user && verifyPassword(b.password, user.password_hash)) {
        var token = crypto.randomBytes(32).toString('hex');
        var userInfo = { id: user.id, username: user.username, name: user.name, permissions: JSON.parse(user.permissions || '{}'), branch_id: user.branch_id || null };
        sessions.set(token, { expires: Date.now() + SESSION_TTL, user: userInfo });
        loginAttempts.delete(ip);
        // Update last_login
        db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
        logAudit(userInfo, 'login', 'Login from ' + ip, req);
        return res.json({ success: true, token: token, user: userInfo });
      }
    }
    // Fallback to master admin password (scrypt; SHA-256 for migration)
    if (b && b.password && verifyMasterPassword(b.password)) {
      var token = crypto.randomBytes(32).toString('hex');
      var allPerms = { subscribers: true, messages: true, campaigns: true, products: true, sales: true, livechat: true, users: true, content: true, job_cards: true };
      sessions.set(token, { expires: Date.now() + SESSION_TTL, user: { id: 0, username: 'admin', name: 'Admin', permissions: allPerms } });
      loginAttempts.delete(ip);
      logAudit({ id: 0, username: 'admin', name: 'Admin' }, 'login', 'Master admin login from ' + ip, req);
      return res.json({ success: true, token: token, user: { id: 0, username: 'admin', name: 'Admin', permissions: allPerms } });
    }
    logAudit(null, 'login-failed', 'Failed login attempt from ' + ip + ' user: ' + (b ? b.username || 'unknown' : 'unknown'), req);
    return res.status(401).json({ error: 'Incorrect username or password.' });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/admin/me', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ success: true, user: user });
  } catch (err) {
    sendError(res, err);
  }
});

// ── User Management (admin only) ──
app.get('/api/admin/users', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!user.permissions.users) return res.status(403).json({ error: 'Forbidden' });
    var users;
    if (user.branch_id) {
      // Branch users only see users from their branch
      users = db.prepare("SELECT id, username, name, permissions, branch_id, role, created_at FROM users WHERE branch_id = ? ORDER BY id").all(user.branch_id);
    } else {
      users = db.prepare("SELECT id, username, name, permissions, branch_id, role, created_at FROM users ORDER BY id").all();
    }
    res.json({ success: true, users: users });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/admin/users', function (req, res) {
  try {
    var admin = getUserFromRequest(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!admin.permissions.users) return res.status(403).json({ error: 'Forbidden' });
    var b = req.body;
    if (!b.username || !b.password || !b.name) return res.status(400).json({ error: 'username, password, and name are required' });
    // Branch user can only create users for their own branch
    var branchId = b.branch_id || admin.branch_id || null;
    if (admin.branch_id && b.branch_id && b.branch_id !== admin.branch_id) return res.status(403).json({ error: 'Cannot create users for other branches' });
    var existing = db.prepare("SELECT id FROM users WHERE username = ?").get(b.username);
    if (existing) return res.status(409).json({ error: 'Username already exists' });
    var password_hash = hashPassword(b.password);
    var permissions = JSON.stringify(b.permissions || {});
    var role = b.role || 'staff';
    var result = db.prepare("INSERT INTO users (username, password_hash, name, permissions, branch_id, role, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)").run(b.username, password_hash, b.name, permissions, branchId, role, admin.id);
    logAudit(admin, 'create-user', 'Created user: ' + b.username + ' (ID: ' + result.lastInsertRowid + ')', req);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/admin/users/:id', function (req, res) {
  try {
    var admin = getUserFromRequest(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!admin.permissions.users) return res.status(403).json({ error: 'Forbidden' });
    // Branch users can only edit users from their branch
    if (admin.branch_id) {
      var target = db.prepare("SELECT branch_id FROM users WHERE id = ?").get(req.params.id);
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.branch_id !== admin.branch_id) return res.status(403).json({ error: 'Cannot edit users from other branches' });
    }
    var b = req.body;
    var existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    var updates = [];
    var vals = [];
    if (b.password) { var password_hash = hashPassword(b.password); updates.push('password_hash = ?'); vals.push(password_hash); }
    if (b.name !== undefined) { updates.push('name = ?'); vals.push(b.name); }
    if (b.permissions !== undefined) { updates.push('permissions = ?'); vals.push(JSON.stringify(b.permissions)); }
    if (b.branch_id !== undefined) { updates.push('branch_id = ?'); vals.push(b.branch_id || null); }
    if (b.role !== undefined) { updates.push('role = ?'); vals.push(b.role); }
    if (updates.length) {
      vals.push(req.params.id);
      var stmt = db.prepare("UPDATE users SET " + updates.join(', ') + " WHERE id = ?");
      stmt.run.apply(stmt, vals);
    }
    logAudit(admin, 'update-user', 'Updated user ID ' + req.params.id + ' (' + existing.username + ')', req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/admin/users/:id', function (req, res) {
  try {
    var admin = getUserFromRequest(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!admin.permissions.users) return res.status(403).json({ error: 'Forbidden' });
    // Branch users can only delete users from their branch
    if (admin.branch_id) {
      var target = db.prepare("SELECT branch_id, username FROM users WHERE id = ?").get(req.params.id);
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.branch_id !== admin.branch_id) return res.status(403).json({ error: 'Cannot delete users from other branches' });
    }
    var delUser = db.prepare("SELECT username FROM users WHERE id = ?").get(req.params.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    logAudit(admin, 'delete-user', 'Deleted user ID ' + req.params.id + ' (' + (delUser ? delUser.username : 'unknown') + ')', req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Password Reset Requests ──
app.post('/api/admin/request-password-reset', function (req, res) {
  try {
    var username = (req.body.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'Username is required' });
    var user = db.prepare("SELECT id, username, name, branch_id FROM users WHERE LOWER(username) = ?").get(username);
    if (!user) return res.json({ success: true, message: 'If the account exists, a reset request has been submitted.' });
    if (!user.branch_id) return res.json({ success: true, message: 'If the account exists, a reset request has been submitted.' });
    var existing = db.prepare("SELECT id FROM password_resets WHERE username = ? AND status = 'pending'").get(user.username);
    if (existing) return res.json({ success: true, message: 'A reset request is already pending for this account.' });
    db.prepare("INSERT INTO password_resets (username, branch_id) VALUES (?, ?)").run(user.username, user.branch_id);
    res.json({ success: true, message: 'Reset request submitted. An admin will review it shortly.' });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/admin/password-resets', function (req, res) {
  try {
    var admin = getUserFromRequest(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!admin.permissions.users && admin.id !== 0) return res.status(403).json({ error: 'Forbidden' });
    var rows;
    if (admin.branch_id) {
      rows = db.prepare("SELECT * FROM password_resets WHERE branch_id = ? ORDER BY requested_at DESC").all(admin.branch_id);
    } else {
      rows = db.prepare("SELECT * FROM password_resets ORDER BY requested_at DESC").all();
    }
    res.json({ success: true, resets: rows });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/admin/password-resets/:id/approve', function (req, res) {
  try {
    var admin = getUserFromRequest(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!admin.permissions.users && admin.id !== 0) return res.status(403).json({ error: 'Forbidden' });
    var reset = db.prepare("SELECT * FROM password_resets WHERE id = ? AND status = 'pending'").get(req.params.id);
    if (!reset) return res.status(404).json({ error: 'Reset request not found or already resolved' });
    if (admin.branch_id && reset.branch_id !== admin.branch_id) return res.status(403).json({ error: 'Cannot reset passwords for other branches' });
    var newPassword = req.body.password || SEED_BRANCH_PASSWORD;
    var password_hash = hashPassword(newPassword);
    db.prepare("UPDATE users SET password_hash = ? WHERE username = ?").run(password_hash, reset.username);
    db.prepare("UPDATE password_resets SET status = 'approved', resolved_at = datetime('now'), resolved_by = ? WHERE id = ?").run(admin.username || 'admin', req.params.id);
    logAudit(admin, 'approve-password-reset', 'Approved reset for user: ' + reset.username + ' (ID: ' + req.params.id + ')', req);
    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/admin/password-resets/:id/reject', function (req, res) {
  try {
    var admin = getUserFromRequest(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!admin.permissions.users && admin.id !== 0) return res.status(403).json({ error: 'Forbidden' });
    var reset = db.prepare("SELECT * FROM password_resets WHERE id = ? AND status = 'pending'").get(req.params.id);
    if (!reset) return res.status(404).json({ error: 'Reset request not found or already resolved' });
    if (admin.branch_id && reset.branch_id !== admin.branch_id) return res.status(403).json({ error: 'Cannot reject resets for other branches' });
    db.prepare("UPDATE password_resets SET status = 'rejected', resolved_at = datetime('now'), resolved_by = ? WHERE id = ?").run(admin.username || 'admin', req.params.id);
    logAudit(admin, 'reject-password-reset', 'Rejected reset for user: ' + reset.username + ' (ID: ' + req.params.id + ')', req);
    res.json({ success: true, message: 'Reset request rejected.' });
  } catch (err) {
    sendError(res, err);
  }
});

// ─── Campaign Templates CRUD ───
app.get('/api/admin/campaign-templates', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var rows = db.prepare('SELECT * FROM campaign_templates ORDER BY created_at DESC').all();
    res.json({ success: true, templates: rows });
  } catch (err) { sendError(res, err); }
});
app.post('/api/admin/campaign-templates', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var b = req.body;
    db.prepare('INSERT INTO campaign_templates (name, type, subject, html) VALUES (?,?,?,?)').run(b.name, b.type||'general', b.subject||'', b.html||'');
    logAudit(admin, 'create-campaign-template', 'Created template: "' + (b.name || 'untitled') + '"', req);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});
app.put('/api/admin/campaign-templates/:id', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var b = req.body;
    db.prepare('UPDATE campaign_templates SET name=?, type=?, subject=?, html=? WHERE id=?').run(b.name, b.type||'general', b.subject||'', b.html||'', req.params.id);
    logAudit(admin, 'update-campaign-template', 'Updated template ID ' + req.params.id, req);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});
app.delete('/api/admin/campaign-templates/:id', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    db.prepare('DELETE FROM campaign_templates WHERE id=?').run(req.params.id);
    logAudit(admin, 'delete-campaign-template', 'Deleted template ID ' + req.params.id, req);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// ─── Campaign History ───
app.get('/api/admin/campaigns', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var rows = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
    res.json({ success: true, campaigns: rows });
  } catch (err) { sendError(res, err); }
});

// ─── Subscriber management ───
app.post('/api/admin/subscribers', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });
    db.prepare('INSERT OR IGNORE INTO subscribers (email, source, notes) VALUES (?,?,?)').run(email, 'manual', req.body.notes || null);
    logAudit(admin, 'add-subscriber', 'Added subscriber: ' + email, req);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});
app.post('/api/admin/subscribers/bulk-delete', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var emails = req.body.emails || [];
    var del = db.prepare('DELETE FROM subscribers WHERE email = ?');
    var tx = db.transaction(function() { emails.forEach(function(e) { del.run(e); }); });
    tx();
    logAudit(admin, 'bulk-delete-subscribers', 'Deleted ' + emails.length + ' subscribers', req);
    res.json({ success: true, deleted: emails.length });
  } catch (err) { sendError(res, err); }
});

// ─── Messages management ───
app.put('/api/admin/messages/:id/read', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    db.prepare("UPDATE messages SET is_read=1 WHERE id=?").run(req.params.id);
    logAudit(admin, 'mark-message-read', 'Marked message ID ' + req.params.id + ' as read', req);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});
app.delete('/api/admin/messages/:id', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    db.prepare('DELETE FROM messages WHERE id=?').run(req.params.id);
    logAudit(admin, 'delete-message', 'Deleted message ID ' + req.params.id, req);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});
app.post('/api/admin/messages/bulk-delete', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var ids = req.body.ids || [];
    var del = db.prepare('DELETE FROM messages WHERE id=?');
    var tx = db.transaction(function() { ids.forEach(function(id) { del.run(id); }); });
    tx();
    logAudit(admin, 'bulk-delete-messages', 'Deleted ' + ids.length + ' messages', req);
    res.json({ success: true, deleted: ids.length });
  } catch (err) { sendError(res, err); }
});

// ─── Audit log ───
app.get('/api/admin/audit-log', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var user = getUserFromRequest(req);

    var conditions = [];
    var params = [];

    if (req.query.action) {
      conditions.push('action = ?');
      params.push(req.query.action);
    }
    if (req.query.username) {
      conditions.push('username LIKE ?');
      params.push('%' + req.query.username.replace(/[%_]/g, '\\$&') + '%');
    }

    // Branch users can only see their own branch's logs (by their username)
    if (user && user.branch_id) {
      conditions.push('username = ?');
      params.push(user.username);
    }

    var where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    var stmt = db.prepare('SELECT * FROM audit_log ' + where + ' ORDER BY created_at DESC LIMIT 500');
    var cntStmt = db.prepare('SELECT COUNT(*) as cnt FROM audit_log ' + where);
    var rows = params.length ? stmt.all.apply(stmt, params) : stmt.all();
    var total = params.length ? cntStmt.get.apply(cntStmt, params) : cntStmt.get();
    res.json({ success: true, entries: rows, total: total ? total.cnt : rows.length });
  } catch (err) { sendError(res, err); }
});

// ─── System Health ───
app.get('/api/admin/system-health', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });

    var cpus = os.cpus();
    var cpuCount = cpus.length;
    var cpuModel = cpus.length ? cpus[0].model : 'N/A';

    // Real CPU load (1-minute average as percentage of cores)
    var loadAvg = os.loadavg ? os.loadavg() : [0, 0, 0];
    var cpuUsagePercent = 0;
    if (loadAvg[0] > 0) {
      cpuUsagePercent = Math.min(100, Math.round((loadAvg[0] / (cpuCount || 1)) * 100));
    } else {
      // Fallback: calculate from cumulative cpu times (Windows etc.)
      var totalIdle = 0, totalTick = 0;
      cpus.forEach(function(cpu) {
        for (var type in cpu.times) { totalTick += cpu.times[type]; }
        totalIdle += cpu.times.idle;
      });
      cpuUsagePercent = Math.round((1 - totalIdle / totalTick) * 100);
    }

    var totalMem = os.totalmem();
    var freeMem = os.freemem();
    var usedMem = totalMem - freeMem;
    var memPercent = Math.round((usedMem / totalMem) * 100);

    var uptimeSeconds = os.uptime();
    var uptimeDays = Math.floor(uptimeSeconds / 86400);
    var uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
    var uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);

    // Disk usage via native fs.statfsSync (Node 18+) with PowerShell fallback
    var diskInfo = { total: 0, used: 0, free: 0, percent: 0 };
    try {
      if (typeof fs.statfsSync === 'function') {
        var diskPath = path.parse(DB_PATH || process.cwd()).root || '/';
        var s = fs.statfsSync(diskPath);
        diskInfo.total = s.blocks * s.bsize;
        diskInfo.free = s.bfree * s.bsize;
        diskInfo.used = diskInfo.total - diskInfo.free;
        diskInfo.percent = diskInfo.total ? Math.round((diskInfo.used / diskInfo.total) * 100) : 0;
      } else {
        throw new Error('statfs not available');
      }
    } catch (e) {
      // Fallback using child_process
      try {
        if (process.platform === 'win32') {
          var out = cp.execSync('powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter DriveType=3 | Select-Object Size,FreeSpace | ConvertTo-Csv -NoHeader"', { encoding: 'utf8', timeout: 8000 });
          out.trim().split('\n').forEach(function(line) {
            var parts = line.trim().split(',');
            if (parts.length >= 2) {
              var dTotal = parseInt(parts[0], 10) || 0;
              var dFree = parseInt(parts[1], 10) || 0;
              if (dTotal > 0) {
                diskInfo.total += dTotal;
                diskInfo.free += dFree;
              }
            }
          });
          diskInfo.used = diskInfo.total - diskInfo.free;
          diskInfo.percent = diskInfo.total ? Math.round((diskInfo.used / diskInfo.total) * 100) : 0;
        } else {
          var out = cp.execSync('df -k --total 2>/dev/null || df -k /', { encoding: 'utf8', timeout: 5000 });
          var lines = out.trim().split('\n');
          var lastLine = lines[lines.length - 1];
          var parts = lastLine.split(/\s+/);
          if (parts.length >= 4) {
            diskInfo.total = parseInt(parts[1], 10) * 1024 || 0;
            diskInfo.used = parseInt(parts[2], 10) * 1024 || 0;
            diskInfo.free = parseInt(parts[3], 10) * 1024 || 0;
            diskInfo.percent = diskInfo.total ? Math.round((diskInfo.used / diskInfo.total) * 100) : 0;
          }
        }
      } catch(e2) {
        diskInfo = { total: 0, used: 0, free: 0, percent: 0, note: 'Disk info unavailable' };
      }
    }

    // GPU info (nvidia-smi on Windows)
    var gpuInfo = [];
    try {
      if (process.platform === 'win32') {
        var gpuOut = cp.execSync('nvidia-smi --query-gpu=name,utilization.gpu,memory.total,memory.used,temperature.gpu --format=csv,noheader,nounits 2>nul', { encoding: 'utf8', timeout: 5000 });
        gpuOut.trim().split('\n').forEach(function(line) {
          var parts = line.split(',').map(function(s) { return s.trim(); });
          if (parts.length >= 5) {
            gpuInfo.push({ name: parts[0], util: parseFloat(parts[1]) || 0, memTotal: parseFloat(parts[2]) || 0, memUsed: parseFloat(parts[3]) || 0, temp: parseFloat(parts[4]) || 0 });
          }
        });
      } else {
        try {
          var gpuOut = cp.execSync('nvidia-smi --query-gpu=name,utilization.gpu,memory.total,memory.used,temperature.gpu --format=csv,noheader,nounits 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
          gpuOut.trim().split('\n').forEach(function(line) {
            var parts = line.split(',').map(function(s) { return s.trim(); });
            if (parts.length >= 5) {
              gpuInfo.push({ name: parts[0], util: parseFloat(parts[1]) || 0, memTotal: parseFloat(parts[2]) || 0, memUsed: parseFloat(parts[3]) || 0, temp: parseFloat(parts[4]) || 0 });
            }
          });
        } catch(e2) {}
      }
    } catch(e) {}

    // Network: check if server can reach external hosts + traffic stats
    var networkStatus = 'unknown';
    var networkTraffic = { rxBytes: 0, txBytes: 0 };
    try {
      var ping = cp.execSync('ping -n 1 -w 2000 8.8.8.8', { encoding: 'utf8', timeout: 5000 });
      networkStatus = ping.indexOf('TTL=') !== -1 || ping.indexOf('1 received') !== -1 || ping.indexOf('bytes from') !== -1 ? 'connected' : 'no-internet';
    } catch(e) { networkStatus = 'no-internet'; }
    // Network traffic stats via PowerShell (Windows) or /proc/net (Linux)
    try {
      if (process.platform === 'win32') {
        var netOut = cp.execSync('powershell -NoProfile -Command "Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Csv"', { encoding: 'utf8', timeout: 8000 });
        netOut.trim().split('\n').slice(1).forEach(function(line) {
          line = line.replace(/"/g, '');
          var parts = line.trim().split(',');
          if (parts.length >= 3) {
            networkTraffic.rxBytes += parseInt(parts[1], 10) || 0;
            networkTraffic.txBytes += parseInt(parts[2], 10) || 0;
          }
        });
      } else {
        var netOut = cp.execSync('cat /proc/net/dev 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
        netOut.trim().split('\n').slice(2).forEach(function(line) {
          var parts = line.trim().split(/\s+/);
          if (parts.length >= 10) {
            networkTraffic.rxBytes += parseInt(parts[1], 10) || 0;
            networkTraffic.txBytes += parseInt(parts[9], 10) || 0;
          }
        });
      }
    } catch(e) {}
    // Add active connections count
    var activeConnections = 0;
    try {
      if (process.platform === 'win32') {
        var connOut = cp.execSync('netstat -an | findstr /C:"ESTABLISHED" /C:"TIME_WAIT"', { encoding: 'utf8', timeout: 5000 });
        activeConnections = connOut.trim().split('\n').filter(function(l) { return l.trim().length > 0; }).length;
      } else {
        var connOut = cp.execSync('netstat -an | grep -c "ESTABLISHED\\|TIME_WAIT"', { encoding: 'utf8', timeout: 5000 });
        activeConnections = parseInt(connOut.trim(), 10) || 0;
      }
    } catch(e) {}

    // Process health
    var procMem = process.memoryUsage();
    var nodeVersion = process.version;

    // Recent errors from audit log (last 5 error-type entries)
    var recentErrors = db.prepare("SELECT * FROM audit_log WHERE action LIKE '%error%' OR action LIKE '%fail%' OR details LIKE '%error%' OR details LIKE '%fail%' ORDER BY created_at DESC LIMIT 5").all();

    // Running services check (Windows)
    var runningServices = [];
    try {
      if (process.platform === 'win32') {
        var svcOut = cp.execSync('sc query state= all 2>nul', { encoding: 'utf8', timeout: 5000 });
        var svcLines = svcOut.split('\n');
        var currentSvc = null;
        svcLines.forEach(function(l) {
          var m = l.match(/^SERVICE_NAME:\s+(.+)$/);
          if (m) currentSvc = m[1].trim();
          if (l.indexOf('STATE') !== -1 && currentSvc) {
            var running = l.indexOf('RUNNING') !== -1;
            if (currentSvc.indexOf('Royal') !== -1 || currentSvc.indexOf('mysql') !== -1 || currentSvc.indexOf('nginx') !== -1 || currentSvc.indexOf('apache') !== -1 || currentSvc.indexOf('node') !== -1 || currentSvc.indexOf('sql') !== -1) {
              runningServices.push({ name: currentSvc, running: running });
            }
          }
        });
      }
    } catch(e) {}

    res.json({
      success: true,
      cpu: {
        model: cpuModel,
        cores: cpuCount,
        usage: cpuUsagePercent,
        loadAvg: os.loadavg ? os.loadavg() : [0,0,0]
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percent: memPercent
      },
      disk: diskInfo,
      gpu: gpuInfo,
      network: { status: networkStatus, rxBytes: networkTraffic.rxBytes, txBytes: networkTraffic.txBytes, activeConnections: activeConnections },
      uptime: { seconds: uptimeSeconds, days: uptimeDays, hours: uptimeHours, minutes: uptimeMinutes },
      process: {
        version: nodeVersion,
        memory: { rss: procMem.rss, heapUsed: procMem.heapUsed, heapTotal: procMem.heapTotal }
      },
      errors: recentErrors,
      services: runningServices,
      timestamp: new Date().toISOString()
    });
  } catch (err) { sendError(res, err); }
});

// ─── System Health Fix ───
app.post('/api/admin/system-health/fix', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var action = req.body.action || '';
    var result = { success: true, message: '', fixed: false };

    if (action === 'clear-temp') {
      var tempDir = os.tmpdir();
      var freed = 0, count = 0;
      try {
        var files = fs.readdirSync(tempDir);
        files.forEach(function(f) {
          var fp = path.join(tempDir, f);
          try {
            var stat = fs.statSync(fp);
            if (stat.isFile() && Date.now() - stat.mtimeMs > 86400000) {
              freed += stat.size;
              fs.unlinkSync(fp);
              count++;
            }
          } catch(e) {}
        });
        result.message = 'Cleared ' + count + ' temp files, freed ' + (freed / 1024 / 1024).toFixed(2) + ' MB';
        result.fixed = true;
      } catch(e) {
        result.message = 'Failed to clear temp files. Check server logs.';
      }
    } else if (action === 'checkpoint-db') {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        result.message = 'Database WAL checkpoint completed successfully';
        result.fixed = true;
      } catch(e) {
        result.message = 'Database checkpoint failed. Check server logs.';
      }
    } else if (action === 'restart-http') {
      result.message = 'Suggest restarting the Node.js server process manually for a full refresh';
      result.fixed = false;
    } else if (action === 'clear-cache') {
      // Clear any temporary data - restart effectively
      result.message = 'Manual server restart recommended to clear all caches';
      result.fixed = false;
    } else if (action === 'check-disk') {
      result.message = 'Run disk cleanup manually or use chkdsk /f for Windows, or df -h for Linux';
      result.fixed = false;
    } else {
      result.message = 'Unknown action: ' + action;
    }

    logAudit(admin, 'system-health-fix', action + ': ' + result.message, req);
    res.json(result);
  } catch (err) { sendError(res, err); }
});

// ─── Quotation status update ───
app.put('/api/admin/quotations/:doc/status', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var validStatuses = ['pending','approved','rejected','converted'];
    if (validStatuses.indexOf(req.body.status) === -1) return res.status(400).json({ error: 'Invalid status' });
    db.prepare("UPDATE quotations SET status=? WHERE doc_number=?").run(req.body.status, req.params.doc);
    logAudit(admin, 'update-quotation-status', 'Updated quotation ' + req.params.doc + ' to ' + req.body.status, req);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// ─── Chat transcripts ───
app.get('/api/admin/chat-transcripts', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var rows = db.prepare('SELECT * FROM chat_transcripts ORDER BY created_at DESC LIMIT 100').all();
    res.json({ success: true, transcripts: rows });
  } catch (err) { sendError(res, err); }
});
app.put('/api/admin/chat-transcripts/:id', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    db.prepare("UPDATE chat_transcripts SET status=?, assigned_to=? WHERE id=?").run(req.body.status||'closed', req.body.assigned_to||null, req.params.id);
    logAudit(admin, 'update-chat-transcript', 'Updated chat transcript ID ' + req.params.id, req);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// ─── Branch hours update ───
app.put('/api/admin/branches/:id/hours', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    db.prepare("UPDATE branches SET hours_json=?, hours=? WHERE id=?").run(JSON.stringify(req.body.hours||{}), req.body.display_hours||'', req.params.id);
    logAudit(admin, 'update-branch-hours', 'Updated hours for branch: ' + req.params.id, req);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// ─── Subscriber search/filter ───
app.get('/api/admin/subscribers/search', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var q = req.query.q || '';
    var rows = q ? db.prepare("SELECT * FROM subscribers WHERE email LIKE ? ORDER BY created_at DESC").all('%' + q.replace(/[%_]/g,'\\$&') + '%') : db.prepare("SELECT * FROM subscribers ORDER BY created_at DESC").all();
    res.json({ success: true, subscribers: rows });
  } catch (err) { sendError(res, err); }
});

// ─── Campaign save (draft / schedule) ───
app.post('/api/admin/campaigns', function(req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var b = req.body;
    var user = getUserFromRequest(req);
    db.prepare('INSERT INTO campaigns (type, subject, html, status, scheduled_for, created_by) VALUES (?,?,?,?,?,?)').run(
      b.type || 'general', b.subject || '', b.html || '', b.status || 'draft', b.scheduled_for || null, user ? (user.name || user.username) : 'admin'
    );
    logAudit(user, 'create-campaign', 'Created campaign: "' + (b.subject || 'untitled') + '"', req);
    res.json({ success: true, id: db.prepare('SELECT last_insert_rowid() as id').get().id });
  } catch (err) { sendError(res, err); }
});

/* ─── Change own password ─── */
app.post('/api/admin/change-password', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    var oldPassword = req.body.old_password || '';
    var newPassword = req.body.new_password || '';

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current password and new password are required' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }

    // If master admin (id === 0), verify via master password
    if (user.id === 0) {
      if (!verifyMasterPassword(oldPassword)) {
        return res.status(403).json({ error: 'Current password is incorrect' });
      }
      // Update .env or just acknowledge — master admin password change is handled via .env
      return res.json({ success: true, message: 'For master admin, update ADMIN_PASSWORD_HASH in the .env file. Password verified.' });
    }

    // DB user: verify old password
    var dbUser = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    if (!dbUser) return res.status(404).json({ error: 'User not found' });

    if (!verifyPassword(oldPassword, dbUser.password_hash)) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }

    var newHash = hashPassword(newPassword);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, user.id);
    logAudit(user, 'change-password', 'Changed own password (user ID: ' + user.id + ')', req);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/subscribe', function (req, res) {
  try {
    if (!validateSameOrigin(req)) return res.status(403).json({ error: 'Cross-origin request denied' });

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
    sendError(res, err);
  }
});

app.post('/api/contact', function (req, res) {
  try {
    if (!validateSameOrigin(req)) return res.status(403).json({ error: 'Cross-origin request denied' });

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
    sendError(res, err);
  }
});

app.post('/api/get-data', function (req, res) {
  try {
    if (!authorizeRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    var subscribers = db.prepare("SELECT email FROM subscribers ORDER BY created_at ASC").all().map(function (r) { return r.email; });
    var messages = db.prepare("SELECT * FROM messages ORDER BY id ASC").all();
    var notified = db.prepare("SELECT email FROM unsubscribed_notified").all().map(function (r) { return r.email; });

    res.json({ subscribers: subscribers, messages: messages, notified: notified });
  } catch (err) {
    sendError(res, err);
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
    sendError(res, err);
  }
});

app.post('/api/unsubscribe', function (req, res) {
  try {
    if (!validateSameOrigin(req)) return res.status(403).json({ error: 'Cross-origin request denied' });

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
    sendError(res, err);
  }
});

app.post('/api/delete-subscriber', function (req, res) {
  try {
    if (!authorizeRequest(req)) {
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
    sendError(res, err);
  }
});

app.post('/api/notify-unsubscribe', function (req, res) {
  try {
    if (!authorizeRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    var email = (req.body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    db.prepare("INSERT OR IGNORE INTO unsubscribed_notified (email) VALUES (?)").run(email);

    res.json({ success: true, message: email + ' has been notified of unsubscription.' });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/clear-data', function (req, res) {
  try {
    if (!authorizeRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    var type = req.body.type || '';
    var user = getUserFromRequest(req);
    if (type === 'subscribers') {
      db.prepare("DELETE FROM subscribers").run();
    } else if (type === 'messages') {
      db.prepare("DELETE FROM messages").run();
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }
    logAudit(user, 'clear-data', 'Cleared all ' + type, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/upload', function (req, res) {
  upload.single('file')(req, res, function (err) {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.body || !authorizeRequest(req)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // Validate file content via magic bytes
    if (!validateMagicBytes(req.file.path)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid image file content. Only valid image files are accepted.' });
    }
    // Convert any non-WebP image to WebP using sharp
    var filePath = req.file.path;
    var originalExt = path.extname(req.file.originalname).toLowerCase();
    (async function() {
      try {
        if (originalExt !== '.webp') {
          var tempPath = filePath + '.tmp';
          fs.renameSync(filePath, tempPath);
          await sharp(tempPath).webp({ quality: 85 }).toFile(filePath);
          fs.unlinkSync(tempPath);
        }
      } catch (convErr) {
        // If conversion fails, keep original (saved with .webp extension from multer)
        console.warn('WebP conversion failed:', convErr.message);
      }
    })().then(function() {
      var user = getUserFromRequest(req);
      logAudit(user, 'upload', 'Uploaded: ' + req.file.originalname + ' → ' + req.file.filename, req);
      var url = '/uploads/' + req.file.filename;
      res.json({ success: true, url: url, filename: req.file.originalname });
    });
  });
});

app.post('/api/send-campaign', function (req, res) {
  try {
    if (!authorizeRequest(req)) {
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

    var settings = db.prepare("SELECT * FROM site_settings").all();
    var s = {};
    settings.forEach(function(r) { s[r.key] = r.value; });
    var campAddr = s.campaign_footer_address || 'GF Shop 12 Gustav Voigts Center, Independence Ave, Windhoek';
    var campPhone = s.campaign_footer_phone || '061228179';
    var campEmail = s.campaign_footer_email || 'windhoek@netmac.co.za';
    var campHours = s.campaign_footer_hours || 'Mon-Fri: 08:30-17:30 | Sat: 08:30-13:00 | Sun: 09:00-13:00';

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
      campAddr + '<br>' +
      'Tel: ' + campPhone + ' | Email: ' + campEmail + '<br>' +
      'www.netmac.co.za | ' + campHours +
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
        sendError(res, err);
      } else {
        var admin = getUserFromRequest(req);
        logAudit(admin, 'send-campaign', 'Sent campaign: "' + subject + '" to ' + subscribers.length + ' subscribers', req);
        res.json({ success: true, sent: subscribers.length, total: subscribers.length });
      }
    });
  } catch (err) {
    sendError(res, err);
  }
});

/* ─── Sales API ─── */
app.get('/api/sales', function (req, res) {
  try {
    var now = new Date().toISOString();
    var sales = db.prepare("SELECT * FROM sales WHERE active = 1 AND start_date <= ? AND end_date >= ? ORDER BY created_at DESC").all(now, now);
    res.json({ success: true, sales: sales });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/sales/all', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var sales = db.prepare("SELECT * FROM sales ORDER BY created_at DESC").all();
    res.json({ success: true, sales: sales });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/sales', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    if (admin && admin.branch_id) return res.status(403).json({ error: 'Branch users cannot create sales' });
    var b = req.body;
    if (!b.product_id || !b.sale_price || !b.start_date || !b.end_date) {
      return res.status(400).json({ error: 'Missing required fields: product_id, sale_price, start_date, end_date' });
    }
    var result = db.prepare("INSERT INTO sales (product_id, sale_price, old_price, start_date, end_date, label, ad_image, ad_video, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      b.product_id, b.sale_price, b.old_price || null, b.start_date, b.end_date, b.label || 'sale', b.ad_image || null, b.ad_video || null, b.description || null
    );
    logAudit(admin, 'create-sale', 'Created sale for product: ' + b.product_id + ' (price: N$' + b.sale_price + ')', req);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/sales/:id', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    if (admin && admin.branch_id) return res.status(403).json({ error: 'Branch users cannot edit sales' });
    var b = req.body;
    var oldSale = db.prepare("SELECT * FROM sales WHERE id=?").get(req.params.id);
    db.prepare("UPDATE sales SET product_id=?, sale_price=?, old_price=?, start_date=?, end_date=?, label=?, ad_image=?, ad_video=?, description=?, active=? WHERE id=?").run(
      b.product_id, b.sale_price, b.old_price || null, b.start_date, b.end_date, b.label || 'sale', b.ad_image || null, b.ad_video || null, b.description || null, b.active !== undefined ? (b.active ? 1 : 0) : 1, req.params.id
    );
    logAudit(admin, 'update-sale', 'Updated sale ID ' + req.params.id + ' for product: ' + (b.product_id || (oldSale ? oldSale.product_id : 'unknown')), req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/sales/:id', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    if (admin && admin.branch_id) return res.status(403).json({ error: 'Branch users cannot delete sales' });
    var oldSale = db.prepare("SELECT * FROM sales WHERE id=?").get(req.params.id);
    db.prepare("DELETE FROM sales WHERE id = ?").run(req.params.id);
    logAudit(admin, 'delete-sale', 'Deleted sale ID ' + req.params.id + ' for product: ' + (oldSale ? oldSale.product_id : 'unknown'), req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

/* ─── Product Overrides API ─── */
app.get('/api/product-overrides', function (req, res) {
  try {
    var overrides = db.prepare("SELECT * FROM product_overrides").all();
    res.json({ success: true, overrides: overrides });
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/product-overrides/:productId', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var b = req.body;
    db.prepare("INSERT INTO product_overrides (product_id, price, description, compatibility, specs, name, image, variants_json, hidden, badge, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(product_id) DO UPDATE SET price=excluded.price, description=excluded.description, compatibility=excluded.compatibility, specs=excluded.specs, name=excluded.name, image=excluded.image, variants_json=excluded.variants_json, hidden=excluded.hidden, badge=excluded.badge, updated_at=datetime('now')").run(
      req.params.productId, b.price || null, b.description || null, b.compatibility || null, b.specs || null, b.name || null, b.image || null, b.variants_json || null, b.hidden !== undefined ? (b.hidden ? 1 : 0) : 0, b.badge || null
    );
    logAudit(admin, 'update-product-override', 'Updated product: ' + req.params.productId, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/product-overrides/:productId', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    db.prepare("DELETE FROM product_overrides WHERE product_id = ?").run(req.params.productId);
    logAudit(admin, 'delete-product-override', 'Removed override for product: ' + req.params.productId, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

/* ─── Custom Products API ─── */
app.get('/api/custom-products', function (req, res) {
  try {
    var products = db.prepare("SELECT * FROM custom_products ORDER BY created_at DESC").all();
    res.json({ success: true, products: products });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/custom-products', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var b = req.body;
    if (!b.id || !b.name) return res.status(400).json({ error: 'id and name are required' });
    db.prepare("INSERT INTO custom_products (id, name, category, image, badge, date, description, compatibility, specs, variants_json, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      b.id, b.name, b.category || null, b.image || null, b.badge || null, b.date || null,
      b.description || null, b.compatibility || null, b.specs || null,
      b.variants_json || JSON.stringify([{ label: 'Default', price: 0 }]),
      b.hidden || 0
    );
    logAudit(admin, 'create-custom-product', 'Created custom product: ' + b.id + ' - ' + b.name, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/custom-products/:id', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var b = req.body;
    var sets = []; var vals = [];
    ['name','category','image','badge','date','description','compatibility','specs','variants_json','hidden'].forEach(function(k) {
      if (b[k] !== undefined) { sets.push(k + '=?'); vals.push(b[k]); }
    });
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id);
    var stmt = db.prepare("UPDATE custom_products SET " + sets.join(',') + " WHERE id=?");
    stmt.run.apply(stmt, vals);
    logAudit(admin, 'update-custom-product', 'Updated custom product: ' + req.params.id, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/custom-products/:id', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    db.prepare("DELETE FROM custom_products WHERE id=?").run(req.params.id);
    logAudit(admin, 'delete-custom-product', 'Deleted custom product: ' + req.params.id, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

/* ─── Branch Products API ─── */
app.get('/api/admin/branch-products/:branchId', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    // Branch users can only access their own branch products
    if (user.branch_id && user.branch_id !== req.params.branchId) return res.status(403).json({ error: 'Forbidden' });
    var rows = db.prepare("SELECT * FROM branch_products WHERE branch_id = ?").all(req.params.branchId);
    var productIds = rows.map(function(r) { return r.product_id; });
    res.json({ success: true, products: rows, productIds: productIds });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/admin/branch-products/:branchId', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.branch_id && user.branch_id !== req.params.branchId) return res.status(403).json({ error: 'Forbidden' });
    var b = req.body;
    if (!b.product_id) return res.status(400).json({ error: 'product_id is required' });
    db.prepare("INSERT OR IGNORE INTO branch_products (branch_id, product_id) VALUES (?, ?)").run(req.params.branchId, b.product_id);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/admin/branch-products/:branchId/:productId', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.branch_id && user.branch_id !== req.params.branchId) return res.status(403).json({ error: 'Forbidden' });
    db.prepare("DELETE FROM branch_products WHERE branch_id = ? AND product_id = ?").run(req.params.branchId, req.params.productId);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

/* ─── Products public endpoint (with branch filtering) ─── */
app.get('/api/products', function (req, res) {
  try {
    var branchId = req.query.branch_id;
    // Just return branch products + custom products
    // The main product catalogue is loaded client-side from products-data.js
    var branchProductIds = branchId
      ? db.prepare("SELECT product_id FROM branch_products WHERE branch_id = ? AND is_available = 1").all(branchId).map(function(r) { return r.product_id; })
      : [];
    var customProducts = db.prepare("SELECT * FROM custom_products WHERE hidden = 0").all();
    var products = customProducts.map(function(cp) {
      var variants = [];
      try { variants = JSON.parse(cp.variants_json || '[]'); } catch(e) { variants = [{label:'Default',price:0}]; }
      return { id: cp.id, name: cp.name, category: cp.category || 'Uncategorized', image: cp.image || '', badge: cp.badge || null, date: cp.date || null, variants: variants };
    });
    res.json({
      success: true,
      products: products,
      branchProductIds: branchProductIds,
      branch: branchId || null
    });
  } catch (err) {
    sendError(res, err);
  }
});

/* ─── Quotations API ─── */
app.get('/api/quotations', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var conditions = [];
    var params = [];
    if (user.branch_id) {
      conditions.push('branch_id = ?');
      params.push(user.branch_id);
    }
    var search = (req.query.search || '').replace(/[%_]/g, '\\$&');
    if (search) {
      conditions.push("doc_number LIKE ? ESCAPE '\\'");
      params.push('%' + search + '%');
    }
    var where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    var rows = params.length
      ? db.prepare('SELECT * FROM quotations ' + where + ' ORDER BY created_at DESC').all.apply(null, params)
      : db.prepare('SELECT * FROM quotations ORDER BY created_at DESC').all();
    res.json({ success: true, quotations: rows });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/quotations/:docNumber', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var row = db.prepare("SELECT * FROM quotations WHERE doc_number = ?").get(req.params.docNumber);
    if (!row) return res.status(404).json({ error: 'Quotation not found' });
    if (user.branch_id && row.branch_id !== user.branch_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ success: true, quotation: row });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/quotations', function (req, res) {
  try {
    var admin = getUserFromRequest(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    var b = req.body;
    if (!b.doc_number || !b.items) return res.status(400).json({ error: 'doc_number and items are required' });
    // Force branch_id from user if they have one
    var branchId = admin.branch_id || b.branch_id || null;
    db.prepare("INSERT INTO quotations (doc_number, customer_info, items, subtotal, tax, total, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      b.doc_number, JSON.stringify(b.customer_info || {}), JSON.stringify(b.items),
      b.subtotal || 0, b.tax || 0, b.total || 0, branchId
    );
    logAudit(admin, 'create-quotation', 'Created quotation: ' + b.doc_number + (branchId ? ' (branch: ' + branchId + ')' : ''), req);
    res.json({ success: true });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Quotation with this document number already exists' });
    }
    sendError(res, err);
  }
});

app.put('/api/quotations/:docNumber', function (req, res) {
  try {
    var admin = getUserFromRequest(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    // Branch isolation
    if (admin.branch_id) {
      var existing = db.prepare("SELECT branch_id FROM quotations WHERE doc_number = ?").get(req.params.docNumber);
      if (!existing) return res.status(404).json({ error: 'Quotation not found' });
      if (existing.branch_id !== admin.branch_id) return res.status(403).json({ error: 'Access denied' });
    }
    var b = req.body;
    var branchId = admin.branch_id || b.branch_id || null;
    db.prepare("UPDATE quotations SET customer_info=?, items=?, subtotal=?, tax=?, total=?, branch_id=?, updated_at=datetime('now') WHERE doc_number=?").run(
      JSON.stringify(b.customer_info || {}), JSON.stringify(b.items || []),
      b.subtotal || 0, b.tax || 0, b.total || 0, branchId, req.params.docNumber
    );
    logAudit(admin, 'update-quotation', 'Updated quotation: ' + req.params.docNumber, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/quotations/:docNumber', function (req, res) {
  try {
    var admin = getUserFromRequest(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    // Branch isolation
    if (admin.branch_id) {
      var existing = db.prepare("SELECT branch_id FROM quotations WHERE doc_number = ?").get(req.params.docNumber);
      if (!existing) return res.status(404).json({ error: 'Quotation not found' });
      if (existing.branch_id !== admin.branch_id) return res.status(403).json({ error: 'Access denied' });
    }
    db.prepare("DELETE FROM quotations WHERE doc_number = ?").run(req.params.docNumber);
    logAudit(admin, 'delete-quotation', 'Deleted quotation: ' + req.params.docNumber, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

/* ─── Branches API ─── */

db.exec(`CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT DEFAULT '',
  address TEXT,
  phone TEXT,
  email TEXT,
  hours TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
)`);

try { db.exec("ALTER TABLE branches ADD COLUMN is_headquarters INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE branches ADD COLUMN sort_order INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE branches ADD COLUMN whatsapp TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE branches ADD COLUMN latitude TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE branches ADD COLUMN longitude TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE branches ADD COLUMN description TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE branches ADD COLUMN image TEXT"); } catch(e) {}

// Insert default branches if empty (using IDs matching js/branches.js)
var branchCount = db.prepare("SELECT COUNT(*) as c FROM branches").get().c;
if (branchCount === 0) {
  var stmt = db.prepare("INSERT INTO branches (id, name, city, address, phone, email) VALUES (?, ?, ?, ?, ?, ?)");
  stmt.run('branch-001', 'Royal Computers - Gustav Voigts Centre, Windhoek', 'Windhoek', 'GF Shop 12 Gustav Voigts Center, Independence Ave', '061228179', 'windhoek@netmac.co.za');
  stmt.run('branch-002', 'Royal Computers - Swakopmund', 'Swakopmund', 'Shop 03 Minette Court Sam Nujoma Street', '064406914', 'swakop@netmec.co.za');
  stmt.run('branch-003', 'Royal Computers - Oshakati', 'Oshakati', 'Shop 42 Etango Complex', '065227045', 'oshakati@netmac.co.za');
  stmt.run('branch-004', 'Royal Computers - Walvis Bay', 'Walvis Bay', '111 Hage Geingob Street Office C', '064200453', 'walvisbay@netmac.co.za');
  stmt.run('branch-005', 'Royal Computers - Tsumeb', 'Tsumeb', 'Shop 03 Tsumeb Shopping Mall', '+264818163936', 'tsumeb@netmac.co.za');
  stmt.run('branch-006', 'Royal Computers - Grove Mall, Windhoek', 'Windhoek', 'GF Shop 256 Grove Mall', '061242938', 'grove@netmac.co.za');
}

app.get('/api/admin/branches', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var rows = db.prepare("SELECT * FROM branches ORDER BY name ASC").all();
    res.json({ success: true, branches: rows });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/admin/branches', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var b = req.body;
    if (!b.id || !b.name) return res.status(400).json({ error: 'id and name are required' });
    db.prepare("INSERT INTO branches (id, name, address, phone, email) VALUES (?, ?, ?, ?, ?)").run(
      b.id, b.name, b.address || null, b.phone || null, b.email || null
    );
    logAudit(admin, 'create-branch', 'Created branch: ' + b.id + ' - ' + b.name, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/admin/branches/:id', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    var b = req.body;
    db.prepare("UPDATE branches SET name=?, address=?, phone=?, email=?, hours=?, whatsapp=?, is_headquarters=?, sort_order=?, image=?, description=? WHERE id=?").run(
      b.name, b.address || null, b.phone || null, b.email || null, b.hours || null, b.whatsapp || null,
      b.is_headquarters || 0, b.sort_order || 0, b.image || null, b.description || null, req.params.id
    );
    logAudit(admin, 'update-branch', 'Updated branch: ' + req.params.id, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/admin/branches/:id', function (req, res) {
  try {
    if (!authorizeRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    var admin = getUserFromRequest(req);
    db.prepare("DELETE FROM branches WHERE id=?").run(req.params.id);
    logAudit(admin, 'delete-branch', 'Deleted branch: ' + req.params.id, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

/* ─── Job Card Management ─── */

// DB schema for job cards
db.exec(`CREATE TABLE IF NOT EXISTS job_cards (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_company TEXT,
  client_phone TEXT,
  client_email TEXT,
  client_address TEXT,
  device_type TEXT,
  device_brand TEXT,
  device_model TEXT,
  device_serial TEXT,
  device_condition TEXT,
  accessories TEXT,
  issue_description TEXT,
  technician_notes TEXT,
  work_done TEXT,
  parts_used TEXT,
  sales_rep TEXT,
  technician_name TEXT,
  status TEXT NOT NULL DEFAULT 'diagnostic',
  diag_fee REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  invoice_no TEXT,
  public_token TEXT UNIQUE,
  service_type TEXT,
  collection_code TEXT,
  collector_name TEXT,
  collection_proof_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS job_card_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_id TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  changed_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS job_card_sequences (
  branch_id TEXT PRIMARY KEY,
  prefix TEXT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0
)`);

// Seed sequences for branches that have existing job cards
var seqCount = db.prepare("SELECT COUNT(*) as c FROM job_card_sequences").get().c;
if (seqCount === 0) {
  var branchesWithCards = db.prepare("SELECT branch_id, COUNT(*) as cnt FROM job_cards GROUP BY branch_id").all();
  branchesWithCards.forEach(function(b) {
    var prefix = BRANCH_ABBREVIATIONS[b.branch_id] || 'RC';
    db.prepare("INSERT INTO job_card_sequences (branch_id, prefix, last_sequence) VALUES (?, ?, ?)").run(b.branch_id, prefix, b.cnt);
  });
}

// Add columns for older DBs
var jcCols = ['client_company','client_address','device_condition','accessories','work_done','parts_used','invoice_no','public_token','created_by'];
jcCols.forEach(function(col) { try { db.exec('ALTER TABLE job_cards ADD COLUMN ' + col + ' TEXT'); } catch(e) {} });
// Add service_type column for existing DBs
try { db.exec("ALTER TABLE job_cards ADD COLUMN service_type TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE job_cards ADD COLUMN collection_code TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE job_cards ADD COLUMN collector_name TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE job_cards ADD COLUMN collection_proof_path TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE job_cards ADD COLUMN collection_signature_path TEXT"); } catch(e) {}

// Service type definitions: value → { label, category }
var SERVICE_TYPES = {
  'diagnostic': { label: 'Diagnostic / Assessment', category: 'software' },
  'screen-replacement-laptop': { label: 'Screen Replacement (Laptop)', category: 'hardware' },
  'screen-replacement-phone': { label: 'Screen Replacement (Cellphone)', category: 'hardware' },
  'charging-port-repair': { label: 'Charging Port Repair', category: 'hardware' },
  'keyboard-replacement': { label: 'Keyboard Replacement', category: 'hardware' },
  'battery-replacement': { label: 'Battery Replacement', category: 'hardware' },
  'ram-upgrade': { label: 'RAM / Storage Upgrade (Hardware)', category: 'hardware' },
  'hardware-upgrade': { label: 'Other Hardware Upgrade / Installation', category: 'hardware' },
  'power-repair': { label: 'Power Supply / Adapter Repair', category: 'hardware' },
  'liquid-damage': { label: 'Liquid Damage Repair', category: 'hardware' },
  'fan-repair': { label: 'Fan / Cooling System Repair', category: 'hardware' },
  'virus-removal': { label: 'Virus / Malware Removal', category: 'software' },
  'software-install': { label: 'Software Installation / Upgrade', category: 'software' },
  'data-recovery': { label: 'Data Recovery / Backup', category: 'software' },
  'os-repair': { label: 'Operating System Repair', category: 'software' },
  'networking-setup': { label: 'Networking Setup / Configuration', category: 'software' },
  'general-repair': { label: 'General PC / Laptop Repair & Maintenance', category: 'hardware' },
  'printer-repair': { label: 'Printer Setup / Repair', category: 'hardware' }
};

// Status flow per service category
var STATUS_FLOW = {
  hardware: ['diagnostic', 'in-progress', 'waiting-parts', 'ready', 'completed', 'collected'],
  software: ['diagnostic', 'in-progress', 'ready', 'completed', 'collected']
};

function getServiceCategory(serviceType) {
  var info = SERVICE_TYPES[serviceType];
  return info ? info.category : 'hardware';
}

function getValidStatuses(serviceType) {
  var cat = getServiceCategory(serviceType);
  return STATUS_FLOW[cat] || STATUS_FLOW.hardware;
}

var BRANCH_ABBREVIATIONS = {
  'branch-001': 'WDH',
  'branch-002': 'SWK',
  'branch-003': 'OSH',
  'branch-004': 'WVB',
  'branch-005': 'TSB',
  'branch-006': 'GRV'
};

function generateJobId(branchId) {
  var prefix = BRANCH_ABBREVIATIONS[branchId] || 'RC';
  var year = String(new Date().getFullYear()).slice(2);
  var seq = db.transaction(function() {
    var row = db.prepare("SELECT last_sequence FROM job_card_sequences WHERE branch_id = ?").get(branchId);
    var next = (row ? row.last_sequence : 0) + 1;
    if (row) {
      db.prepare("UPDATE job_card_sequences SET last_sequence = ? WHERE branch_id = ?").run(next, branchId);
    } else {
      db.prepare("INSERT INTO job_card_sequences (branch_id, prefix, last_sequence) VALUES (?, ?, ?)").run(branchId, prefix, next);
    }
    return next;
  })();
  return prefix + '-' + year + '-' + String(seq).padStart(5, '0');
}

function generatePublicToken() {
  return crypto.randomBytes(24).toString('hex');
}

// GET /api/admin/job-cards — list (branch-scoped)
app.get('/api/admin/job-cards', function(req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    var conditions = [];
    var params = [];

    // Branch isolation
    if (user.branch_id) {
      conditions.push('j.branch_id = ?');
      params.push(user.branch_id);
    } else if (req.query.branch) {
      conditions.push('j.branch_id = ?');
      params.push(req.query.branch);
    }

    if (req.query.status) {
      conditions.push('j.status = ?');
      params.push(req.query.status);
    }

    if (req.query.search) {
      var s = '%' + req.query.search.replace(/[%_]/g, '\\$&') + '%';
      conditions.push("(j.id LIKE ? ESCAPE '\\' OR j.client_name LIKE ? ESCAPE '\\' OR j.client_phone LIKE ? ESCAPE '\\' OR j.device_model LIKE ? ESCAPE '\\')");
      params.push(s, s, s, s);
    }

    var where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    var stmt = db.prepare('SELECT j.* FROM job_cards j ' + where + ' ORDER BY j.created_at DESC');
    var rows = params.length ? stmt.all.apply(stmt, params) : stmt.all();

    res.json({ success: true, jobCards: rows });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/admin/job-cards/:id — single card with history and branch info
app.get('/api/admin/job-cards/:id', function(req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    var row = db.prepare('SELECT j.*, b.name as branch_name, b.address as branch_address, b.phone as branch_phone, b.email as branch_email FROM job_cards j LEFT JOIN branches b ON b.id = j.branch_id WHERE j.id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Job card not found' });

    // Branch isolation
    if (user.branch_id && row.branch_id !== user.branch_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    var history = db.prepare('SELECT * FROM job_card_history WHERE job_card_id = ? ORDER BY created_at ASC').all(req.params.id);

    // Attach branch as object
    row.branch = { name: row.branch_name, address: row.branch_address, phone: row.branch_phone, email: row.branch_email };
    row.history = history;

    res.json({ success: true, jobCard: row });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/admin/job-cards — create
app.post('/api/admin/job-cards', function(req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    var b = req.body;
    if (!b.client_name) return res.status(400).json({ error: 'client_name is required' });

    // Enforce branch_id: branch users use their own branch, admin must supply one
    var branchId = user.branch_id || b.branch_id;
    if (!branchId) return res.status(400).json({ error: 'branch_id is required' });

    // Verify branch exists
    var branch = db.prepare('SELECT id FROM branches WHERE id = ?').get(branchId);
    if (!branch) return res.status(400).json({ error: 'Invalid branch_id' });

    // Branch user cannot create for another branch
    if (user.branch_id && b.branch_id && b.branch_id !== user.branch_id) {
      return res.status(403).json({ error: 'Cannot create job cards for other branches' });
    }

    var id = generateJobId(branchId);
    var token = generatePublicToken();
    var status = b.status || 'diagnostic';

    db.prepare(`INSERT INTO job_cards (
      id, branch_id, client_name, client_company, client_phone, client_email, client_address,
      device_type, device_brand, device_model, device_serial, device_condition, accessories,
      issue_description, technician_notes, work_done, parts_used, sales_rep, technician_name,
      status, diag_fee, total_cost, amount_paid, invoice_no, public_token, service_type
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, branchId,
      b.client_name, b.client_company || null, b.client_phone || null, b.client_email || null, b.client_address || null,
      b.device_type || null, b.device_brand || null, b.device_model || null, b.device_serial || null,
      b.device_condition || null, b.accessories || null,
      b.issue_description || null, b.technician_notes || null, b.work_done || null, b.parts_used || null,
      b.sales_rep || null, b.technician_name || null,
      status,
      parseFloat(b.diag_fee) || 0, parseFloat(b.total_cost) || 0, parseFloat(b.amount_paid) || 0,
      b.invoice_no || null, token,
      b.service_type || null
    );

    // Log initial status
    db.prepare('INSERT INTO job_card_history (job_card_id, status, note, changed_by) VALUES (?, ?, ?, ?)')
      .run(id, status, 'Job card created', user.name || user.username || 'system');

    logAudit(user, 'create-job-card', 'Created job card: ' + id + ' for ' + b.client_name, req);

    // Send tracking email to client
    var newCard = db.prepare('SELECT * FROM job_cards WHERE id = ?').get(id);
    if (newCard && newCard.client_email) {
      sendTrackingEmail(newCard, 'Your job card has been created');
    }

    res.json({ success: true, id: id, public_token: token });
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/admin/job-cards/:id — update
app.put('/api/admin/job-cards/:id', function(req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    var existing = db.prepare('SELECT * FROM job_cards WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Job card not found' });

    // Branch isolation
    if (user.branch_id && existing.branch_id !== user.branch_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    var b = req.body;
    var statusChanged = b.status && b.status !== existing.status;
    var completedAt = existing.completed_at;
    if (b.status === 'completed' && !completedAt) completedAt = new Date().toISOString();
    if (b.status && b.status !== 'completed') completedAt = null;

    // When status changes to 'ready', auto-generate collection code
    var collectionCode = b.status === 'ready' ? Math.random().toString(36).substring(2, 8).toUpperCase() : null;
    if (b.status === 'ready' && existing.collection_code) collectionCode = existing.collection_code;
    if (b.status !== 'ready') collectionCode = existing.collection_code;

    db.prepare(`UPDATE job_cards SET
      client_name=?, client_company=?, client_phone=?, client_email=?, client_address=?,
      device_type=?, device_brand=?, device_model=?, device_serial=?, device_condition=?, accessories=?,
      issue_description=?, technician_notes=?, work_done=?, parts_used=?, sales_rep=?, technician_name=?,
      status=?, diag_fee=?, total_cost=?, amount_paid=?, invoice_no=?,
      service_type=?, collection_code=?, collector_name=?, collection_proof_path=?,
      updated_at=datetime('now'), completed_at=?
    WHERE id=?`).run(
      b.client_name || existing.client_name,
      b.client_company !== undefined ? (b.client_company || null) : existing.client_company,
      b.client_phone !== undefined ? (b.client_phone || null) : existing.client_phone,
      b.client_email !== undefined ? (b.client_email || null) : existing.client_email,
      b.client_address !== undefined ? (b.client_address || null) : existing.client_address,
      b.device_type !== undefined ? (b.device_type || null) : existing.device_type,
      b.device_brand !== undefined ? (b.device_brand || null) : existing.device_brand,
      b.device_model !== undefined ? (b.device_model || null) : existing.device_model,
      b.device_serial !== undefined ? (b.device_serial || null) : existing.device_serial,
      b.device_condition !== undefined ? (b.device_condition || null) : existing.device_condition,
      b.accessories !== undefined ? (b.accessories || null) : existing.accessories,
      b.issue_description !== undefined ? (b.issue_description || null) : existing.issue_description,
      b.technician_notes !== undefined ? (b.technician_notes || null) : existing.technician_notes,
      b.work_done !== undefined ? (b.work_done || null) : existing.work_done,
      b.parts_used !== undefined ? (b.parts_used || null) : existing.parts_used,
      b.sales_rep !== undefined ? (b.sales_rep || null) : existing.sales_rep,
      b.technician_name !== undefined ? (b.technician_name || null) : existing.technician_name,
      b.status || existing.status,
      parseFloat(b.diag_fee) !== undefined ? parseFloat(b.diag_fee) || 0 : existing.diag_fee,
      parseFloat(b.total_cost) !== undefined ? parseFloat(b.total_cost) || 0 : existing.total_cost,
      parseFloat(b.amount_paid) !== undefined ? parseFloat(b.amount_paid) || 0 : existing.amount_paid,
      b.invoice_no !== undefined ? (b.invoice_no || null) : existing.invoice_no,
      b.service_type !== undefined ? (b.service_type || null) : existing.service_type,
      collectionCode,
      b.collector_name !== undefined ? (b.collector_name || null) : existing.collector_name,
      b.collection_proof_path !== undefined ? (b.collection_proof_path || null) : existing.collection_proof_path,
      completedAt,
      req.params.id
    );

    // Log status change
    if (statusChanged) {
      db.prepare('INSERT INTO job_card_history (job_card_id, status, note, changed_by) VALUES (?, ?, ?, ?)')
        .run(req.params.id, b.status, b.status_note || null, user.name || user.username || 'system');
    }

    logAudit(user, 'update-job-card', 'Updated job card: ' + req.params.id + (statusChanged ? ' (status: ' + existing.status + ' → ' + b.status + ')' : ''), req);

    // Send tracking email on status change
    if (statusChanged && existing.client_email) {
      var updatedCard = db.prepare('SELECT * FROM job_cards WHERE id = ?').get(req.params.id);
      if (updatedCard) sendTrackingEmail(updatedCard, 'Status update: ' + statusLabel(updatedCard.status));
    }

    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/admin/job-cards/:id/status — add a status update entry
app.post('/api/admin/job-cards/:id/status', function(req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    var existing = db.prepare('SELECT * FROM job_cards WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Job card not found' });

    if (user.branch_id && existing.branch_id !== user.branch_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    var newStatus = req.body.status;
    var validStatuses = getValidStatuses(existing.service_type);
    if (!newStatus || validStatuses.indexOf(newStatus) === -1) {
      return res.status(400).json({ error: 'Invalid status for this service type' });
    }

    // Require note/comment on all status changes
    var note = (req.body.note || '').trim();
    if (!note) {
      return res.status(400).json({ error: 'A comment is required when updating status' });
    }

    var completedAt = existing.completed_at;
    if (newStatus === 'completed' && !completedAt) completedAt = new Date().toISOString();
    if (newStatus !== 'completed') completedAt = null;

    // Auto-generate collection code when status changes to 'ready'
    var collectionCode = existing.collection_code;
    if (newStatus === 'ready' && !collectionCode) {
      collectionCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Handle collection — validate
    if (newStatus === 'collected') {
      var inputCode = (req.body.collection_code || '').trim().toUpperCase();
      var hasProof = req.body.collector_name && req.body.collection_proof_path;

      if (collectionCode && inputCode !== collectionCode && !hasProof) {
        return res.status(400).json({ error: 'Invalid collection code, or provide collector name + ID proof' });
      }
      // If code matches, auto-verify
      if (collectionCode && inputCode === collectionCode) {
        // Collection code matched — proceed
      }
    }

    db.prepare("UPDATE job_cards SET status=?, completed_at=?, updated_at=datetime('now'), collection_code=? WHERE id=?")
      .run(newStatus, completedAt, collectionCode, req.params.id);

    db.prepare('INSERT INTO job_card_history (job_card_id, status, note, changed_by) VALUES (?, ?, ?, ?)')
      .run(req.params.id, newStatus, note, user.name || user.username || 'system');

    logAudit(user, 'update-job-card-status', 'Status update for ' + req.params.id + ': ' + existing.status + ' → ' + newStatus, req);

    // If status is 'ready' and client has email, send collection code
    if (newStatus === 'ready' && existing.client_email && collectionCode) {
      try {
        var branchInfo = db.prepare('SELECT * FROM branches WHERE id = ?').get(existing.branch_id);
        var siteData = db.prepare("SELECT value FROM site_settings WHERE key='footer_company'").get();
        var companyName = siteData ? siteData.value : 'Royal Computers Namibia';
        var branchName = branchInfo ? branchInfo.name : '';

        var mailOpts = {
          from: process.env.SMTP_FROM || '"Royal Computers" <noreply@royalcomputers.na>',
          to: existing.client_email,
          subject: 'Your device is ready for collection - ' + existing.id,
          text: [
            'Dear ' + existing.client_name + ',',
            '',
            'Your device is ready for collection!',
            '',
            'Job Card: ' + existing.id,
            'Branch: ' + branchName,
            'Collection Code: ' + collectionCode,
            '',
            'Please bring this code when collecting your device.',
            'You can also view the status at: ' + (process.env.BASE_URL || '') + '/tracking.html?token=' + (existing.public_token || ''),
            '',
            'Thank you for choosing ' + companyName + '.',
            'Regards,',
            companyName + ' Workshop Team'
          ].join('\n'),
          html: [
            '<div style="font-family:sans-serif;max-width:500px;">',
            '<h2 style="color:#dc2626;">Your device is ready!</h2>',
            '<p>Dear <strong>' + esc(existing.client_name) + '</strong>,</p>',
            '<p>Your device is ready for collection.</p>',
            '<table style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0;">',
            '<tr><td style="padding:4px 12px 4px 0;font-weight:700;">Job Card:</td><td>' + esc(existing.id) + '</td></tr>',
            '<tr><td style="padding:4px 12px 4px 0;font-weight:700;">Branch:</td><td>' + esc(branchName) + '</td></tr>',
            '<tr><td style="padding:4px 12px 4px 0;font-weight:700;">Collection Code:</td><td style="font-size:24px;font-weight:900;letter-spacing:4px;color:#dc2626;">' + esc(collectionCode) + '</td></tr>',
            '</table>',
            '<p>Please present this code when collecting your device. You can also view the repair status online:</p>',
            '<p><a href="' + (process.env.BASE_URL || '') + '/tracking.html?token=' + (existing.public_token || '') + '" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Track Status</a></p>',
            '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">',
            '<p style="font-size:12px;color:#6b7280;">If you did not request this repair, please ignore this email.</p>',
            '</div>'
          ].join('')
        };

        var t = getTransporter();
        if (t) {
          t.sendMail(mailOpts).catch(function(mailErr) {
            console.error('Failed to send collection email:', mailErr.message);
          });
        }
      } catch (emailErr) {
        console.error('Email error:', emailErr.message);
      }
    }

    // Send tracking email for status updates (except 'ready' which has its own dedicated email)
    if (newStatus !== 'ready' && existing.client_email) {
      sendTrackingEmail(existing, 'Status update: ' + statusLabel(newStatus));
    }

    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/admin/job-cards/:id
app.delete('/api/admin/job-cards/:id', function(req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    var existing = db.prepare('SELECT * FROM job_cards WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Job card not found' });

    if (user.branch_id && existing.branch_id !== user.branch_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare('DELETE FROM job_card_history WHERE job_card_id = ?').run(req.params.id);
    db.prepare('DELETE FROM job_cards WHERE id = ?').run(req.params.id);
    logAudit(user, 'delete-job-card', 'Deleted job card: ' + req.params.id + ' for ' + existing.client_name, req);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/public/track-job?branch=&job= — public (no auth), read-only, safe fields only
app.get('/api/public/track-job', function(req, res) {
  try {
    var branchId = (req.query.branch || '').trim();
    var jobId = (req.query.job || '').trim();
    var token = (req.query.token || '').trim();

    if (!jobId) return res.status(400).json({ error: 'job parameter is required' });

    var row;
    // Allow lookup by token OR by (branch + jobId)
    if (token) {
      row = db.prepare('SELECT j.*, b.name as branch_name, b.address as branch_address, b.phone as branch_phone FROM job_cards j LEFT JOIN branches b ON b.id = j.branch_id WHERE j.public_token = ?').get(token);
    } else if (branchId && jobId) {
      row = db.prepare('SELECT j.*, b.name as branch_name, b.address as branch_address, b.phone as branch_phone FROM job_cards j LEFT JOIN branches b ON b.id = j.branch_id WHERE j.id = ? AND j.branch_id = ?').get(jobId, branchId);
    } else {
      return res.status(400).json({ error: 'Provide branch+job or token' });
    }

    if (!row) return res.status(404).json({ error: 'Job card not found' });

    // Return only safe public fields — no internal notes, no other clients' data
    var history = db.prepare('SELECT status, note, created_at FROM job_card_history WHERE job_card_id = ? ORDER BY created_at ASC').all(row.id);

    var safeCard = {
      id: row.id,
      status: row.status,
      client_name: row.client_name,
      device_type: row.device_type,
      device_brand: row.device_brand,
      device_model: row.device_model,
      device_serial: row.device_serial,
      issue_description: row.issue_description,
      service_type: row.service_type,
      collection_code: row.collection_code,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      branch_name: row.branch_name,
      branch_address: row.branch_address,
      branch_phone: row.branch_phone,
      public_token: row.public_token,
      history: history
    };

    res.json({ success: true, jobCard: safeCard });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/service-types — public list of service types with categories
app.get('/api/service-types', function(req, res) {
  var types = Object.keys(SERVICE_TYPES).map(function(k) {
    return { value: k, label: SERVICE_TYPES[k].label, category: SERVICE_TYPES[k].category };
  });
  res.json({ success: true, types: types });
});

// POST /api/admin/job-cards/:id/upload-proof — upload collection ID proof + signature
app.post('/api/admin/job-cards/:id/upload-proof', upload.fields([{ name: 'proof', maxCount: 1 }, { name: 'signature', maxCount: 1 }]), function(req, res) {
  function cleanupFiles() {
    if (req.files) {
      Object.keys(req.files).forEach(function(k) {
        (req.files[k] || []).forEach(function(f) { try { fs.unlinkSync(f.path); } catch(e) {} });
      });
    }
  }
  try {
    var user = getUserFromRequest(req);
    if (!user) { cleanupFiles(); return res.status(401).json({ error: 'Unauthorized' }); }

    var existing = db.prepare('SELECT * FROM job_cards WHERE id = ?').get(req.params.id);
    if (!existing) { cleanupFiles(); return res.status(404).json({ error: 'Job card not found' }); }

    if (user.branch_id && existing.branch_id !== user.branch_id) { cleanupFiles(); return res.status(403).json({ error: 'Access denied' }); }

    var proofFile = req.files && req.files['proof'] ? req.files['proof'][0] : null;
    var sigFile = req.files && req.files['signature'] ? req.files['signature'][0] : null;

    var collectorName = req.body.collector_name || '';
    if (!collectorName.trim()) {
      if (proofFile) try { fs.unlinkSync(proofFile.path); } catch(e) {}
      if (sigFile) try { fs.unlinkSync(sigFile.path); } catch(e) {}
      return res.status(400).json({ error: 'Collector name is required' });
    }

    var updateFields = ["collector_name=?", "updated_at=datetime('now')"];
    var updateParams = [collectorName.trim()];

    if (proofFile) {
      updateFields.push("collection_proof_path=?");
      updateParams.push(proofFile.path);
    }
    if (sigFile) {
      updateFields.push("collection_signature_path=?");
      updateParams.push(sigFile.path);
    }

    updateParams.push(req.params.id);
    db.prepare("UPDATE job_cards SET " + updateFields.join(',') + " WHERE id=?").run.apply(null, updateParams);

    logAudit(user, 'upload-proof', 'Uploaded collection proof' + (sigFile ? ' and signature' : '') + ' for job card ' + req.params.id + ' (collector: ' + collectorName.trim() + ')', req);
    res.json({
      success: true,
      proof_path: proofFile ? proofFile.path : null,
      signature_path: sigFile ? sigFile.path : null,
      collector_name: collectorName.trim()
    });
  } catch (err) {
    sendError(res, err);
  }
});

/* ─── PDF Generation ─── */
var pdfService = require('./pdf-service');

// GET /api/admin/job-cards/:id/pdf — generate PDF
app.get('/api/admin/job-cards/:id/pdf', function(req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    var row = db.prepare('SELECT j.*, b.name as branch_name, b.address as branch_address, b.phone as branch_phone, b.email as branch_email FROM job_cards j LEFT JOIN branches b ON b.id = j.branch_id WHERE j.id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Job card not found' });

    if (user.branch_id && row.branch_id !== user.branch_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    var history = db.prepare('SELECT * FROM job_card_history WHERE job_card_id = ? ORDER BY created_at ASC').all(req.params.id);
    var branch = { name: row.branch_name, address: row.branch_address, phone: row.branch_phone, email: row.branch_email };

    pdfService.generateJobCardPDF(row, branch, history).then(function(buffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="job-card-' + row.id.replace(/[^a-zA-Z0-9]/g, '-') + '.pdf"');
      res.send(buffer);
    }).catch(function(err) {
      sendError(res, err);
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/public/track-job/:token — public PDF by token
app.get('/api/public/job-card/:token/pdf', function(req, res) {
  try {
    var row = db.prepare('SELECT j.*, b.name as branch_name, b.address as branch_address, b.phone as branch_phone, b.email as branch_email FROM job_cards j LEFT JOIN branches b ON b.id = j.branch_id WHERE j.public_token = ?').get(req.params.token);
    if (!row) return res.status(404).json({ error: 'Job card not found' });

    var history = db.prepare('SELECT * FROM job_card_history WHERE job_card_id = ? ORDER BY created_at ASC').all(row.id);
    var branch = { name: row.branch_name, address: row.branch_address, phone: row.branch_phone, email: row.branch_email };

    pdfService.generateJobCardPDF(row, branch, history).then(function(buffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="job-card-' + row.id.replace(/[^a-zA-Z0-9]/g, '-') + '.pdf"');
      res.send(buffer);
    }).catch(function(err) {
      sendError(res, err);
    });
  } catch (err) {
    sendError(res, err);
  }
});

/* ─── Content Management API ─── */
require('./content-api')(app, db, getUserFromRequest, hashPassword, logAudit, sendError, SEED_BRANCH_PASSWORD, SEED_ADMIN_PASSWORD, SEED_SUPER_ADMIN_PASSWORD);

app.listen(PORT, function () {
  console.log('Royal Computers running on http://localhost:' + PORT);
});
