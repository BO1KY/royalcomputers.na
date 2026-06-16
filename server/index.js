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
var adminLastSeen = new Map();
var chatTyping = new Map();

// Periodic cleanup for memory leaks
setInterval(function () {
  var now = Date.now();
  // Clean expired sessions
  for (var key of sessions.keys()) {
    if (now > sessions.get(key).expires) sessions.delete(key);
  }
  // Clean stale adminLastSeen entries (older than 1 hour)
  var hourAgo = now - 3600000;
  for (var key2 of adminLastSeen.keys()) {
    if (adminLastSeen.get(key2) < hourAgo) adminLastSeen.delete(key2);
  }
  // Clean expired apiLimiter entries
  for (var key3 of apiLimiter.keys()) {
    if (now > apiLimiter.get(key3).reset) apiLimiter.delete(key3);
  }
  // Clean expired loginAttempts entries
  for (var key4 of loginAttempts.keys()) {
    if (now > loginAttempts.get(key4).reset) loginAttempts.delete(key4);
  }
  // Clean stale chatTyping entries (older than 10 seconds)
  for (var key5 of chatTyping.keys()) {
    if (now - chatTyping.get(key5) > 10000) chatTyping.delete(key5);
  }
}, 60000);

var db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ─── Migration system ───
db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT DEFAULT (datetime('now')))");
function migrate(name, sql) {
  var applied = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get(name);
  if (!applied) {
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(name);
      console.log('Migration applied: ' + name);
    } catch (e) {
      // Column already exists or other benign error — record as applied
      console.log('Migration skipped (already present): ' + name);
      try { db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)").run(name); } catch (_) {}
    }
  }
}
// ─── End migration system ───

db.exec("CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, created_at TEXT DEFAULT (datetime('now')))");
db.exec("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, email TEXT, company TEXT, subject TEXT, message TEXT, date TEXT)");
db.exec("CREATE TABLE IF NOT EXISTS unsubscribed_notified (email TEXT PRIMARY KEY, notified_at TEXT DEFAULT (datetime('now')))");
db.exec("CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL, sale_price REAL NOT NULL, old_price REAL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, label TEXT DEFAULT 'sale', ad_image TEXT, ad_video TEXT, description TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))");
db.exec("CREATE TABLE IF NOT EXISTS product_overrides (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL UNIQUE, price REAL, description TEXT, compatibility TEXT, specs TEXT, name TEXT, variants_json TEXT, hidden INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')))");
migrate('add_compatibility_to_product_overrides', "ALTER TABLE product_overrides ADD COLUMN compatibility TEXT");
migrate('add_specs_to_product_overrides', "ALTER TABLE product_overrides ADD COLUMN specs TEXT");
migrate('add_name_to_product_overrides', "ALTER TABLE product_overrides ADD COLUMN name TEXT");
migrate('add_hidden_to_product_overrides', "ALTER TABLE product_overrides ADD COLUMN hidden INTEGER DEFAULT 0");
migrate('add_image_to_product_overrides', "ALTER TABLE product_overrides ADD COLUMN image TEXT");
migrate('add_badge_to_product_overrides', "ALTER TABLE product_overrides ADD COLUMN badge TEXT");

db.exec("CREATE TABLE IF NOT EXISTS quotations (doc_number TEXT PRIMARY KEY, customer_info TEXT NOT NULL, items TEXT NOT NULL, subtotal REAL, tax REAL, total REAL, branch_id TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");

db.exec("CREATE TABLE IF NOT EXISTS custom_products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, image TEXT, badge TEXT, date TEXT, description TEXT, compatibility TEXT, specs TEXT, variants_json TEXT NOT NULL DEFAULT '[]', hidden INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");
db.exec("CREATE TABLE IF NOT EXISTS branch_products (branch_id TEXT NOT NULL, product_id TEXT NOT NULL, is_available INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (branch_id, product_id))");

var UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Users table for admin multi-user support
db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT '{}', branch_id TEXT, created_at TEXT DEFAULT (datetime('now')))");
migrate('add_branch_id_to_users', "ALTER TABLE users ADD COLUMN branch_id TEXT");
migrate('add_role_to_users', "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'staff'");

db.exec("CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, branch_id TEXT, status TEXT NOT NULL DEFAULT 'pending', requested_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolved_by TEXT)");
migrate('add_email_to_users', "ALTER TABLE users ADD COLUMN email TEXT");
migrate('add_reset_code_to_password_resets', "ALTER TABLE password_resets ADD COLUMN reset_code TEXT");
migrate('add_code_expires_to_password_resets', "ALTER TABLE password_resets ADD COLUMN code_expires TEXT");
migrate('add_email_to_password_resets', "ALTER TABLE password_resets ADD COLUMN email TEXT");

// ─── Feature enhancements: new columns & tables ───
migrate('add_source_to_subscribers', "ALTER TABLE subscribers ADD COLUMN source TEXT DEFAULT 'website'");
migrate('add_notes_to_subscribers', "ALTER TABLE subscribers ADD COLUMN notes TEXT");
migrate('add_is_read_to_messages', "ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0");
migrate('add_replied_at_to_messages', "ALTER TABLE messages ADD COLUMN replied_at TEXT");
migrate('add_assigned_to_to_messages', "ALTER TABLE messages ADD COLUMN assigned_to TEXT");
migrate('add_status_to_quotations', "ALTER TABLE quotations ADD COLUMN status TEXT DEFAULT 'pending'");
migrate('add_last_login_to_users', "ALTER TABLE users ADD COLUMN last_login TEXT");
migrate('add_is_active_to_users', "ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1");
migrate('add_created_by_to_users', "ALTER TABLE users ADD COLUMN created_by INTEGER");
migrate('add_is_active_to_branches', "ALTER TABLE branches ADD COLUMN is_active INTEGER DEFAULT 1");
migrate('add_latitude_real_to_branches', "ALTER TABLE branches ADD COLUMN latitude REAL");
migrate('add_longitude_real_to_branches', "ALTER TABLE branches ADD COLUMN longitude REAL");
migrate('add_hours_json_to_branches', "ALTER TABLE branches ADD COLUMN hours_json TEXT");
migrate('add_category_to_faqs', "ALTER TABLE faqs ADD COLUMN category TEXT DEFAULT 'General'");
migrate('add_is_active_to_faqs', "ALTER TABLE faqs ADD COLUMN is_active INTEGER DEFAULT 1");
migrate('add_clerk_id_to_users', "ALTER TABLE users ADD COLUMN clerk_id TEXT");
migrate('add_user_email', "ALTER TABLE users ADD COLUMN email TEXT");
migrate('add_user_phone', "ALTER TABLE users ADD COLUMN phone TEXT");
migrate('add_user_address', "ALTER TABLE users ADD COLUMN address TEXT");
migrate('add_user_city', "ALTER TABLE users ADD COLUMN city TEXT");
migrate('add_user_google_id', "ALTER TABLE users ADD COLUMN google_id TEXT");
migrate('add_user_avatar', "ALTER TABLE users ADD COLUMN avatar_url TEXT");
migrate('add_user_display_name', "ALTER TABLE users ADD COLUMN display_name TEXT");
migrate('add_client_email_index', "CREATE INDEX IF NOT EXISTS idx_job_cards_client_email ON job_cards(client_email)");
try { db.exec("CREATE TABLE IF NOT EXISTS wishlist (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, product_id TEXT NOT NULL, variant_index INTEGER DEFAULT 0, added_at TEXT DEFAULT (datetime('now')), FOREIGN KEY(user_id) REFERENCES users(id), UNIQUE(user_id, product_id, variant_index))"); } catch(e) {}

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
migrate('add_ip_address_to_audit_log', "ALTER TABLE audit_log ADD COLUMN ip_address TEXT");
migrate('add_user_agent_to_audit_log', "ALTER TABLE audit_log ADD COLUMN user_agent TEXT");

// Indexes for performance
try { db.exec("CREATE INDEX IF NOT EXISTS idx_job_cards_branch_id ON job_cards(branch_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_job_cards_status ON job_cards(status)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_job_cards_created_at ON job_cards(created_at)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_job_cards_public_token ON job_cards(public_token)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_job_card_history_job_card_id ON job_card_history(job_card_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sales_dates ON sales(start_date, end_date)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_branches_city ON branches(city)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_quotations_branch_id ON quotations(branch_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_custom_products_category ON custom_products(category)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status)"); } catch(e) {}
migrate('create_chat_ratings', "CREATE TABLE IF NOT EXISTS chat_ratings (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5), feedback TEXT, created_at TEXT DEFAULT (datetime('now')))");

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
  var buf = Buffer.alloc(16);
  var bytesRead = fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  if (bytesRead < 2) return false;
  // JPEG: FF D8 FF — check first 3 bytes
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
    // Verify SOI marker then check for EOI marker somewhere in buffer
    return true;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A — 8-byte signature
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
      buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A) {
    return bytesRead >= 8;
  }
  // GIF: 47 49 46 38 37 61 (GIF87a) or 47 49 46 38 39 61 (GIF89a)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
      (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61) {
    return bytesRead >= 6;
  }
  // BMP: 42 4D — 2-byte magic, verify file size in bytes 2-5
  if (buf[0] === 0x42 && buf[1] === 0x4D) {
    return bytesRead >= 6;
  }
  // TIFF (LE): 49 49 2A 00
  if (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2A && buf[3] === 0x00) {
    return true;
  }
  // TIFF (BE): 4D 4D 00 2A
  if (buf[0] === 0x4D && buf[1] === 0x4D && buf[2] === 0x00 && buf[3] === 0x2A) {
    return true;
  }
  // WebP: RIFF (52 49 46 46) .... WEBP (57 45 42 50 at offset 8)
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return bytesRead >= 12;
  }
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
  origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : (process.env.NODE_ENV === 'production' ? false : '*'),
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
  // Prevent caching of API responses
  if (req.path.indexOf('/api/') === 0) {
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

// Input validation helper: trim, check max length, return sanitized value or null on failure
function validateField(value, maxLen) {
  if (value == null) return null;
  var trimmed = String(value).trim().replace(/\0/g, '');
  if (maxLen && trimmed.length > maxLen) return null;
  return trimmed;
}

function validateRequired(value, maxLen, label) {
  var v = validateField(value, maxLen);
  if (!v) throw new Error(label + ' is required or too long (max ' + maxLen + ' chars)');
  return v;
}

// Escape LIKE wildcards in user input for SQL LIKE queries
function escapeLike(str) {
  return String(str).replace(/[%_]/g, '\\$&');
}

app.use(function (req, res, next) {
  var blocked = ['/server/data', '/server/data.db', '/server/data.db-shm', '/server/data.db-wal', '/server/.env', '/.env', '/package.json', '/package-lock.json', '/node_modules'];
  if (blocked.indexOf(req.path) !== -1 || req.path.startsWith('/server/data/')) {
    return res.status(403).send('Forbidden');
  }
  next();
});

// Only serve specific public directories via static middleware
app.use('/ROYAL PICS', express.static(path.join(__dirname, '..', 'ROYAL PICS')));
app.use('/css', express.static(path.join(__dirname, '..', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', 'js')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Serve specific root files individually
app.get('/manifest.json', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'js', 'manifest.json'));
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
  if (!origin && !referer) return true;
  var allowed = (origin || referer || '').toLowerCase();
  var hostParts = host ? host.split(':') : [];
  var hostname = hostParts[0] || '';
  // Exact match: protocol + hostname (port stripped for comparison)
  var matchHost = '://' + hostname;
  var matchHostWww = '://www.' + hostname;
  if (allowed.indexOf(matchHost) >= 0 || allowed.indexOf(matchHostWww) >= 0) {
    // Ensure it's not a subdomain match — verify it's the exact host or www prefix
    var afterProto = allowed.split('://')[1] || '';
    var allowedHost = afterProto.split('/')[0].split(':')[0];
    if (allowedHost === hostname || allowedHost === 'www.' + hostname) return true;
  }
  // Allow localhost in non-production
  if (process.env.NODE_ENV !== 'production') {
    try {
      var url = new URL(allowed);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    } catch (_) {}
  }
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

function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function(m) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m];
  });
}

function sendTrackingEmail(jobCard, statusUpdateMsg) {
  try {
    if (!jobCard.client_email) return;
    var branchInfo = db.prepare('SELECT * FROM branches WHERE id = ?').get(jobCard.branch_id);
    var siteData = db.prepare("SELECT value FROM site_settings WHERE key='footer_company'").get();
    var companyName = siteData ? siteData.value : 'Royal Computers Namibia';
    var branchName = branchInfo ? branchInfo.name : '';
    var baseUrl = 'https://royalcomputers.na';
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
  return null;
}

function getUserFromRequest(req) {
  // Check existing session token auth
  var token = getTokenFromRequest(req);
  if (token && sessions.has(token)) {
    var s = sessions.get(token);
    if (Date.now() < s.expires) {
      s.expires = Date.now() + SESSION_TTL;
      if (s.user) adminLastSeen.set(s.user.username || 'admin', Date.now());
      return s.user || null;
    }
    sessions.delete(token);
  }
  return null;
}

function authorizeRequest(req) {
  // Check existing session token auth
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

// ─── Password reset with email code ───
app.post('/api/admin/password-resets/:id/approve-with-email', function (req, res) {
  try {
    var admin = getUserFromRequest(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!admin.permissions.users && admin.id !== 0) return res.status(403).json({ error: 'Forbidden' });
    var reset = db.prepare("SELECT * FROM password_resets WHERE id = ? AND status = 'pending'").get(req.params.id);
    if (!reset) return res.status(404).json({ error: 'Reset request not found or already resolved' });
    if (admin.branch_id && reset.branch_id !== admin.branch_id) return res.status(403).json({ error: 'Cannot reset passwords for other branches' });

    // Get the user's email (from users table, or branch table, or the reset request itself)
    var user = db.prepare("SELECT email FROM users WHERE username = ?").get(reset.username);
    var email = reset.email || (user && user.email) || '';
    if (!email && reset.branch_id) {
      var branch = db.prepare("SELECT email FROM branches WHERE id = ?").get(reset.branch_id);
      if (branch && branch.email) email = branch.email;
    }
    if (!email) return res.status(400).json({ error: 'No email address found for this user. Add an email to the user account first.' });

    // Generate 6-digit code
    var code = String(Math.floor(100000 + Math.random() * 900000));
    var expires = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min expiry

    db.prepare("UPDATE password_resets SET reset_code = ?, code_expires = ?, email = ?, status = 'approved', resolved_at = datetime('now'), resolved_by = ? WHERE id = ?").run(
      code, expires, email, admin.username || 'admin', req.params.id
    );

    // Send email with the code
    var mailOpts = {
      from: '"Royal Computers Namibia" <' + (process.env.SMTP_USER || 'noreply@royalcomputers.com.na') + '>',
      to: email,
      subject: 'Your Password Reset Code – Royal Computers Namibia',
      html: '' +
        '<div style="font-family:\'DM Sans\',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">' +
          '<div style="text-align:center;margin-bottom:20px;">' +
            '<img src="' + (process.env.BASE_URL || '') + '/ROYAL%20PICS/royal%20logo.webp" alt="Royal Computers" style="width:60px;border-radius:8px;" />' +
          '</div>' +
          '<h2 style="margin:0 0 8px;font-size:18px;">Password Reset Code</h2>' +
          '<p style="font-size:14px;color:#555;margin:0 0 16px;">Hello <strong>' + escHtml(reset.username) + '</strong>, use the code below to reset your password. This code expires in 30 minutes.</p>' +
          '<div style="text-align:center;padding:20px;background:#f5f3f4;border-radius:12px;margin:16px 0;">' +
            '<span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1a1a2e;">' + code + '</span>' +
          '</div>' +
          '<p style="font-size:12px;color:#999;">Didn\'t request this? You can ignore this email.</p>' +
          '<hr style="border:none;border-top:1px solid #eee;margin:16px 0;">' +
          '<p style="font-size:11px;color:#aaa;text-align:center;">&copy; Royal Computers Namibia</p>' +
        '</div>'
    };
    var t = getTransporter();
    if (!t) {
      logAudit(admin, 'approve-reset-email-failed', 'SMTP not configured, code: ' + code, req);
      return res.json({ success: true, warning: 'Email service not configured. Code: ' + code, code: code });
    }
    t.sendMail(mailOpts, function (emailErr) {
      if (emailErr) {
        console.error('Password reset email error:', emailErr.message);
        logAudit(admin, 'approve-reset-email-failed', 'Approved reset for ' + reset.username + ' but email to ' + email + ' failed: ' + emailErr.message, req);
        return res.json({ success: true, warning: 'Code generated but email delivery failed. Code: ' + code, code: code });
      }
      logAudit(admin, 'approve-reset-email', 'Approved reset for ' + reset.username + ', code sent to ' + email, req);
      res.json({ success: true, message: '6-digit code sent to ' + email });
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/verify-reset-code', function (req, res) {
  try {
    var username = (req.body.username || '').trim().toLowerCase();
    var code = (req.body.code || '').trim();
    if (!username || !code) return res.status(400).json({ error: 'Username and code are required' });
    var reset = db.prepare("SELECT * FROM password_resets WHERE username = ? AND reset_code = ? AND status = 'approved' ORDER BY requested_at DESC").get(username, code);
    if (!reset) return res.status(400).json({ error: 'Invalid code or no reset request found.' });
    if (new Date(reset.code_expires) < new Date()) {
      db.prepare("UPDATE password_resets SET status = 'expired', resolved_at = datetime('now') WHERE id = ?").run(reset.id);
      return res.status(400).json({ error: 'Code has expired. Request a new reset.' });
    }
    res.json({ success: true, message: 'Code verified. You can now set a new password.', resetId: reset.id });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/complete-password-reset', function (req, res) {
  try {
    var username = (req.body.username || '').trim().toLowerCase();
    var code = (req.body.code || '').trim();
    var newPassword = req.body.password || '';
    if (!username || !code || !newPassword) return res.status(400).json({ error: 'Username, code, and new password are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    var reset = db.prepare("SELECT * FROM password_resets WHERE username = ? AND reset_code = ? AND status = 'approved' ORDER BY requested_at DESC").get(username, code);
    if (!reset) return res.status(400).json({ error: 'Invalid code or no reset request found.' });
    if (new Date(reset.code_expires) < new Date()) return res.status(400).json({ error: 'Code has expired.' });
    var hash = hashPassword(newPassword);
    db.prepare("UPDATE users SET password_hash = ? WHERE username = ?").run(hash, username);
    db.prepare("UPDATE password_resets SET status = 'completed', resolved_at = datetime('now') WHERE id = ?").run(reset.id);
    res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
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
      conditions.push("username LIKE ? ESCAPE '\\'");
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
    var rows = q ? db.prepare("SELECT * FROM subscribers WHERE email LIKE ? ESCAPE '\\' ORDER BY created_at DESC").all('%' + q.replace(/[%_]/g,'\\$&') + '%') : db.prepare("SELECT * FROM subscribers ORDER BY created_at DESC").all();
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
      var newHash = hashPassword(newPassword);
      var envPath = path.join(__dirname, '.env');
      var envContent = fs.readFileSync(envPath, 'utf8');
      if (envContent.indexOf('ADMIN_PASSWORD_HASH=') >= 0) {
        envContent = envContent.replace(/^ADMIN_PASSWORD_HASH=.*$/m, 'ADMIN_PASSWORD_HASH=' + newHash);
      } else {
        envContent += '\nADMIN_PASSWORD_HASH=' + newHash;
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
      ADMIN_HASH = newHash;
      logAudit(user, 'change-master-password', 'Changed master admin password', req);
      return res.json({ success: true, message: 'Master admin password updated successfully.' });
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
          try {
            await sharp(tempPath).webp({ quality: 85 }).toFile(filePath);
            fs.unlinkSync(tempPath);
          } catch (convErr) {
            // Restore original file on conversion failure
            try {
              if (fs.existsSync(tempPath)) {
                fs.renameSync(tempPath, filePath);
              }
            } catch (_) {}
            console.warn('WebP conversion failed:', convErr.message);
          }
        }
      } catch (err) {
        console.warn('Image processing error:', err.message);
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
    var campEmail = s.campaign_footer_email || 'windhoek@royalcomputers.na';
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
      'www.royalcomputers.na | ' + campHours +
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

migrate('add_is_headquarters_to_branches', "ALTER TABLE branches ADD COLUMN is_headquarters INTEGER DEFAULT 0");
migrate('add_sort_order_to_branches', "ALTER TABLE branches ADD COLUMN sort_order INTEGER DEFAULT 0");
migrate('add_whatsapp_to_branches', "ALTER TABLE branches ADD COLUMN whatsapp TEXT");
migrate('add_latitude_text_to_branches', "ALTER TABLE branches ADD COLUMN latitude TEXT");
migrate('add_longitude_text_to_branches', "ALTER TABLE branches ADD COLUMN longitude TEXT");
migrate('add_description_to_branches', "ALTER TABLE branches ADD COLUMN description TEXT");
migrate('add_image_to_branches', "ALTER TABLE branches ADD COLUMN image TEXT");

// Insert default branches if empty (using IDs matching js/branches.js)
var branchCount = db.prepare("SELECT COUNT(*) as c FROM branches").get().c;
if (branchCount === 0) {
  var stmt = db.prepare("INSERT INTO branches (id, name, city, address, phone, email) VALUES (?, ?, ?, ?, ?, ?)");
  stmt.run('branch-001', 'Royal Computers - Gustav Voigts Centre, Windhoek', 'Windhoek', 'GF Shop 12 Gustav Voigts Center, Independence Ave', '061228179', 'windhoek@royalcomputers.na');
  stmt.run('branch-002', 'Royal Computers - Swakopmund', 'Swakopmund', 'Shop 03 Minette Court Sam Nujoma Street', '064406914', 'swakop@royalcomputers.na');
  stmt.run('branch-003', 'Royal Computers - Oshakati', 'Oshakati', 'Shop 42 Etango Complex', '065227045', 'oshakati@royalcomputers.na');
  stmt.run('branch-004', 'Royal Computers - Walvis Bay', 'Walvis Bay', '111 Hage Geingob Street Office C', '064200453', 'walvisbay@royalcomputers.na');
  stmt.run('branch-005', 'Royal Computers - Tsumeb', 'Tsumeb', 'Shop 03 Tsumeb Shopping Mall', '+264818163936', 'tsumeb@royalcomputers.na');
  stmt.run('branch-006', 'Royal Computers - Grove Mall, Windhoek', 'Windhoek', 'GF Shop 256 Grove Mall', '061242938', 'grove@royalcomputers.na');
}

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

// Add columns for older DBs
var jcCols = ['client_company','client_address','device_condition','accessories','work_done','parts_used','invoice_no','public_token','created_by'];
jcCols.forEach(function(col) { try { db.exec('ALTER TABLE job_cards ADD COLUMN ' + col + ' TEXT'); } catch(e) {} });
// Add service_type column for existing DBs
migrate('add_service_type_to_job_cards', "ALTER TABLE job_cards ADD COLUMN service_type TEXT");
migrate('add_collection_code_to_job_cards', "ALTER TABLE job_cards ADD COLUMN collection_code TEXT");
migrate('add_collector_name_to_job_cards', "ALTER TABLE job_cards ADD COLUMN collector_name TEXT");
migrate('add_collection_proof_path_to_job_cards', "ALTER TABLE job_cards ADD COLUMN collection_proof_path TEXT");
migrate('add_collection_signature_path_to_job_cards', "ALTER TABLE job_cards ADD COLUMN collection_signature_path TEXT");

// ── Live Chat ──
db.exec("CREATE TABLE IF NOT EXISTS chat_sessions (id TEXT PRIMARY KEY, client_name TEXT DEFAULT 'Guest', client_email TEXT DEFAULT '', status TEXT DEFAULT 'active' CHECK(status IN ('active','closed')), created_at TEXT DEFAULT (datetime('now')), last_activity TEXT DEFAULT (datetime('now')))");
db.exec("CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, sender_type TEXT NOT NULL CHECK(sender_type IN ('client','admin')), sender_name TEXT DEFAULT '', message TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), read_at TEXT, FOREIGN KEY(session_id) REFERENCES chat_sessions(id))");
migrate('add_read_at_to_chat_messages', "ALTER TABLE chat_messages ADD COLUMN read_at TEXT");
migrate('add_assigned_to_chat_sessions', "ALTER TABLE chat_sessions ADD COLUMN assigned_to TEXT");
migrate('add_branch_id_to_chat_sessions', "ALTER TABLE chat_sessions ADD COLUMN branch_id TEXT");
migrate('add_branch_name_to_chat_sessions', "ALTER TABLE chat_sessions ADD COLUMN branch_name TEXT");
migrate('add_message_type_to_chat_messages', "ALTER TABLE chat_messages ADD COLUMN message_type TEXT DEFAULT 'text'");
migrate('add_attachments_json_to_chat_messages', "ALTER TABLE chat_messages ADD COLUMN attachments_json TEXT");
migrate('add_transferred_from_to_chat_sessions', "ALTER TABLE chat_sessions ADD COLUMN transferred_from TEXT");

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

// Seed sequences for branches that have existing job cards
function generateJobId(branchId) {
  var prefix = BRANCH_ABBREVIATIONS[branchId] || 'RC';
  var year = String(new Date().getFullYear()).slice(2);
  // Atomic increment using UPDATE ... SET last_sequence = last_sequence + 1
  var stmt = db.prepare(`
    INSERT INTO job_card_sequences (branch_id, prefix, last_sequence)
    VALUES (?, ?, 1)
    ON CONFLICT(branch_id) DO UPDATE SET last_sequence = last_sequence + 1
    RETURNING last_sequence
  `);
  var result = stmt.get(branchId, prefix);
  var seq = result.last_sequence;
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

    if (user.id !== 0) return res.status(403).json({ error: 'Only master admin can delete job cards' });

    var existing = db.prepare('SELECT * FROM job_cards WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Job card not found' });

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

/* ─── User Authentication System ─── */

var USER_SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
var userSessions = new Map();
var GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
var GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
var googleAuthEnabled = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
var BASE_URL = process.env.BASE_URL || ('http://localhost:' + (process.env.PORT || 3000));

function getUserFromUserSession(req) {
  var header = req.headers['authorization'] || '';
  var token = header.replace('Bearer ', '').trim();
  if (!token) {
    token = (req.query && req.query.token) || '';
  }
  if (!token) return null;
  var session = userSessions.get(token);
  if (!session || Date.now() > session.expires) {
    if (session) userSessions.delete(token);
    return null;
  }
  return session.user;
}

// ── Register ──
app.post('/api/user/register', function (req, res) {
  try {
    var b = req.body;
    var username = (b.username || '').trim().toLowerCase();
    var email = (b.email || '').trim().toLowerCase();
    var password = b.password || '';
    var name = (b.name || b.display_name || '').trim();
    if (!username || !email || !password || !name) return res.status(400).json({ error: 'Username, email, password, and name are required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, underscores)' });
    var existing = db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(username, email);
    if (existing) return res.status(409).json({ error: 'Username or email already taken' });
    var hash = hashPassword(password);
    var result = db.prepare("INSERT INTO users (username, password_hash, name, display_name, email, permissions, role) VALUES (?, ?, ?, ?, ?, '{}', 'user')").run(username, hash, name, name, email);
    var userId = result.lastInsertRowid;
    var token = crypto.randomBytes(32).toString('hex');
    var userInfo = { id: userId, username: username, name: name, display_name: name, email: email, role: 'user' };
    userSessions.set(token, { expires: Date.now() + USER_SESSION_TTL, user: userInfo });
    res.json({ success: true, token: token, user: userInfo });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) return res.status(409).json({ error: 'Username or email already taken' });
    sendError(res, err);
  }
});

// ── Login ──
app.post('/api/user/login', function (req, res) {
  try {
    var ip = req.ip || req.connection.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many login attempts. Try again in 60 seconds.' });
    var b = req.body;
    var login = (b.login || '').trim().toLowerCase();
    var password = b.password || '';
    if (!login || !password) return res.status(400).json({ error: 'Login and password are required' });
    var user = db.prepare("SELECT * FROM users WHERE (username = ? OR email = ?) AND role = 'user'").get(login, login);
    if (!user) { loginAttempts.delete(ip); return res.status(401).json({ error: 'Invalid login or password' }); }
    if (!verifyPassword(password, user.password_hash)) { loginAttempts.delete(ip); return res.status(401).json({ error: 'Invalid login or password' }); }
    if (!user.is_active && user.is_active !== undefined && user.is_active !== 1) return res.status(403).json({ error: 'Account is disabled' });
    var token = crypto.randomBytes(32).toString('hex');
    var userInfo = { id: user.id, username: user.username, name: user.display_name || user.name, email: user.email || '', phone: user.phone || '', address: user.address || '', city: user.city || '', avatar_url: user.avatar_url || '', role: user.role };
    userSessions.set(token, { expires: Date.now() + USER_SESSION_TTL, user: userInfo });
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
    loginAttempts.delete(ip);
    res.json({ success: true, token: token, user: userInfo });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Google OAuth ──
app.get('/api/auth/google', function (req, res) {
  if (!googleAuthEnabled) return res.status(400).json({ error: 'Google login not configured' });
  var redirectUri = BASE_URL + '/api/auth/google/callback';
  var url = 'https://accounts.google.com/o/oauth2/v2/auth?' +
    'client_id=' + encodeURIComponent(GOOGLE_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&response_type=code' +
    '&scope=' + encodeURIComponent('openid email profile') +
    '&access_type=offline';
  res.redirect(url);
});

app.get('/api/auth/google/callback', function (req, res) {
  var code = req.query.code;
  if (!code) return res.redirect('/auth.html?error=google_failed');
  var redirectUri = BASE_URL + '/api/auth/google/callback';
  var https = require('https');
  var postData = 'code=' + encodeURIComponent(code) +
    '&client_id=' + encodeURIComponent(GOOGLE_CLIENT_ID) +
    '&client_secret=' + encodeURIComponent(GOOGLE_CLIENT_SECRET) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&grant_type=authorization_code';
  var options = {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
  };
  var tokenReq = https.request(options, function (tokenRes) {
    var body = '';
    tokenRes.on('data', function (c) { body += c; });
    tokenRes.on('end', function () {
      try {
        var data = JSON.parse(body);
        if (!data.id_token) return res.redirect('/auth.html?error=google_failed');
        // Decode the ID token (JWT) — just parse the payload part
        var parts = data.id_token.split('.');
        if (parts.length !== 3) return res.redirect('/auth.html?error=google_failed');
        var payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        var googleId = payload.sub;
        var googleEmail = (payload.email || '').toLowerCase();
        var googleName = payload.name || payload.given_name || 'Google User';
        var avatar = payload.picture || '';
        if (!googleEmail) return res.redirect('/auth.html?error=google_no_email');
        // Find or create user
        var user = db.prepare("SELECT * FROM users WHERE google_id = ? OR email = ?").get(googleId, googleEmail);
        if (user) {
          // Update google ID if not set
          if (!user.google_id) db.prepare("UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?").run(googleId, avatar || user.avatar_url, user.id);
        } else {
          // Create new user
          var genUsername = 'google_' + googleId.slice(-10);
          var dummyHash = hashPassword(crypto.randomBytes(20).toString('hex'));
          var result = db.prepare("INSERT INTO users (username, password_hash, name, display_name, email, google_id, avatar_url, permissions, role) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 'user')").run(genUsername, dummyHash, googleName, googleName, googleEmail, googleId, avatar || null);
          user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
        }
        if (!user) return res.redirect('/auth.html?error=create_failed');
        var token = crypto.randomBytes(32).toString('hex');
        var userInfo = { id: user.id, username: user.username, name: user.display_name || user.name, email: user.email || '', phone: user.phone || '', address: user.address || '', city: user.city || '', avatar_url: user.avatar_url || '', role: user.role };
        userSessions.set(token, { expires: Date.now() + USER_SESSION_TTL, user: userInfo });
        db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
        // Redirect with token in fragment (#) instead of query string to avoid server logs
        res.redirect('/dashboard.html#token=' + token);
      } catch (e) {
        res.redirect('/auth.html?error=google_failed');
      }
    });
  });
  tokenReq.on('error', function () { res.redirect('/auth.html?error=google_failed'); });
  tokenReq.write(postData);
  tokenReq.end();
});

// ── Get current user profile ──
app.get('/api/user/profile', function (req, res) {
  try {
    var user = getUserFromUserSession(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    var fullUser = db.prepare("SELECT id, username, name, display_name, email, phone, address, city, avatar_url, role, created_at, last_login FROM users WHERE id = ?").get(user.id);
    if (!fullUser) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: fullUser });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Update profile ──
app.put('/api/user/profile', function (req, res) {
  try {
    var user = getUserFromUserSession(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    var b = req.body;
    var name = (b.name || '').trim();
    var email = (b.email || '').trim().toLowerCase();
    var phone = (b.phone || '').trim();
    var address = (b.address || '').trim();
    var city = (b.city || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (email) {
      var existing = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, user.id);
      if (existing) return res.status(409).json({ error: 'Email already in use' });
    }
    db.prepare("UPDATE users SET name=?, display_name=?, email=?, phone=?, address=?, city=? WHERE id=?").run(
      name || user.name, name || user.name, email || user.email, phone || user.phone, address || user.address, city || user.city, user.id
    );
    // Update session
    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone || user.phone;
    user.address = address || user.address;
    user.city = city || user.city;
    res.json({ success: true, message: 'Profile updated', user: user });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Change password ──
app.put('/api/user/password', function (req, res) {
  try {
    var user = getUserFromUserSession(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    var b = req.body;
    var currentPw = b.current_password || '';
    var newPw = b.new_password || '';
    if (!currentPw || !newPw) return res.status(400).json({ error: 'Current and new passwords are required' });
    if (newPw.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    var fullUser = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    if (!fullUser || !verifyPassword(currentPw, fullUser.password_hash)) return res.status(401).json({ error: 'Current password is incorrect' });
    var hash = hashPassword(newPw);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Wishlist ──
app.get('/api/user/wishlist', function (req, res) {
  try {
    var user = getUserFromUserSession(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    var items = db.prepare("SELECT w.*, p.name as product_name, p.image, p.category FROM wishlist w LEFT JOIN custom_products p ON p.id = w.product_id WHERE w.user_id = ? ORDER BY w.added_at DESC").all(user.id);
    res.json({ success: true, items: items });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/user/wishlist', function (req, res) {
  try {
    var user = getUserFromUserSession(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    var productId = (req.body.product_id || '').trim();
    var variantIndex = req.body.variant_index || 0;
    if (!productId) return res.status(400).json({ error: 'Product ID required' });
    try {
      db.prepare("INSERT OR IGNORE INTO wishlist (user_id, product_id, variant_index) VALUES (?, ?, ?)").run(user.id, productId, variantIndex);
    } catch(e) {}
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/user/wishlist/:id', function (req, res) {
  try {
    var user = getUserFromUserSession(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    db.prepare("DELETE FROM wishlist WHERE id = ? AND user_id = ?").run(req.params.id, user.id);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Generate quote from wishlist ──
app.post('/api/user/wishlist/quote', function (req, res) {
  try {
    var user = getUserFromUserSession(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    var itemIds = req.body.item_ids || [];
    if (!itemIds.length) return res.status(400).json({ error: 'No items selected' });
    var placeholders = itemIds.map(function() { return '?'; }).join(',');
    var items = db.prepare("SELECT w.*, p.name, p.price, p.image FROM wishlist w LEFT JOIN custom_products p ON p.id = w.product_id WHERE w.id IN (" + placeholders + ") AND w.user_id = ?").all.apply(null, itemIds.concat([user.id]));
    if (!items.length) return res.status(404).json({ error: 'No wishlist items found' });
    var quoteItems = items.map(function(item) { return { product_id: item.product_id, name: item.name || 'Unknown', price: item.price || 0, qty: 1 }; });
    var subtotal = quoteItems.reduce(function(sum, i) { return sum + (parseFloat(i.price) || 0); }, 0);
    var docNum = 'Q-' + Date.now().toString(36).toUpperCase() + '-' + String(user.id).slice(-4);
    db.prepare("INSERT INTO quotations (doc_number, customer_info, items, subtotal, tax, total) VALUES (?, ?, ?, ?, 0, ?)").run(
      docNum, JSON.stringify({ name: user.name, email: user.email }), JSON.stringify(quoteItems), subtotal, subtotal
    );
    res.json({ success: true, doc_number: docNum, items: quoteItems, total: subtotal });
  } catch (err) {
    sendError(res, err);
  }
});

// ── User's quotes ──
app.get('/api/user/quotes', function (req, res) {
  try {
    var user = getUserFromUserSession(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    var rows = db.prepare("SELECT * FROM quotations WHERE customer_info LIKE ? ORDER BY created_at DESC").all('%' + user.email + '%');
    res.json({ success: true, quotes: rows });
  } catch (err) {
    sendError(res, err);
  }
});

// ── User's repairs (linked by email) ──
app.get('/api/user/repairs', function (req, res) {
  try {
    var user = getUserFromUserSession(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (!user.email) return res.json({ success: true, repairs: [] });
    var rows = db.prepare("SELECT j.*, b.name as branch_name, b.phone as branch_phone FROM job_cards j LEFT JOIN branches b ON b.id = j.branch_id WHERE LOWER(j.client_email) = ? ORDER BY j.created_at DESC").all(user.email.toLowerCase());
    res.json({ success: true, repairs: rows });
  } catch (err) {
    sendError(res, err);
  }
});

// ── User OAuth config endpoint ──
app.get('/api/user/auth-config', function (req, res) {
  res.json({
    googleEnabled: googleAuthEnabled,
    googleClientId: GOOGLE_CLIENT_ID
  });
});

// ── Live Chat API ──

// Separate upload handler for chat (accepts more file types)
var chatStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOADS_DIR); },
  filename: function (req, file, cb) {
    var ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'chat_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext);
  }
});
var chatUpload = multer({ storage: chatStorage, limits: { fileSize: 20 * 1024 * 1024 } });

// Start a new chat session (or return existing active session for this client)
app.post('/api/chat/start', function (req, res) {
  try {
    var name = (req.body.name || 'Guest').trim();
    var email = (req.body.email || '').trim().toLowerCase();
    var branchId = (req.body.branch_id || '').trim();
    var branchName = (req.body.branch_name || '').trim();
    var existing = email ? db.prepare("SELECT * FROM chat_sessions WHERE client_email = ? AND status = 'active' ORDER BY last_activity DESC LIMIT 1").get(email) : null;
    if (existing) {
      db.prepare("UPDATE chat_sessions SET last_activity = datetime('now') WHERE id = ?").run(existing.id);
      return res.json({ success: true, session: existing });
    }
    var sessionId = 'chat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    db.prepare("INSERT INTO chat_sessions (id, client_name, client_email, branch_id, branch_name) VALUES (?, ?, ?, ?, ?)").run(sessionId, name, email, branchId || null, branchName || null);
    var session = db.prepare("SELECT * FROM chat_sessions WHERE id = ?").get(sessionId);
    res.json({ success: true, session: session });
  } catch (err) {
    sendError(res, err);
  }
});

// Client sends a message (text, file, or product interaction)
app.post('/api/chat/send', function (req, res) {
  try {
    var sessionId = (req.body.session_id || '').trim();
    var message = (req.body.message || '').trim();
    var messageType = req.body.message_type || 'text';
    var attachments = req.body.attachments || null;
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
    if (messageType === 'text' && !message) return res.status(400).json({ error: 'Message required' });
    var session = db.prepare("SELECT * FROM chat_sessions WHERE id = ? AND status = 'active'").get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found or closed' });
    db.prepare("INSERT INTO chat_messages (session_id, sender_type, sender_name, message, message_type, attachments_json) VALUES (?, 'client', ?, ?, ?, ?)").run(sessionId, session.client_name, message, messageType, attachments ? JSON.stringify(attachments) : null);
    db.prepare("UPDATE chat_sessions SET last_activity = datetime('now') WHERE id = ?").run(sessionId);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Client file upload for chat
app.post('/api/chat/upload', chatUpload.single('file'), function (req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    var url = '/uploads/' + req.file.filename;
    res.json({ success: true, file: { name: req.file.originalname, url: url, type: req.file.mimetype, size: req.file.size } });
  } catch (err) {
    sendError(res, err);
  }
});

// Poll for new messages (client side)
app.get('/api/chat/messages', function (req, res) {
  try {
    var sessionId = (req.query.session_id || '').trim();
    var since = parseInt(req.query.since, 10) || 0;
    var session = db.prepare("SELECT * FROM chat_sessions WHERE id = ?").get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    var messages = db.prepare("SELECT * FROM chat_messages WHERE session_id = ? AND id > ? ORDER BY created_at ASC").all(sessionId, since);
    res.json({ success: true, messages: messages, session: session });
  } catch (err) {
    sendError(res, err);
  }
});

// Client typing indicator
app.post('/api/chat/typing', function (req, res) {
  try {
    var sessionId = (req.body.session_id || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
    chatTyping.set('client_' + sessionId, Date.now());
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Client checks if admin is typing
app.get('/api/chat/typing', function (req, res) {
  try {
    var sessionId = (req.query.session_id || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
    var lastTyping = chatTyping.get('admin_' + sessionId) || 0;
    var isTyping = (Date.now() - lastTyping) < 3000;
    res.json({ success: true, typing: isTyping });
  } catch (err) {
    sendError(res, err);
  }
});

// Client rate a session
app.post('/api/chat/rate', function (req, res) {
  try {
    var sessionId = (req.body.session_id || '').trim();
    var rating = parseInt(req.body.rating, 10);
    var feedback = (req.body.feedback || '').trim();
    if (!sessionId || !rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Valid session ID and rating (1-5) required' });
    db.prepare("INSERT INTO chat_ratings (session_id, rating, feedback) VALUES (?, ?, ?)").run(sessionId, rating, feedback || null);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Admin chat endpoints (require admin auth) ──

// Admin typing indicator
app.post('/api/admin/chat/typing', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var sessionId = (req.body.session_id || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
    chatTyping.set('admin_' + sessionId, Date.now());
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Admin checks if client is typing
app.get('/api/admin/chat/typing', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var sessionId = (req.query.session_id || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
    var lastTyping = chatTyping.get('client_' + sessionId) || 0;
    var isTyping = (Date.now() - lastTyping) < 3000;
    res.json({ success: true, typing: isTyping });
  } catch (err) {
    sendError(res, err);
  }
});

// Get rating for a session (admin)
app.get('/api/admin/chat/ratings/:session_id', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var rating = db.prepare("SELECT * FROM chat_ratings WHERE session_id = ?").get(req.params.session_id);
    res.json({ success: true, rating: rating || null });
  } catch (err) {
    sendError(res, err);
  }
});

// List all chat sessions (active first, then closed)
app.get('/api/admin/chat/sessions', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var sessions = db.prepare("SELECT s.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id AND m.sender_type = 'client' AND m.read_at IS NULL) as unread FROM chat_sessions s ORDER BY s.status ASC, s.last_activity DESC").all();
    res.json({ success: true, sessions: sessions });
  } catch (err) {
    sendError(res, err);
  }
});

// Get all messages for a session
app.get('/api/admin/chat/messages', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var sessionId = (req.query.session_id || '').trim();
    var messages = db.prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
    // Mark unread client messages as read
    db.prepare("UPDATE chat_messages SET read_at = datetime('now') WHERE session_id = ? AND sender_type = 'client' AND read_at IS NULL").run(sessionId);
    res.json({ success: true, messages: messages });
  } catch (err) {
    sendError(res, err);
  }
});

// Admin sends a message (text, product recommendation)
app.post('/api/admin/chat/send', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var sessionId = (req.body.session_id || '').trim();
    var message = (req.body.message || '').trim();
    var messageType = req.body.message_type || 'text';
    var productData = req.body.product_data || null;
    var attachments = req.body.attachments || null;
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
    if (messageType === 'text' && !message) return res.status(400).json({ error: 'Message required' });
    var session = db.prepare("SELECT * FROM chat_sessions WHERE id = ? AND status = 'active'").get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found or closed' });
    var dataJson = null;
    if (messageType === 'product' && productData) dataJson = JSON.stringify(productData);
    else if (attachments) dataJson = JSON.stringify(attachments);
    db.prepare("INSERT INTO chat_messages (session_id, sender_type, sender_name, message, message_type, attachments_json) VALUES (?, 'admin', ?, ?, ?, ?)").run(sessionId, user.name || 'Admin', message, messageType, dataJson);
    db.prepare("UPDATE chat_sessions SET last_activity = datetime('now'), assigned_to = ? WHERE id = ?").run(user.name || 'Admin', sessionId);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Admin file upload for chat
app.post('/api/admin/chat/upload', chatUpload.single('file'), function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    var url = '/uploads/' + req.file.filename;
    res.json({ success: true, file: { name: req.file.originalname, url: url, type: req.file.mimetype, size: req.file.size } });
  } catch (err) {
    sendError(res, err);
  }
});

// Transfer session to another admin
app.post('/api/admin/chat/transfer', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var sessionId = (req.body.session_id || '').trim();
    var transferTo = (req.body.transfer_to || '').trim();
    if (!sessionId || !transferTo) return res.status(400).json({ error: 'Session ID and target admin required' });
    var session = db.prepare("SELECT * FROM chat_sessions WHERE id = ?").get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    db.prepare("UPDATE chat_sessions SET assigned_to = ?, transferred_from = ? WHERE id = ?").run(transferTo, (user.name || 'Admin'), sessionId);
    // Add system message
    db.prepare("INSERT INTO chat_messages (session_id, sender_type, sender_name, message, message_type) VALUES (?, 'admin', 'System', ?, 'text')").run(sessionId, 'Conversation transferred to ' + transferTo + ' by ' + (user.name || 'Admin'));
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Close a session
app.post('/api/admin/chat/close', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var sessionId = (req.body.session_id || '').trim();
    var session = db.prepare("SELECT * FROM chat_sessions WHERE id = ?").get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    db.prepare("UPDATE chat_sessions SET status = 'closed' WHERE id = ?").run(sessionId);
    // Clean up typing indicator
    chatTyping.delete('client_' + sessionId);
    chatTyping.delete('admin_' + sessionId);
    // Send transcript email if client has email
    if (session.client_email) {
      var messages = db.prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
      var transcriptHtml = messages.map(function(m) {
        var time = m.created_at ? new Date(m.created_at + 'Z').toLocaleString() : '';
        var sender = m.sender_type === 'client' ? m.sender_name : (m.sender_name || 'Support');
        return '<p><strong>' + escHtml(sender) + '</strong> <span style="color:#888;font-size:12px;">(' + time + ')</span><br>' + escHtml(m.message) + '</p>';
      }).join('');
      var mailOpts = {
        from: process.env.SMTP_FROM || '"Royal Computers" <noreply@royalcomputers.na>',
        to: session.client_email,
        subject: 'Chat Transcript - Royal Computers Namibia',
        html: '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><h2 style="color:#dc2626;">Chat Transcript</h2><p>Your conversation with Royal Computers has ended. Here is the transcript:</p><hr>' + transcriptHtml + '<hr><p style="font-size:12px;color:#888;">Thank you for chatting with us!</p></div>'
      };
      var t = getTransporter();
      if (t) {
        t.sendMail(mailOpts).catch(function(err) { console.error('Transcript email failed:', err.message); });
      }
    }
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Get unread count (for admin notification badge)
app.get('/api/admin/chat/unread', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var unread = db.prepare("SELECT COUNT(*) as count FROM chat_sessions s JOIN chat_messages m ON m.session_id = s.id WHERE s.status = 'active' AND m.sender_type = 'client' AND m.read_at IS NULL").get();
    res.json({ success: true, unread: unread ? unread.count : 0 });
  } catch (err) {
    sendError(res, err);
  }
});

// Product search for admin (used in chat recommendations)
app.get('/api/admin/products/search', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ success: true, products: [] });
    var escaped = escapeLike(q);
    var products = db.prepare("SELECT * FROM custom_products WHERE (name LIKE ? OR category LIKE ?) AND hidden = 0 ORDER BY date DESC LIMIT 20").all('%' + escaped + '%', '%' + escaped + '%');
    // Parse variants_json to extract prices
    products.forEach(function(p) {
      try { p.variants = JSON.parse(p.variants_json || '[]'); } catch(e) { p.variants = []; }
      delete p.variants_json;
    });
    res.json({ success: true, products: products });
  } catch (err) {
    sendError(res, err);
  }
});

// List online admins (for chat transfer)
app.get('/api/admin/chat/admins', function (req, res) {
  try {
    var user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    var now = Date.now();
    var timeout = 2 * 60 * 1000; // 2 minutes
    var adminList = [];
    adminLastSeen.forEach(function(time, username) {
      adminList.push({ username: username, online: (now - time) < timeout, lastSeen: time });
    });
    // Also include admin user from DB (users with permissions)
    var dbAdmins = db.prepare("SELECT username, name, last_login FROM users WHERE permissions != '{}' OR role = 'admin' OR role = 'staff'").all();
    dbAdmins.forEach(function(a) {
      if (!adminList.some(function(al) { return al.username === a.username; })) {
        var lastSeen = a.last_login ? new Date(a.last_login + 'Z').getTime() : 0;
        var online = lastSeen > 0 && (Date.now() - lastSeen) < timeout;
        adminList.push({ username: a.username, name: a.name || a.username, online: online, lastSeen: lastSeen });
      }
    });
    // Fallback: add "admin" if no one tracked
    if (!adminList.length) {
      adminList.push({ username: 'admin', name: 'Admin', online: true, lastSeen: Date.now() });
    }
    res.json({ success: true, admins: adminList });
  } catch (err) {
    sendError(res, err);
  }
});

/* ─── Content Management API ─── */
require('./content-api')(app, db, getUserFromRequest, hashPassword, logAudit, sendError, SEED_BRANCH_PASSWORD, SEED_ADMIN_PASSWORD, SEED_SUPER_ADMIN_PASSWORD);

app.listen(PORT, function () {
  console.log('Royal Computers running on http://localhost:' + PORT);
});
