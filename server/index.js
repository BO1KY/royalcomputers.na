var express = require('express');
var cors = require('cors');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
require('dotenv').config();

var app = express();
var PORT = process.env.PORT || 3000;
var DATA_DIR = path.join(__dirname, 'data');
var ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use(function (req, res, next) {
  if (req.path === '/server/data' || req.path.startsWith('/server/data/') || req.path.startsWith('/server/.env')) {
    return res.status(403).send('Forbidden');
  }
  next();
});

app.use(express.static(path.join(__dirname, '..')));

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function readData(filename) {
  var filePath = path.join(DATA_DIR, filename);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return [];
  }
}

function writeData(filename, data) {
  var filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function authorize(password) {
  return password && ADMIN_HASH && sha256(password) === ADMIN_HASH;
}

app.post('/api/subscribe', function (req, res) {
  try {
    var email = (req.body.email || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    var list = readData('subscribers.json');
    if (list.indexOf(email) !== -1) {
      return res.status(409).json({ error: 'Already subscribed' });
    }

    list.push(email);
    writeData('subscribers.json', list);

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

    var list = readData('messages.json');
    list.push({ name: name, phone: phone, email: email, company: company, subject: subject, message: message, date: date });
    writeData('messages.json', list);

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

    var subscribers = readData('subscribers.json');
    var messages = readData('messages.json');
    var notified = readData('unsubscribed_notified.json');

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

    var list = readData('subscribers.json');
    var isSubscribed = list.indexOf(email) !== -1;

    res.json({ subscribed: isSubscribed });
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

    var list = readData('subscribers.json');
    var idx = list.indexOf(email);
    if (idx === -1) {
      return res.status(404).json({ error: 'Email not found in our subscribers list.' });
    }

    list.splice(idx, 1);
    writeData('subscribers.json', list);

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

    var list = readData('subscribers.json');
    var idx = list.indexOf(email);
    if (idx === -1) {
      return res.status(404).json({ error: 'Email not found' });
    }

    list.splice(idx, 1);
    writeData('subscribers.json', list);

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

    var list = readData('unsubscribed_notified.json');
    if (list.indexOf(email) === -1) {
      list.push(email);
      writeData('unsubscribed_notified.json', list);
    }

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
    if (type !== 'subscribers' && type !== 'messages') {
      return res.status(400).json({ error: 'Invalid type' });
    }

    writeData(type + '.json', []);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.listen(PORT, function () {
  console.log('Royal Computers running on http://localhost:' + PORT);
});
