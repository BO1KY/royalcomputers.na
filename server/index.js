var express = require('express');
var cors = require('cors');
var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
var Database = require('better-sqlite3');
var nodemailer = require('nodemailer');
var multer = require('multer');
require('dotenv').config();

var app = express();
var PORT = process.env.PORT || 3000;
var ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH;
var DB_PATH = path.join(__dirname, 'data.db');

var db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec("CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, created_at TEXT DEFAULT (datetime('now')))");
db.exec("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, email TEXT, company TEXT, subject TEXT, message TEXT, date TEXT)");
db.exec("CREATE TABLE IF NOT EXISTS unsubscribed_notified (email TEXT PRIMARY KEY, notified_at TEXT DEFAULT (datetime('now')))");

var UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

var storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOADS_DIR); },
  filename: function (req, file, cb) {
    var ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
var upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

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

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(function (req, res, next) {
  if (req.path === '/server/data' || req.path.startsWith('/server/data/') || req.path.startsWith('/server/.env')) {
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

function authorize(password) {
  return password && ADMIN_HASH && sha256(password) === ADMIN_HASH;
}

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

    db.prepare("INSERT INTO messages (name, phone, email, company, subject, message, date) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(name, phone, email, company, subject, message, date);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.post('/api/get-data', function (req, res) {
  try {
    if (!authorize(req.body.password)) {
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
    if (!authorize(req.body.password)) {
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
    if (!authorize(req.body.password)) {
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
    if (!authorize(req.body.password)) {
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
    if (!req.body || !authorize(req.body.password)) {
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
    if (!authorize(req.body.password)) {
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
      '<img src="' + baseUrl + '/ROYAL PICS/royal logo.webp" alt="Royal Computers" style="width:50px;height:auto;border-radius:4px;" onerror="this.style.display=\'none\'">' +
      '</td>' +
      '<td style="vertical-align:top;font-size:12px;color:#555;line-height:1.5;">' +
      '<strong style="color:#1a1a2e;font-size:13px;">Royal Computers Namibia</strong><br>' +
      'Shop 7, Schumann Building, Independence Ave<br>' +
      'Windhoek, Namibia<br>' +
      'Tel: +264 61 222 482 | Email: info@royalcomputers.na<br>' +
      '</td></tr></table>' +
      '</td></tr>' +
      '<tr><td style="background:#1a1a2e;padding:16px;text-align:center;">' +
      '<p style="color:#fff;font-size:12px;margin:0;">&copy; ' + new Date().getFullYear() + ' Royal Computers Namibia</p>' +
      '<p style="color:#aaa;font-size:11px;margin:4px 0 0;">You received this because you subscribed. <a href="' + baseUrl + '/unsubscribe" style="color:#e5383b;">Unsubscribe</a></p>' +
      '</td></tr></table></td></tr></table></body></html>';

    var adminEmail = process.env.SMTP_USER || '';
    var sent = 0;
    var errors = [];

    subscribers.forEach(function (email) {
      var mailOptions = {
        from: '"Royal Computers Namibia" <' + process.env.SMTP_USER + '>',
        to: email,
        subject: subject,
        html: fullHtml,
        cc: adminEmail || undefined
      };
      t.sendMail(mailOptions, function (err) {
        if (err) errors.push(email + ': ' + err.message);
        else sent++;
      });
    });

    res.json({ success: true, sent: sent, total: subscribers.length, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.listen(PORT, function () {
  console.log('Royal Computers running on http://localhost:' + PORT);
});
