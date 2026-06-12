(function () {
  'use strict';

  var sessionId = localStorage.getItem('chat_session_id') || '';
  var lastMsgId = 0;
  var pollTimer = null;
  var notifTimer = null;
  var notifPlaying = false;
  var userName = '';
  var userEmail = '';
  var selectedBranchId = '';
  var selectedBranchName = '';

  function escHtml(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatPrice(n) {
    return 'N$\u202f' + Number(n).toLocaleString('en-NA');
  }

  function playNotification() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }

  function playPersistentNotification() {
    if (notifPlaying) return;
    notifPlaying = true;
    var count = 0;
    function ring() {
      if (!notifPlaying) return;
      playNotification();
      count++;
      if (count < 10) { notifTimer = setTimeout(ring, 2000); }
      else { notifPlaying = false; }
    }
    ring();
  }

  function stopPersistentNotification() {
    notifPlaying = false;
    if (notifTimer) { clearTimeout(notifTimer); notifTimer = null; }
  }

  function getAuthHeaders() {
    var token = localStorage.getItem('user_token');
    if (token) return { 'Authorization': 'Bearer ' + token };
    return {};
  }

  function getBranches() {
    if (window.BRANCHES && window.BRANCHES.getAllBranches) {
      return window.BRANCHES.getAllBranches();
    }
    return [];
  }

  function buildBranchOptions() {
    var branches = getBranches();
    if (!branches.length) return '';
    var html = '<option value="">Select a branch...</option>';
    branches.forEach(function(b) {
      var name = b.name.replace('Royal Computers - ', '');
      html += '<option value="' + b.id + '">' + escHtml(name) + '</option>';
    });
    return html;
  }

  function buildWidget() {
    if (document.getElementById('rc-chat-widget')) return;

    var container = document.createElement('div');
    container.id = 'rc-chat-widget';

    // Chat button
    var btn = document.createElement('button');
    btn.className = 'chat-widget-btn';
    btn.id = 'chatWidgetBtn';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="chat-unread-badge" id="chatUnreadBadge">0</span>';
    btn.onclick = toggleChat;
    container.appendChild(btn);

    // Chat box
    var box = document.createElement('div');
    box.className = 'chat-widget-box';
    box.id = 'chatWidgetBox';

    var branchOptions = buildBranchOptions();
    box.innerHTML =
      '<div class="chat-header">' +
        '<div class="chat-header-info">' +
          '<div class="chat-header-avatar">RC</div>' +
          '<div class="chat-header-text">' +
            '<h3>Royal Computers</h3>' +
            '<p id="chatStatusText">We typically reply in minutes</p>' +
          '</div>' +
        '</div>' +
        '<button class="chat-header-close" id="chatHeaderClose">&times;</button>' +
      '</div>' +
      '<div class="chat-messages" id="chatMessages"></div>' +
      '<div class="chat-typing" id="chatTyping">Admin is typing...</div>' +
      '<div class="chat-input-area" id="chatInputArea" style="display:none;">' +
        '<button id="chatAttachBtn" class="chat-attach-btn" title="Attach file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>' +
        '<input type="file" id="chatFileInput" style="display:none" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv">' +
        '<input type="text" id="chatInput" placeholder="Type your message..." autocomplete="off">' +
        '<button id="chatSendBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>' +
      '</div>' +
      '<div class="chat-welcome" id="chatWelcome">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
        '<h3>Hi there!</h3>' +
        '<p>Got a question? We\'re here to help. Start a chat with us!</p>' +
      '</div>' +
      '<div class="chat-start-form" id="chatStartForm">' +
        '<input type="text" id="chatNameInput" placeholder="Your name" autocomplete="name">' +
        '<input type="email" id="chatEmailInput" placeholder="Your email (optional)" autocomplete="email">' +
        (branchOptions ? '<select id="chatBranchSelect" class="chat-branch-select">' + branchOptions + '</select>' : '') +
        '<button id="chatStartBtn">Start Chat</button>' +
      '</div>';

    container.appendChild(box);
    document.body.appendChild(container);

    // Event listeners
    document.getElementById('chatHeaderClose').onclick = function() {
      document.getElementById('chatWidgetBox').classList.remove('open');
      stopPersistentNotification();
    };
    document.getElementById('chatInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
    document.getElementById('chatSendBtn').onclick = sendChatMessage;
    document.getElementById('chatStartBtn').onclick = startChatSession;
    document.getElementById('chatAttachBtn').onclick = function() {
      document.getElementById('chatFileInput').click();
    };
    document.getElementById('chatFileInput').addEventListener('change', handleFileAttach);

    // Check for existing session
    if (sessionId) {
      document.getElementById('chatStartForm').style.display = 'none';
      document.getElementById('chatInputArea').style.display = 'flex';
      document.getElementById('chatWelcome').style.display = 'none';
      startPolling();
    }
  }

  window.toggleChat = function () {
    var box = document.getElementById('chatWidgetBox');
    var isOpen = box.classList.contains('open');
    if (isOpen) {
      box.classList.remove('open');
    } else {
      box.classList.add('open');
      stopPersistentNotification();
      var badge = document.getElementById('chatUnreadBadge');
      if (badge) badge.textContent = '0';
      var msgs = document.getElementById('chatMessages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
  };

  window.startChatSession = function () {
    var nameInput = document.getElementById('chatNameInput');
    var emailInput = document.getElementById('chatEmailInput');
    var branchSelect = document.getElementById('chatBranchSelect');
    var name = nameInput.value.trim() || 'Guest';
    var email = emailInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    userName = name;
    userEmail = email;
    if (branchSelect) {
      selectedBranchId = branchSelect.value;
      var selectedOpt = branchSelect.options[branchSelect.selectedIndex];
      selectedBranchName = selectedOpt ? selectedOpt.text : '';
    }

    var body = { name: name, branch_id: selectedBranchId, branch_name: selectedBranchName };
    if (email) body.email = email;

    var btn = document.getElementById('chatStartBtn');
    btn.disabled = true; btn.textContent = 'Connecting...';

    fetch('/api/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      btn.disabled = false; btn.textContent = 'Start Chat';
      if (d.success && d.session) {
        sessionId = d.session.id;
        localStorage.setItem('chat_session_id', sessionId);
        document.getElementById('chatStartForm').style.display = 'none';
        document.getElementById('chatInputArea').style.display = 'flex';
        document.getElementById('chatWelcome').style.display = 'none';
        lastMsgId = 0;
        var branchLabel = selectedBranchName ? ' (' + selectedBranchName + ')' : '';
        var msgs = document.getElementById('chatMessages');
        msgs.innerHTML = '<div class="chat-msg admin"><span class="chat-msg-sender">Royal Computers' + escHtml(branchLabel) + '</span>Hi ' + escHtml(name) + '! How can we help you today?<span class="chat-msg-time">just now</span></div>';
        startPolling();
      }
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Start Chat';
      alert('Could not start chat. Please try again.');
    });
  };

  var uploadingFiles = false;

  function handleFileAttach() {
    var input = document.getElementById('chatFileInput');
    var files = input.files;
    if (!files.length) return;
    if (!sessionId) { alert('Start the chat first.'); return; }

    uploadingFiles = true;
    var sendBtn = document.getElementById('chatSendBtn');
    sendBtn.disabled = true;

    var uploaded = [];
    var total = files.length;
    var done = 0;

    function uploadNext(i) {
      if (i >= total) {
        // All uploaded, send message with attachments
        var names = uploaded.map(function(f) { return f.name; }).join(', ');
        sendChatMessageWithAttachments(uploaded, names);
        input.value = '';
        uploadingFiles = false;
        sendBtn.disabled = false;
        return;
      }
      var fd = new FormData();
      fd.append('file', files[i]);
      fetch('/api/chat/upload', {
        method: 'POST',
        body: fd
      }).then(function(r) { return r.json(); }).then(function(d) {
        if (d.success && d.file) {
          uploaded.push(d.file);
        }
        done++;
        uploadNext(i + 1);
      }).catch(function() {
        done++;
        uploadNext(i + 1);
      });
    }
    uploadNext(0);
  }

  function sendChatMessageWithAttachments(attachments, fileNames) {
    var msgs = document.getElementById('chatMessages');
    var time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Build attachment HTML
    var attachHtml = '<div class="chat-attachments">';
    attachments.forEach(function(f) {
      var isImage = f.type && f.type.indexOf('image') === 0;
      if (isImage) {
        attachHtml += '<div class="chat-attachment-item"><img src="' + escHtml(f.url) + '" alt="' + escHtml(f.name) + '" class="chat-attach-img" onclick="window.open(\'' + escHtml(f.url) + '\',\'_blank\')"><span class="chat-attach-name">' + escHtml(f.name) + '</span></div>';
      } else {
        attachHtml += '<div class="chat-attachment-item"><a href="' + escHtml(f.url) + '" target="_blank" class="chat-attach-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> ' + escHtml(f.name) + '</a></div>';
      }
    });
    attachHtml += '</div>';

    msgs.innerHTML += '<div class="chat-msg client">' + escHtml(fileNames) + attachHtml + '<span class="chat-msg-time">' + time + '</span></div>';
    msgs.scrollTop = msgs.scrollHeight;

    fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message: fileNames, message_type: 'file', attachments: attachments })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.success) console.error('Chat send failed');
    }).catch(function () {});
  }

  window.sendChatMessage = function () {
    var input = document.getElementById('chatInput');
    var msg = input.value.trim();
    if (!msg || !sessionId || uploadingFiles) return;

    input.value = '';
    var sendBtn = document.getElementById('chatSendBtn');
    sendBtn.disabled = true;

    var msgs = document.getElementById('chatMessages');
    var time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    msgs.innerHTML += '<div class="chat-msg client">' + escHtml(msg) + '<span class="chat-msg-time">' + time + '</span></div>';
    msgs.scrollTop = msgs.scrollHeight;

    fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message: msg })
    }).then(function (r) { return r.json(); }).then(function (d) {
      sendBtn.disabled = false;
      if (!d.success) console.error('Chat send failed');
    }).catch(function () {
      sendBtn.disabled = false;
    });
  };

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollMessages, 3000);
  }

  function renderMessage(m) {
    var time = m.created_at ? new Date(m.created_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    var msgClass = m.sender_type === 'admin' ? 'admin' : 'client';
    var senderHtml = m.sender_type === 'admin' ? '<span class="chat-msg-sender">' + escHtml(m.sender_name || 'Royal Computers') + '</span>' : '';
    var content = escHtml(m.message);
    var extraHtml = '';

    // Parse attachments
    var attachments = null;
    try { if (m.attachments_json) attachments = JSON.parse(m.attachments_json); } catch(e) {}

    if (m.message_type === 'product' && attachments) {
      // Product recommendation
      var p = attachments;
      var variantLabel = p.variant_label ? ' - ' + p.variant_label : '';
      var price = p.price ? formatPrice(p.price) : '';
      extraHtml = '<div class="chat-product-card" onclick="window.open(\'products.html?highlight=' + encodeURIComponent(p.id) + '\',\'_blank\')">' +
        (p.image ? '<img src="' + escHtml(p.image) + '" alt="' + escHtml(p.name) + '" class="chat-product-img">' : '') +
        '<div class="chat-product-info">' +
          '<div class="chat-product-name">' + escHtml(p.name) + '</div>' +
          (price ? '<div class="chat-product-price">' + price + '</div>' : '') +
          '<div class="chat-product-view">View Details &rarr;</div>' +
        '</div>' +
      '</div>';
    } else if (attachments && Array.isArray(attachments)) {
      extraHtml = '<div class="chat-attachments">';
      attachments.forEach(function(f) {
        if (f.type && f.type.indexOf('image') === 0) {
          extraHtml += '<div class="chat-attachment-item"><img src="' + escHtml(f.url) + '" alt="' + escHtml(f.name) + '" class="chat-attach-img" onclick="window.open(\'' + escHtml(f.url) + '\',\'_blank\')"><span class="chat-attach-name">' + escHtml(f.name) + '</span></div>';
        } else {
          extraHtml += '<div class="chat-attachment-item"><a href="' + escHtml(f.url) + '" target="_blank" class="chat-attach-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> ' + escHtml(f.name) + '</a></div>';
        }
      });
      extraHtml += '</div>';
    }

    return '<div class="chat-msg ' + msgClass + '" data-msg-id="' + m.id + '">' + senderHtml + content + extraHtml + '<span class="chat-msg-time">' + time + '</span></div>';
  }

  function pollMessages() {
    if (!sessionId) return;
    fetch('/api/chat/messages?session_id=' + encodeURIComponent(sessionId) + '&since=' + lastMsgId, {
      headers: getAuthHeaders()
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.success) return;
      if (d.messages && d.messages.length) {
        var msgs = document.getElementById('chatMessages');
        var hadNewAdmin = false;
        d.messages.forEach(function (m) {
          if (m.id > lastMsgId) lastMsgId = m.id;
          if (msgs.querySelector('[data-msg-id="' + m.id + '"]')) return;
          msgs.innerHTML += renderMessage(m);
          if (m.sender_type === 'admin') hadNewAdmin = true;
        });
        if (hadNewAdmin) {
          msgs.scrollTop = msgs.scrollHeight;
          var box = document.getElementById('chatWidgetBox');
          if (box && !box.classList.contains('open')) {
            playPersistentNotification();
            var badge = document.getElementById('chatUnreadBadge');
            if (badge) {
              var cur = parseInt(badge.textContent, 10) || 0;
              badge.textContent = cur + 1;
              badge.style.display = 'inline';
            }
          } else {
            playNotification();
          }
        }
      }
      if (d.session) {
        var statusEl = document.getElementById('chatStatusText');
        if (statusEl) {
          if (d.session.status === 'closed') statusEl.textContent = 'Chat ended';
          else statusEl.textContent = 'Online';
        }
        // Show branch in header
        if (d.session.branch_name) {
          var headerEl = document.querySelector('.chat-header-text h3');
          if (headerEl) headerEl.textContent = 'Royal Computers - ' + d.session.branch_name;
        }
      }
    }).catch(function () {});
  }

  // Load on DOM ready
  function init() {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/chat-widget.css';
    document.head.appendChild(link);
    buildWidget();
  }

  // Clean up timers on page unload
  window.addEventListener('beforeunload', function () {
    if (pollTimer) clearInterval(pollTimer);
    if (notifTimer) clearTimeout(notifTimer);
    notifPlaying = false;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
