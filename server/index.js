var express = require('express');
var cors = require('cors');
var crypto = require('crypto');
var path = require('path');
var Database = require('better-sqlite3');
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

app.use(cors());
app.use(express.json({ limit: '100kb' }));

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

app.listen(PORT, function () {
  console.log('Royal Computers running on http://localhost:' + PORT);
});
