/* ─── Job Cards Admin Module ─── */
/* Depends on: adminJobCards, adminBranches, _currentUser, esc(), apiFetch(), authGet(), addToken(), getSessionToken(), API_BASE */

var SERVICE_TYPES = [
  { value: '', label: '-- Select Service Type --', category: '' },
  { value: 'diagnostic', label: 'Diagnostic / Assessment', category: 'software' },
  // Hardware services
  { value: 'screen-replacement-laptop', label: 'Screen Replacement (Laptop)', category: 'hardware' },
  { value: 'screen-replacement-phone', label: 'Screen Replacement (Cellphone)', category: 'hardware' },
  { value: 'charging-port-repair', label: 'Charging Port Repair', category: 'hardware' },
  { value: 'keyboard-replacement', label: 'Keyboard Replacement', category: 'hardware' },
  { value: 'battery-replacement', label: 'Battery Replacement', category: 'hardware' },
  { value: 'ram-upgrade', label: 'RAM / Storage Upgrade (Hardware)', category: 'hardware' },
  { value: 'hardware-upgrade', label: 'Other Hardware Upgrade / Installation', category: 'hardware' },
  { value: 'power-repair', label: 'Power Supply / Adapter Repair', category: 'hardware' },
  { value: 'liquid-damage', label: 'Liquid Damage Repair', category: 'hardware' },
  { value: 'fan-repair', label: 'Fan / Cooling System Repair', category: 'hardware' },
  { value: 'general-repair', label: 'General PC / Laptop Repair & Maintenance', category: 'hardware' },
  { value: 'printer-repair', label: 'Printer Setup / Repair', category: 'hardware' },
  // Software services
  { value: 'virus-removal', label: 'Virus / Malware Removal', category: 'software' },
  { value: 'software-install', label: 'Software Installation / Upgrade', category: 'software' },
  { value: 'data-recovery', label: 'Data Recovery / Backup', category: 'software' },
  { value: 'os-repair', label: 'Operating System Repair', category: 'software' },
  { value: 'networking-setup', label: 'Networking Setup / Configuration', category: 'software' },
  { value: '__custom__', label: 'Other (Custom Service)...', category: 'hardware' }
];

var STATUS_FLOW = {
  hardware: ['diagnostic', 'in-progress', 'waiting-parts', 'ready', 'completed', 'collected'],
  software: ['diagnostic', 'in-progress', 'ready', 'completed', 'collected']
};

function getStatusesForServiceType(serviceType) {
  var info = SERVICE_TYPES.find(function(s) { return s.value === serviceType; });
  var cat = (info && info.category) || 'hardware';
  return STATUS_FLOW[cat] || STATUS_FLOW.hardware;
}

function getServiceTypeLabel(value) {
  var info = SERVICE_TYPES.find(function(s) { return s.value === value; });
  return info ? info.label : value;
}

function showJobCardForm(id) {
  var jc = id ? adminJobCards.find(function(j) { return j.id === id; }) : null;
  var branchUserBranchId = (_currentUser && _currentUser.branch_id) || null;
  var selectedServiceType = jc ? jc.service_type : '';

  var branchRow = '';
  if (!branchUserBranchId && !jc) {
    var opts = '<option value="">Select Branch...</option>';
    (adminBranches || []).forEach(function(b) {
      opts += '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>';
    });
    branchRow = jcLabel('Branch *', 'jcfBranch', '1/-1',
      '<select id="jcfBranch" ' + jcStyle() + '>' + opts + '</select>');
  }

  var techName = jc ? jc.technician_name : (_currentUser && _currentUser.name ? _currentUser.name : '');

  // Build service type dropdown
  var customServiceType = '';
  var stOpts = SERVICE_TYPES.map(function(s) {
    return '<option value="' + s.value + '"' + (s.value === selectedServiceType ? ' selected' : '') + '>' + esc(s.label) + '</option>';
  }).join('');
  // If editing with a custom service type not in predefined list, add it as an option
  var predefined = SERVICE_TYPES.some(function(s) { return s.value === selectedServiceType; });
  if (!predefined && selectedServiceType) {
    customServiceType = selectedServiceType;
    stOpts += '<option value="__custom__" selected>Other (Custom Service)...</option>';
  }

  var html = [
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
    branchRow,
    jcLabel('Client Name *', 'jcfClientName', null, jcInput('jcfClientName', jc ? jc.client_name : '')),
    jcLabel('Company / Attention', 'jcfCompany', null, jcInput('jcfCompany', jc ? jc.client_company : '', 'Company name if applicable')),
    jcLabel('Phone', 'jcfPhone', null, jcInput('jcfPhone', jc ? jc.client_phone : '')),
    jcLabel('Email', 'jcfEmail', null, jcInput('jcfEmail', jc ? jc.client_email : '')),
    jcLabel('Address', 'jcfAddress', '1/-1', jcInput('jcfAddress', jc ? jc.client_address : '')),
    jcLabel('Service Type *', 'jcfServiceType', '1/-1',
      '<select id="jcfServiceType" ' + jcStyle() + ' onchange="onServiceTypeChange()">' + stOpts + '</select>' +
      '<input id="jcfCustomServiceType" placeholder="Enter custom service type..."' +
        (customServiceType ? ' value="' + esc(customServiceType) + '"' : '') +
        ' style="display:' + (customServiceType ? 'block' : 'none') + ';margin-top:4px;">'),
    jcLabel('Device Type', 'jcfDevType', null, jcInput('jcfDevType', jc ? jc.device_type : '', 'e.g. Laptop, Cellphone, Printer, Monitor')),
    jcLabel('Brand', 'jcfDevBrand', null, jcInput('jcfDevBrand', jc ? jc.device_brand : '', 'Dell, HP, Canon, Samsung...')),
    jcLabel('Model', 'jcfDevModel', null, jcInput('jcfDevModel', jc ? jc.device_model : '')),
    jcLabel('Serial Number', 'jcfDevSerial', null, jcInput('jcfDevSerial', jc ? jc.device_serial : '')),
    jcLabel('Device Condition', 'jcfDevCondition', null, jcInput('jcfDevCondition', jc ? jc.device_condition : '', 'Good, Cracked screen, No power...')),
    jcLabel('Sales Rep Code', 'jcfSalesRep', null, jcInput('jcfSalesRep', jc ? jc.sales_rep : '', 'e.g. SR001')),
    jcLabel('Technician Name', 'jcfTechName', null, jcInput('jcfTechName', techName, 'Assigned technician')),
    jcLabel('Accessories Received', 'jcfAccessories', '1/-1', jcInput('jcfAccessories', jc ? jc.accessories : '', 'Charger, Bag, Mouse, Power brick...')),
    jcLabel('Description of Problem(s) *', 'jcfIssue', '1/-1', jcTextarea('jcfIssue', jc ? jc.issue_description : '', 70)),
    jcLabel('Work Done (For Official Use)', 'jcfWorkDone', '1/-1', jcTextarea('jcfWorkDone', jc ? jc.work_done : '', 55)),
    jcLabel('Parts Used', 'jcfParts', '1/-1', jcTextarea('jcfParts', jc ? jc.parts_used : '', 45)),
    jcLabel('Technician Remarks', 'jcfNotes', '1/-1', jcTextarea('jcfNotes', jc ? jc.technician_notes : '', 45)),
    jcLabel('Status', 'jcfStatus', null, jcStatusSelect(jc ? jc.status : 'diagnostic', selectedServiceType)),
    jcLabel('Invoice No', 'jcfInvoiceNo', null, jcInput('jcfInvoiceNo', jc ? jc.invoice_no : '')),
    jcLabel('Diagnostic Fee (N$)', 'jcfDiagFee', null, jcNumber('jcfDiagFee', jc ? jc.diag_fee : 0)),
    jcLabel('Repair Cost (N$)', 'jcfTotalCost', null, jcNumber('jcfTotalCost', jc ? jc.total_cost : 0)),
    '<div style="grid-column:1/-1;"><div style="background:#f3f4f6;border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;font-size:14px;font-weight:700;"><span>Grand Total:</span><span id="jcfGrandTotal">N$ ' + ((jc ? (jc.diag_fee||0) + (jc.total_cost||0) : 0)).toFixed(2) + '</span></div></div>' +
    jcLabel('Amount Paid (N$)', 'jcfAmountPaid', null, jcNumber('jcfAmountPaid', jc ? jc.amount_paid : 0)),
    '</div>',
    '<div style="display:flex;gap:8px;margin-top:16px;">',
    '<button id="saveJcBtn" style="padding:10px 24px;background:var(--red);color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-family:inherit;">' + (jc ? 'Update Job Card' : 'Create Job Card') + '</button>',
    '<button onclick="closeFormModal()" style="padding:10px 24px;background:var(--dark-3,#f3f4f6);color:var(--text,#111);border:1px solid var(--border,#ddd);border-radius:6px;font-weight:500;cursor:pointer;font-family:inherit;">Cancel</button>',
    '</div>'
  ].join('');

  openFormModal(jc ? 'Edit Job Card: ' + esc(jc.id) : 'New Job Card', html);

  // Auto-fill device type from service type
  setTimeout(onServiceTypeChange, 50);

  // Auto-calculate grand total
  function updateGrandTotal() {
    var diag = parseFloat(document.getElementById('jcfDiagFee')?.value) || 0;
    var repair = parseFloat(document.getElementById('jcfTotalCost')?.value) || 0;
    var gt = document.getElementById('jcfGrandTotal');
    if (gt) gt.textContent = 'N$ ' + (diag + repair).toFixed(2);
  }
  var diagInput = document.getElementById('jcfDiagFee');
  var repairInput = document.getElementById('jcfTotalCost');
  if (diagInput) diagInput.addEventListener('input', updateGrandTotal);
  if (repairInput) repairInput.addEventListener('input', updateGrandTotal);

  document.getElementById('saveJcBtn').addEventListener('click', function() {
    var data = {
      client_name: val('jcfClientName'),
      client_company: val('jcfCompany') || null,
      client_phone: val('jcfPhone') || null,
      client_email: val('jcfEmail') || null,
      client_address: val('jcfAddress') || null,
      service_type: (function() {
        var st = val('jcfServiceType');
        if (st === '__custom__') return val('jcfCustomServiceType') || null;
        return st || null;
      })(),
      device_type: val('jcfDevType') || null,
      device_brand: val('jcfDevBrand') || null,
      device_model: val('jcfDevModel') || null,
      device_serial: val('jcfDevSerial') || null,
      device_condition: val('jcfDevCondition') || null,
      accessories: val('jcfAccessories') || null,
      sales_rep: val('jcfSalesRep') || null,
      technician_name: val('jcfTechName') || null,
      issue_description: val('jcfIssue') || null,
      work_done: val('jcfWorkDone') || null,
      parts_used: val('jcfParts') || null,
      technician_notes: val('jcfNotes') || null,
      status: val('jcfStatus'),
      invoice_no: val('jcfInvoiceNo') || null,
      diag_fee: parseFloat(val('jcfDiagFee')) || 0,
      total_cost: parseFloat(val('jcfTotalCost')) || 0,
      amount_paid: parseFloat(val('jcfAmountPaid')) || 0
    };
    if (!data.client_name) { alert('Client name is required.'); return; }
    if (!data.service_type) {
      if (val('jcfServiceType') === '__custom__') { alert('Please enter a custom service type.'); return; }
      alert('Please select a service type.'); return;
    }

    if (jc) {
      if (data.status === 'collected') {
        apiFetch(API_BASE + '/api/admin/job-cards/' + encodeURIComponent(jc.id), addToken(data), 'PUT')
          .then(function() { closeFormModal(); showCollectionForm(jc); })
          .catch(function(err) { alert('Error saving: ' + err.message); });
        return;
      }
      apiFetch(API_BASE + '/api/admin/job-cards/' + encodeURIComponent(jc.id), addToken(data), 'PUT')
        .then(function() { closeFormModal(); loadAdminJobCards(); })
        .catch(function(err) { alert('Error saving: ' + err.message); });
    } else {
      var branchEl = document.getElementById('jcfBranch');
      data.branch_id = branchEl ? branchEl.value : (branchUserBranchId || null);
      if (!data.branch_id) { alert('Please select a branch.'); return; }
      apiFetch(API_BASE + '/api/admin/job-cards', addToken(data), 'POST')
        .then(function(resp) {
          closeFormModal();
          loadAdminJobCards();
          if (resp && resp.id) {
            var token = resp.public_token || '';
            var trackUrl = token
              ? window.location.origin + '/tracking.html?token=' + encodeURIComponent(token)
              : window.location.origin + '/tracking.html?job=' + encodeURIComponent(resp.id) + '&branch=' + encodeURIComponent(data.branch_id);
            var pdfUrl = API_BASE + '/api/admin/job-cards/' + encodeURIComponent(resp.id) + '/pdf?token=' + encodeURIComponent(getSessionToken());
            var emailLink = data.client_email ? 'mailto:' + encodeURIComponent(data.client_email) + '?subject=Repair%20Status%20-%20' + encodeURIComponent(resp.id) + '&body=Your%20job%20card%20' + encodeURIComponent(resp.id) + '%20tracking%20link%3A%20' + encodeURIComponent(trackUrl) : '';
            var notify = document.getElementById('jobCardCreatedNotify');
            if (notify) {
              notify.style.display = 'block';
              notify.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
                  '<div>' +
                    '<strong style="font-size:16px;">' + '\u2713' + ' Job Card Created</strong>' +
                    '<div style="margin-top:4px;font-size:13px;opacity:0.9;">Job Number: <code style="background:rgba(255,255,255,0.15);padding:2px 8px;border-radius:4px;font-size:14px;">' + esc(resp.id) + '</code></div>' +
                    '<div style="margin-top:6px;font-size:13px;opacity:0.9;">' +
                      'Tracking: <a href="' + trackUrl + '" target="_blank" style="color:#fff;font-weight:600;text-decoration:underline;">' + trackUrl + '</a>' +
                    '</div>' +
                  '</div>' +
                  '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                    '<a href="' + pdfUrl + '" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:8px 16px;background:#fff;color:#065f46;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">' + '\u{1F4C4}' + ' Download PDF</a>' +
                    (emailLink ? '<a href="' + emailLink + '" style="display:inline-flex;align-items:center;gap:4px;padding:8px 16px;background:#1d4ed8;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">' + '\u2709' + ' Email PDF</a>' : '') +
                    '<button onclick="navigator.clipboard.writeText(\'' + trackUrl.replace(/'/g,"\\'") + '\');this.textContent=\'' + '\u2713' + ' Copied!\';setTimeout(function(){this.textContent=\'' + '\u{1F4CB}' + ' Copy Link\'}.bind(this),2000)" style="padding:8px 16px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">' + '\u{1F4CB}' + ' Copy Link</button>' +
                    '<button onclick="document.getElementById(\'jobCardCreatedNotify\').style.display=\'none\'" style="padding:8px 12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">' + '\u2716' + '</button>' +
                  '</div>' +
                '</div>';
              notify.scrollIntoView({ behavior: 'smooth', block: 'center' });
              try { navigator.clipboard.writeText(trackUrl); } catch(e) {}
            }
          }
        })
        .catch(function(err) { alert('Error creating job card: ' + err.message); });
    }
  });
}

function onServiceTypeChange() {
  var sel = document.getElementById('jcfServiceType');
  if (!sel) return;
  var val = sel.value;
  var info = SERVICE_TYPES.find(function(s) { return s.value === val; });
  var label = info ? info.label : '';

  // Show/hide custom service type input
  var customInput = document.getElementById('jcfCustomServiceType');
  if (customInput) {
    customInput.style.display = val === '__custom__' ? 'block' : 'none';
  }

  // Derive device type from service type (e.g. 'laptop', 'cellphone', etc.)
  var devType = document.getElementById('jcfDevType');
  if (devType) {
    if (!devType.value || !devType.getAttribute('data-manual')) {
      var parts = val.split('-');
      var derived = '';
      if (val === '__custom__') {
        derived = '';
      } else {
        derived = parts.length > 1 && ['laptop','phone','cellphone','printer'].indexOf(parts[0]) !== -1
          ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
          : '';
        if (derived === 'Phone') derived = 'Cellphone';
        if (val.indexOf('laptop') !== -1 || val.indexOf('keyboard') !== -1 || val.indexOf('fan') !== -1) derived = 'Laptop';
        if (val.indexOf('phone') !== -1) derived = 'Cellphone';
        if (val.indexOf('printer') !== -1) derived = 'Printer';
        if (val.indexOf('networking') !== -1) derived = 'Networking';
      }
      devType.value = derived;
    }
  }

  // Update status options based on service type category
  var statusSel = document.getElementById('jcfStatus');
  if (statusSel) {
    var statuses = getStatusesForServiceType(val === '__custom__' ? 'general-repair' : val);
    statusSel.innerHTML = statuses.map(function(s) {
      return '<option value="' + s + '">' + statusLabel(s) + '</option>';
    }).join('');
  }
}

function viewJobCard(id) {
  var content = document.getElementById('jobCardViewContent');
  content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">Loading job card...</div>';
  document.getElementById('jobCardViewModal').style.display = 'flex';

  authGet(API_BASE + '/api/admin/job-cards/' + encodeURIComponent(id)).then(function(data) {
    if (!data || !data.jobCard) {
      content.innerHTML = '<div style="text-align:center;padding:40px;color:#d32f2f;">Job card not found.</div>';
      return;
    }
    var j = data.jobCard;
    var sc = statusColor(j.status);
    var grandTotal = (j.diag_fee || 0) + (j.total_cost || 0);
    var balance = grandTotal - (j.amount_paid || 0);
    var trackUrl = window.location.origin + '/tracking.html?token=' + (j.public_token || '');

    var stLabel = getServiceTypeLabel(j.service_type);
    var stInfo = SERVICE_TYPES.find(function(s) { return s.value === j.service_type; });
    var stCategory = stInfo ? stInfo.category : '';

    var histHtml = '';
    if (j.history && j.history.length) {
      var statusIcons = { 'diagnostic': '\uD83D\uDD0D', 'in-progress': '\uD83D\uDD27', 'in_progress': '\uD83D\uDD27', 'completed': '\u2705', 'collected': '\uD83D\uDCE6', 'pending': '\u23F3', 'ready': '\uD83C\uDFAF' };
      histHtml = j.history.map(function(h) {
        return '<div style="display:flex;align-items:flex-start;gap:14px;padding:12px 0;border-bottom:1px solid var(--border);font-size:13px;">' +
          '<span style="font-size:18px;line-height:1.4;">' + (statusIcons[h.status] || '\uD83D\uDCCB') + '</span>' +
          '<div style="flex:1;">' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:baseline;">' +
              '<span style="font-weight:700;color:var(--text);">' + esc(statusLabel(h.status)) + '</span>' +
              '<span style="color:var(--text-dim);font-size:11px;">' + esc((h.created_at || '').substring(0, 16)) + '</span>' +
              '<span style="color:var(--text-dim);font-size:11px;">by ' + esc(h.changed_by || 'system') + '</span>' +
            '</div>' +
            (h.note ? '<div style="margin-top:4px;color:var(--text-dim);line-height:1.4;">' + esc(h.note) + '</div>' : '') +
          '</div>' +
          '</div>';
      }).join('');
    } else {
      histHtml = '<div style="color:var(--text-dim);padding:8px 0;font-size:13px;">No status history yet.</div>';
    }

    // Collection section
    var collectionHtml = '';
    if (j.status === 'collected') {
      var hasCode = j.collection_code;
      var hasCollector = j.collector_name;
      collectionHtml =
        '<div style="background:#f0fdf4;border-radius:8px;padding:16px;margin-top:14px;border:1px solid #bbf7d0;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
            '<span style="font-size:16px;">' + '\u2705' + '</span>' +
            '<h4 style="margin:0;font-size:14px;color:#16a34a;">Collection Details</h4>' +
          '</div>' +
          (hasCode ? '<div style="font-size:13px;margin-bottom:4px;"><strong>Collection Code:</strong> <code style="background:#f0fdf4;padding:2px 8px;border-radius:4px;font-size:14px;font-weight:700;color:#dc2626;">' + esc(j.collection_code) + '</code></div>' : '') +
          (hasCollector ? '<div style="font-size:13px;"><strong>Collected By:</strong> ' + esc(j.collector_name) + '</div>' : '') +
          (j.collection_proof_path ? '<div style="font-size:13px;margin-top:4px;"><strong>ID Proof:</strong> <a href="#" onclick="viewProof(\'' + esc(j.collection_proof_path.replace(/\\/g, '/')) + '\');return false;" style="color:#2563eb;">View Document</a></div>' : '') +
          (j.collection_signature_path ? '<div style="font-size:13px;margin-top:4px;"><strong>Signed Job Card:</strong> <a href="#" onclick="viewProof(\'' + esc(j.collection_signature_path.replace(/\\/g, '/')) + '\');return false;" style="color:#2563eb;">View Document</a></div>' : '') +
        '</div>';
    }

    content.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">' +
        '<h3 style="margin:0;font-size:18px;">Job Card: <code style="color:var(--red);">' + esc(j.id) + '</code></h3>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<a href="' + API_BASE + '/api/admin/job-cards/' + encodeURIComponent(j.id) + '/pdf?token=' + encodeURIComponent(getSessionToken()) + '" target="_blank" style="padding:6px 14px;background:#374151;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;">\uD83D\uDDA8 Download PDF</a>' +
          '<a href="' + trackUrl + '" target="_blank" style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;">\uD83D\uDD17 Tracking Link</a>' +
          '<button onclick="closeJobCardViewModal();showJobCardForm(\'' + esc(j.id) + '\')" style="padding:6px 14px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">\u270F Edit</button>' +
          '<button onclick="viewJobCard(\'' + esc(j.id) + '\')" style="padding:6px 14px;background:#f59e0b;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">\uD83D\uDD04 Refresh</button>' +
          '<button onclick="closeJobCardViewModal()" style="padding:6px 14px;background:var(--dark-3,#f3f4f6);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">Close</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">' +
        jcInfoBox('Client', [
          '<strong>' + esc(j.client_name) + '</strong>',
          j.client_company ? '<span style="color:var(--text-dim);">' + esc(j.client_company) + '</span>' : '',
          j.client_phone ? '\uD83D\uDCDE ' + esc(j.client_phone) : '',
          j.client_email ? '\u2709\uFE0F ' + esc(j.client_email) : '',
          j.client_address ? '\uD83D\uDCCD ' + esc(j.client_address) : ''
        ]) +
        jcInfoBox('Device &amp; Service', [
          j.service_type ? '<strong>Service: ' + esc(stLabel) + '</strong>' : '',
          j.device_type ? '<strong>' + esc(j.device_type) + '</strong>' : '',
          [j.device_brand, j.device_model].filter(Boolean).join(' '),
          j.device_serial ? 'SN: <code>' + esc(j.device_serial) + '</code>' : '',
          j.device_condition ? 'Condition: ' + esc(j.device_condition) : '',
          j.accessories ? 'Accessories: ' + esc(j.accessories) : ''
        ]) +
        jcInfoBox('Issue Reported', [esc(j.issue_description || 'N/A')]) +
        jcInfoBox('Assigned To', [
          j.technician_name ? 'Technician: <strong>' + esc(j.technician_name) + '</strong>' : '<span style="color:var(--text-dim);">No technician assigned</span>',
          j.sales_rep ? 'Sales Rep: ' + esc(j.sales_rep) : '',
          'Created: ' + (j.created_at || '').substring(0, 10),
          j.completed_at ? 'Completed: ' + j.completed_at.substring(0, 10) : ''
        ]) +
        jcInfoBox('Work &amp; Parts', [
          j.work_done ? '<strong>Work done:</strong><br>' + esc(j.work_done) : '<span style="color:var(--text-dim);">No work recorded yet.</span>',
          j.parts_used ? '<strong>Parts:</strong> ' + esc(j.parts_used) : ''
        ]) +
        jcInfoBox('Cost Summary',
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Diagnostic Fee:</span><span>N$' + (j.diag_fee||0).toFixed(2) + '</span></div>' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Repair Cost:</span><span>N$' + (j.total_cost||0).toFixed(2) + '</span></div>' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px;font-weight:700;border-top:1px solid var(--border);padding-top:4px;"><span>Grand Total:</span><span style="color:#1a1a2e;">N$' + ((j.diag_fee||0) + (j.total_cost||0)).toFixed(2) + '</span></div>' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Amount Paid:</span><span>N$' + (j.amount_paid||0).toFixed(2) + '</span></div>' +
          '<div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid var(--border);padding-top:6px;"><span>Balance Due:</span><span style="color:' + (balance > 0 ? '#d32f2f' : '#16a34a') + ';">N$' + balance.toFixed(2) + '</span></div>'
        ) +
      '</div>' +
      (j.technician_notes ? '<div style="background:var(--white,#fff);border-radius:8px;padding:16px;margin-bottom:14px;">' +
        '<h4 style="margin:0 0 8px;font-size:13px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">Technician Remarks</h4>' +
        '<div style="font-size:13px;">' + esc(j.technician_notes) + '</div>' +
      '</div>' : '') +
      '<div style="background:var(--white,#fff);border-radius:8px;padding:16px;margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">' +
          '<h4 style="margin:0;font-size:13px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">Current Status</h4>' +
          '<span style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600;background:' + sc + '20;color:' + sc + ';border:1px solid ' + sc + '40;">' + statusLabel(j.status) + '</span>' +
        '</div>' +
        '<h4 style="margin:0 0 10px;font-size:13px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">Status History</h4>' +
        histHtml +
        '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">' +
          '<div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-dim);">Add Status Update</div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
            '<select id="newStatusSelect" style="padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;">' +
              getStatusesForServiceType(j.service_type).map(function(s) {
                return '<option value="' + s + '"' + (j.status === s ? ' selected' : '') + '>' + statusLabel(s) + '</option>';
              }).join('') +
            '</select>' +
            '<input type="text" id="newStatusNote" placeholder="Comment * (required)" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;min-width:180px;font-family:inherit;">' +
            '<button id="addStatusBtn" style="padding:8px 18px;background:var(--red);color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-family:inherit;">Update Status</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      collectionHtml;

    document.getElementById('addStatusBtn').addEventListener('click', function() {
      var newStatus = document.getElementById('newStatusSelect').value;
      var note = (document.getElementById('newStatusNote').value || '').trim();
      if (!note) { alert('Please enter a comment for this status update.'); return; }

      // If collecting, show collection form
      if (newStatus === 'collected') {
        showCollectionForm(j);
        return;
      }

      apiFetch(API_BASE + '/api/admin/job-cards/' + encodeURIComponent(j.id) + '/status', addToken({ status: newStatus, note: note }), 'POST')
        .then(function() { viewJobCard(j.id); })
        .catch(function(err) { alert('Error: ' + err.message); });
    });
  }).catch(function(err) {
    content.innerHTML = '<div style="text-align:center;padding:40px;color:#d32f2f;">Error: ' + esc(err.message) + '</div>';
  });
}

function showCollectionForm(j) {
  var note = (document.getElementById('newStatusNote').value || '').trim();
  var hasCode = j.collection_code;

  var html =
    '<div style="padding:10px;">' +
      '<h3 style="margin:0 0 4px;font-size:18px;">' + '\u{1F4CB}' + ' Device Collection</h3>' +
      '<p style="font-size:13px;color:var(--text-dim);margin:0 0 16px;">Job Card: <strong>' + esc(j.id) + '</strong></p>';

  if (hasCode) {
    html +=
      '<div style="margin-bottom:16px;padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">' +
        '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Option 1: Collection Code</label>' +
        '<p style="font-size:12px;color:var(--text-dim);margin:0 0 8px;">Enter the 6-character code sent to the client\'s email.</p>' +
        '<input type="text" id="collectionCodeInput" placeholder="e.g. AB12CD" style="padding:10px;border:1.5px solid var(--border);border-radius:6px;font-size:16px;font-weight:700;letter-spacing:4px;text-transform:uppercase;width:180px;font-family:inherit;">' +
      '</div>' +
      '<div style="text-align:center;font-size:12px;color:var(--text-dim);margin:8px 0;">— OR —</div>';
  }

  html +=
    '<div style="margin-top:12px;">' +
      '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px;">Option 2: Collector Info &amp; Scanned Documents</label>' +
      '<input type="text" id="collectorNameInput" placeholder="Full name of person collecting *" style="display:block;width:100%;padding:10px;margin-bottom:10px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;font-family:inherit;box-sizing:border-box;">' +
      // ID Proof section
      '<div style="margin-bottom:10px;padding:12px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">' +
        '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Step 1: Scan / Upload Customer ID Proof</label>' +
        '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">' +
          '<button type="button" class="proofSrcBtn" data-src="camera" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-size:11px;font-family:inherit;">' + '\u{1F4F7}' + ' Camera</button>' +
          '<button type="button" class="proofSrcBtn" data-src="scanner" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-size:11px;font-family:inherit;">' + '\u{1F5A8}\uFE0F' + ' Scanner</button>' +
          '<button type="button" class="proofSrcBtn" data-src="file" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-size:11px;font-family:inherit;">' + '\u{1F4C1}' + ' Browse</button>' +
        '</div>' +
        '<input type="file" id="proofUpload" accept="image/*,.pdf" style="position:fixed;left:-9999px;top:-9999px;opacity:0;width:1px;height:1px;pointer-events:none;">' +
        '<div id="proofStatus" style="font-size:11px;color:var(--text-dim);">No ID proof selected</div>' +
        '<div id="proofPreview" style="display:none;margin-top:6px;"></div>' +
      '</div>' +
      // Signed Job Card section
      '<div style="margin-bottom:10px;padding:12px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">' +
        '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Step 2: Scan / Upload Signed Job Card</label>' +
        '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">' +
          '<button type="button" class="sigSrcBtn" data-src="camera" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-size:11px;font-family:inherit;">' + '\u{1F4F7}' + ' Camera</button>' +
          '<button type="button" class="sigSrcBtn" data-src="scanner" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-size:11px;font-family:inherit;">' + '\u{1F5A8}\uFE0F' + ' Scanner</button>' +
          '<button type="button" class="sigSrcBtn" data-src="file" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-size:11px;font-family:inherit;">' + '\u{1F4C1}' + ' Browse</button>' +
        '</div>' +
        '<input type="file" id="sigUpload" accept="image/*,.pdf" style="position:fixed;left:-9999px;top:-9999px;opacity:0;width:1px;height:1px;pointer-events:none;">' +
        '<div id="sigStatus" style="font-size:11px;color:var(--text-dim);">No signed job card selected</div>' +
        '<div id="sigPreview" style="display:none;margin-top:6px;"></div>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:16px;">' +
      '<button id="confirmCollectionBtn" style="padding:10px 24px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-family:inherit;">' + '\u2705' + ' Confirm Collection</button>' +
      '<button onclick="closeCollectionOverlay();viewJobCard(\'' + esc(j.id) + '\')" style="padding:10px 24px;background:var(--dark-3,#f3f4f6);color:var(--text,#111);border:1px solid var(--border,#ddd);border-radius:6px;font-weight:500;cursor:pointer;font-family:inherit;">Cancel</button>' +
    '</div>' +
    '</div>';

  closeCollectionOverlay();
  var overlay = document.createElement('div');
  overlay.id = 'collectionOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1001;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:20px;';
  overlay.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:500px;width:100%;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,0.2);">' + html + '</div>';
  document.body.appendChild(overlay);

  var proofInput = document.getElementById('proofUpload');
  var sigInput = document.getElementById('sigUpload');

  // Helper: wire up a group of buttons to trigger file input or camera
  function wireScanButtons(btnClass, input, statusId, previewId) {
    var isProof = btnClass === 'proofSrcBtn';
    document.querySelectorAll('.' + btnClass).forEach(function(btn) {
      btn.addEventListener('click', function() {
        var src = this.dataset.src;
        var statusEl = document.getElementById(statusId);
        if (src === 'camera') {
          openCamera(function(blob) {
            var file = new File([blob], (isProof ? 'id-proof' : 'signed-card') + '.jpg', { type: 'image/jpeg' });
            var dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            var changeEvent = new Event('change', { bubbles: true });
            input.dispatchEvent(changeEvent);
          }, statusEl);
        } else if (src === 'scanner') {
          input.value = '';
          input.removeAttribute('capture');
          input.setAttribute('accept', 'image/*,.pdf');
          statusEl.textContent = 'Select scanner from the file picker...';
          input.click();
        } else {
          input.value = '';
          input.removeAttribute('capture');
          input.setAttribute('accept', 'image/*,.pdf');
          statusEl.textContent = 'Browse and select a file...';
          input.click();
        }
      });
    });
    input.addEventListener('change', function() {
      if (this.files && this.files[0]) {
        document.getElementById(statusId).textContent = 'Selected: ' + this.files[0].name + ' (' + (this.files[0].size / 1024).toFixed(1) + ' KB)';
        var prev = document.getElementById(previewId);
        if (this.files[0].type.startsWith('image/')) {
          var r = new FileReader();
          r.onload = function(e) {
            prev.innerHTML = '<img src="' + e.target.result + '" style="max-width:100%;max-height:140px;border-radius:6px;border:1px solid var(--border);">';
            prev.style.display = 'block';
          };
          r.readAsDataURL(this.files[0]);
        } else {
          prev.innerHTML = '\u{1F4C4} <span style="font-size:13px;color:var(--text-dim);">PDF document selected</span>';
          prev.style.display = 'block';
        }
      }
    });
  }

  // Open device camera, capture a photo, return blob via callback
  function openCamera(callback, statusEl) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusEl.textContent = 'Camera not supported on this device/browser.';
      return;
    }
    var video = document.createElement('video');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.style.cssText = 'width:100%;max-width:400px;border-radius:8px;background:#000;';
    var canvas = document.createElement('canvas');
    var snapBtn = document.createElement('button');
    snapBtn.textContent = '\u{1F4F7} Capture Photo';
    snapBtn.style.cssText = 'padding:10px 24px;background:var(--red,#e5383b);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit;font-size:14px;margin-top:8px;';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '\u274C Cancel';
    closeBtn.style.cssText = 'padding:10px 24px;background:#f3f4f6;color:#111;border:1px solid #ddd;border-radius:8px;cursor:pointer;font-family:inherit;font-size:14px;margin-top:8px;margin-left:8px;';
    var camBox = document.createElement('div');
    camBox.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;';
    camBox.innerHTML = '<div style="background:#fff;border-radius:12px;padding:20px;text-align:center;max-width:440px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.3);"></div>';
    var box = camBox.firstChild;
    box.appendChild(video);
    box.appendChild(document.createElement('br'));
    box.appendChild(snapBtn);
    box.appendChild(closeBtn);
    document.body.appendChild(camBox);
    var stream = null;

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(function(s) {
        stream = s;
        video.srcObject = s;
        video.play();
        statusEl.textContent = 'Camera opened. Position document and capture.';
      })
      .catch(function() {
        statusEl.textContent = 'Could not open camera. Check permissions.';
        camBox.remove();
      });

    function stopCam() {
      if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
      camBox.remove();
    }

    snapBtn.addEventListener('click', function() {
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob(function(blob) {
        stopCam();
        if (blob) callback(blob);
      }, 'image/jpeg', 0.85);
    });

    closeBtn.addEventListener('click', stopCam);
  }

  wireScanButtons('proofSrcBtn', proofInput, 'proofStatus', 'proofPreview');
  wireScanButtons('sigSrcBtn', sigInput, 'sigStatus', 'sigPreview');

  // === Confirm Collection ===
  document.getElementById('confirmCollectionBtn').addEventListener('click', function() {
    var code = document.getElementById('collectionCodeInput') ? document.getElementById('collectionCodeInput').value.trim().toUpperCase() : '';
    var collector = document.getElementById('collectorNameInput') ? document.getElementById('collectorNameInput').value.trim() : '';
    var proofFile = proofInput.files[0];
    var sigFile = sigInput.files[0];

    if (hasCode && code && code === j.collection_code) {
      apiFetch(API_BASE + '/api/admin/job-cards/' + encodeURIComponent(j.id) + '/status', addToken({ status: 'collected', note: note || 'Device collected via code verification', collection_code: code }), 'POST')
        .then(function() { closeCollectionOverlay(); viewJobCard(j.id); })
        .catch(function(err) { alert('Error: ' + err.message); });
      return;
    }

    if (!collector) { alert('Please enter the name of the person collecting the device.'); return; }
    if (!proofFile && !sigFile) { alert('Please scan or upload at least the ID proof or the signed job card.'); return; }

    var formData = new FormData();
    formData.append('collector_name', collector);
    if (proofFile) formData.append('proof', proofFile);
    if (sigFile) formData.append('signature', sigFile);

    var uploadBtn = document.getElementById('confirmCollectionBtn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';

    fetch(API_BASE + '/api/admin/job-cards/' + encodeURIComponent(j.id) + '/upload-proof', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getSessionToken() },
      body: formData
    })
    .then(function(r) { return r.json(); })
    .then(function(uploadResp) {
      if (!uploadResp.success) throw new Error(uploadResp.error || 'Upload failed');
      return apiFetch(API_BASE + '/api/admin/job-cards/' + encodeURIComponent(j.id) + '/status', addToken({
        status: 'collected',
        note: note || 'Device collected by ' + collector + (proofFile ? ' (ID proof)' : '') + (sigFile ? ' (signed card)' : ''),
        collector_name: collector,
        collection_proof_path: uploadResp.proof_path || null,
        collection_signature_path: uploadResp.signature_path || null
      }), 'POST');
    })
    .then(function() { closeCollectionOverlay(); viewJobCard(j.id); })
    .catch(function(err) { alert('Error: ' + err.message); uploadBtn.disabled = false; uploadBtn.textContent = '\u2705 Confirm Collection'; });
  });
}

function closeCollectionOverlay() {
  var el = document.getElementById('collectionOverlay');
  if (el) el.remove();
}

function viewProof(path) {
  // Show the proof document in a lightbox
  var isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(path);
  var fullPath = API_BASE + '/' + path.replace(/^.*[\\\/]/, 'uploads/');

  var html = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="this.remove()">' +
    '<div style="max-width:90%;max-height:90vh;background:#fff;border-radius:12px;padding:16px;overflow:auto;" onclick="event.stopPropagation()">' +
    '<div style="text-align:right;margin-bottom:8px;">' +
      '<button onclick="this.closest(\'div[style]\').remove()" style="padding:6px 14px;background:var(--dark-3);border:1px solid var(--border);border-radius:6px;cursor:pointer;">Close</button>' +
    '</div>' +
    (isImage
      ? '<img src="' + esc(fullPath) + '" style="max-width:100%;max-height:80vh;border-radius:6px;">'
      : '<iframe src="' + esc(fullPath) + '" style="width:100%;height:80vh;border:none;border-radius:6px;"></iframe>') +
    '</div></div>';
  var el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
}

function printJobCard(id) {
  authGet(API_BASE + '/api/admin/job-cards/' + encodeURIComponent(id)).then(function(data) {
    if (!data || !data.jobCard) return alert('Job card not found.');
    var j = data.jobCard;
    var w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups for this site to print job cards.'); return; }
    var grandTotal = (j.diag_fee || 0) + (j.total_cost || 0);
    var balance = grandTotal - (j.amount_paid || 0);

    var tl = '';
    if (j.history && j.history.length) {
      tl = '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px;">' +
        '<tr style="background:#f3f4f6;"><th style="padding:5px 8px;border:1px solid #bbb;text-align:left;">Date/Time</th>' +
        '<th style="padding:5px 8px;border:1px solid #bbb;text-align:left;">Status</th>' +
        '<th style="padding:5px 8px;border:1px solid #bbb;text-align:left;">Comment</th></tr>';
      j.history.forEach(function(h) {
        tl += '<tr>' +
          '<td style="padding:5px 8px;border:1px solid #bbb;">' + esc((h.created_at||'').substring(0,16)) + '</td>' +
          '<td style="padding:5px 8px;border:1px solid #bbb;font-weight:700;">' + statusLabel(h.status) + '</td>' +
          '<td style="padding:5px 8px;border:1px solid #bbb;">' + esc(h.note||'') + '</td></tr>';
      });
      tl += '</table>';
    }

    function dl(label, val) {
      return '<div style="display:flex;align-items:baseline;margin-bottom:9px;gap:4px;">' +
        '<span style="font-weight:700;font-size:12.5px;white-space:nowrap;">' + label + '</span>' +
        '<span style="flex:1;border-bottom:2px dotted #333;margin:0 5px;"></span>' +
        '<span style="font-size:12.5px;">' + esc(val||'') + '</span></div>';
    }
    function dlR(lab1, val1, lab2, val2) {
      return '<div style="display:flex;align-items:baseline;margin-bottom:9px;gap:4px;">' +
        '<span style="font-weight:700;font-size:12.5px;white-space:nowrap;">' + lab1 + '</span>' +
        '<span style="flex:2;border-bottom:2px dotted #333;"></span>' +
        '<span style="font-size:12.5px;min-width:80px;text-align:right;padding-right:8px;">' + esc(val1||'') + '</span>' +
        '<span style="font-weight:700;font-size:12.5px;white-space:nowrap;">' + lab2 + '</span>' +
        '<span style="flex:1;border-bottom:2px dotted #333;"></span>' +
        '<span style="font-size:12.5px;min-width:60px;text-align:right;">' + esc(val2||'') + '</span></div>';
    }
    function blankLine() {
      return '<div style="border-bottom:2px dotted #333;height:16px;margin-bottom:9px;"></div>';
    }

    // Shorten the JC number for display: extract branch prefix + seq
    var shortId = esc(j.id);
    var idParts = (j.id || '').split('-');
    if (idParts.length >= 4) {
      shortId = idParts.slice(-2).join('-'); // e.g. "TSU-001"
    }

    var origin = window.location.origin;
    var html =
      '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<title>Workshop Job Card \u2013 ' + esc(j.id) + '</title>' +
      '<style>' +
      'body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;background:#fff;color:#111;}' +
      '.page{max-width:765px;margin:0 auto;padding:20px 28px 18px;box-sizing:border-box;}' +
      '.hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #111;padding-bottom:22px;margin-bottom:20px;}' +
      '.logo-wrap{display:flex;align-items:center;gap:10px;}' +
      '.logo-wrap img{height:54px;width:auto;}' +
      '.title-area{text-align:right;}' +
      '.title-area .sl{font-size:10px;font-style:italic;color:#dc2626;margin-bottom:3px;}' +
      '.title-area .wjc{font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;}' +
      '.title-area .jc-short{font-size:16px;font-weight:900;color:#dc2626;margin-top:2px;}' +
      '.sec{margin-bottom:12px;}' +
      '.offbox{border:2px solid #333;padding:12px 14px;margin:14px 0;}' +
      '.offbox-title{font-weight:900;font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;}' +
      '.imp-title{font-weight:900;font-size:13px;color:#dc2626;text-transform:uppercase;margin-bottom:4px;}' +
      '.imp-body{font-size:11.5px;line-height:1.65;}' +
      '.sig{border-bottom:1.5px solid #111;font-size:13px;font-weight:700;padding-bottom:2px;margin-top:12px;}' +
      '.bfooter{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;border-top:3px solid #111;padding-top:8px;margin-top:14px;}' +
      '.bcol{text-align:center;font-size:9.5px;line-height:1.6;}' +
      '.bcol .city{font-weight:900;font-size:11px;text-decoration:underline;color:#dc2626;}' +
      '@media print{@page{margin:8mm;} body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}' +
      '</style></head><body><div class="page">' +

      /* ── Header ── */
      '<div class="hdr">' +
        '<div class="logo-wrap">' +
          '<img src="' + origin + '/ROYAL PICS/royal logo.png" alt="" onerror="this.style.display=\'none\'">' +
        '</div>' +
        '<div class="title-area">' +
          '<div class="sl">...Leading the way in digital lifestyle...</div>' +
          '<div class="wjc">Workshop Job Card</div>' +
          '<div class="jc-short">#' + shortId + '</div>' +
        '</div>' +
      '</div>' +

      /* ── Client section ── */
      '<div class="sec">' +
        dlR('Attention.....', j.client_name, 'Date.....', (j.created_at||'').substring(0,10)) +
        dl('Company.....', j.client_company || '') +
        dlR('Address.....', j.client_address || '', 'Sales Rep.....', j.sales_rep || '') +
        blankLine() +
        dlR('Phone.....', j.client_phone || '', 'E-mail.....', j.client_email || '') +
        dl('Technician.....', j.technician_name || '') +
      '</div>' +

      /* ── Service type & Device ── */
      '<div class="sec">' +
        dl('Service Type.....', getServiceTypeLabel(j.service_type) || 'N/A') +
        dlR('Device.....', [j.device_type, j.device_brand, j.device_model].filter(Boolean).join(' '), 'Serial Number.....', j.device_serial || '') +
        dl('List accompanying accessories.....', j.accessories || '') +
        dl('Description of Problem(s).....', j.issue_description || '') +
        blankLine() + blankLine() +
      '</div>' +

      /* ── For Official Use ── */
      '<div class="offbox">' +
        '<div class="offbox-title">For Official Use</div>' +
        dl('Work Done.....', j.work_done || '') +
        blankLine() +
        dl('Parts Used.....', j.parts_used || '') +
        dl('Diag Fee N$.....', (j.diag_fee||0).toFixed(2)) +
        dlR('Repair Cost N$.....', (j.total_cost||0).toFixed(2), 'Invoice No.....', j.invoice_no || '') +
        '<div style="font-weight:700;font-size:13px;margin:6px 0;">Grand Total: N$ ' + grandTotal.toFixed(2) + '</div>' +
        dl('Remarks.....', j.technician_notes || '') +
      '</div>' +

      /* ── Status timeline ── */
      (tl ? '<div class="sec"><div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Status Updates</div>' + tl + '</div>' : '') +

      /* ── Collection info ── */
      (j.collector_name ? '<div class="sec"><div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Collection Info</div>' +
        dl('Collected By.....', j.collector_name || '') +
        (j.collection_code ? dl('Collection Code.....', j.collection_code || '') : '') +
      '</div>' : '') +

      /* ── Important ── */
      '<div class="sec">' +
        '<div class="imp-title">Important</div>' +
        '<div class="imp-body">' +
        'All goods brought in for repairs and unclaimed within <strong>THREE Months</strong> will be sold to defray workshop expenses<br>' +
        'Whilst due caution will be taken to preserve data, Royal Computers shall not be held liable for any data/information loss<br>' +
        'Please keep this document as proof of ownership. Goods will only be given out upon presentation of this document' +
        '</div>' +
      '</div>' +

      /* ── Signature ── */
      '<div class="sig">Customer Sign..........................................................................' +
        '<span style="font-size:11px;font-weight:400;margin-left:24px;">Date Collected....................20.........</span>' +
      '</div>' +

      /* ── Branch footer ── */
      '<div class="bfooter">' +
        '<div class="bcol"><div class="city">Swakopmund</div>Shop 3, Minette Court<br>Sam Nujoma Str<br>Tel 064 406914<br>swakop@royalcomputers.na</div>' +
        '<div class="bcol"><div class="city">Windhoek</div>Shop 25, Gustav Voigts Centre<br>Independence Av<br>Tel: 061 228179<br>windhoek@royalcomputers.na</div>' +
        '<div class="bcol"><div class="city">Walvis Bay</div>111 Hage Geingob Street<br>Office C<br>Tel: 064 200453<br>walvisbay@royalcomputers.na</div>' +
        '<div class="bcol"><div class="city">Oshakati</div>Shop 42 Etango Complex<br>081 6540001<br>oshakati@royalcomputers.na</div>' +
      '</div>' +
      '</div></body></html>';

    w.document.write(html);
    w.document.close();
    setTimeout(function() { w.focus(); w.print(); }, 700);
  }).catch(function(err) { alert('Error loading job card: ' + err.message); });
}

/* ─── Helper functions for building form fields ─── */
function jcStyle() {
  return 'style="width:100%;padding:8px;border:1.5px solid var(--border,#ddd);border-radius:6px;font-size:13px;margin-top:4px;font-family:inherit;box-sizing:border-box;"';
}
function jcLabel(labelText, forId, gridCol, innerHtml) {
  var gc = gridCol ? 'grid-column:' + gridCol + ';' : '';
  return '<label style="font-size:12px;font-weight:600;color:var(--text-dim,#666);' + gc + '">' + labelText + '<br>' + innerHtml + '</label>';
}
function jcInput(id, value, placeholder) {
  return '<input type="text" id="' + id + '" value="' + esc(value||'') + '"' +
    (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') +
    ' ' + jcStyle() + '>';
}
function jcTextarea(id, value, minH) {
  return '<textarea id="' + id + '" ' + jcStyle().replace('style="', 'style="min-height:' + (minH||60) + 'px;resize:vertical;') +
    '>' + esc(value||'') + '</textarea>';
}
function jcNumber(id, value) {
  return '<input type="number" id="' + id + '" value="' + (parseFloat(value)||0).toFixed(2) + '" step="0.01" min="0" ' + jcStyle() + '>';
}
function jcStatusSelect(currentStatus, serviceType) {
  var statuses = getStatusesForServiceType(serviceType || '');
  var opts = statuses.map(function(s) {
    return '<option value="' + s + '"' + (s === currentStatus ? ' selected' : '') + '>' + statusLabel(s) + '</option>';
  }).join('');
  return '<select id="jcfStatus" ' + jcStyle() + '>' + opts + '</select>';
}
function jcInfoBox(title, content) {
  var body = Array.isArray(content) ? content.filter(Boolean).join('<br>') : content;
  return '<div style="background:var(--white,#fff);border-radius:8px;padding:14px;">' +
    '<h4 style="margin:0 0 10px;font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">' + title + '</h4>' +
    '<div style="font-size:13px;line-height:1.8;">' + body + '</div>' +
    '</div>';
}
function statusLabel(s) {
  return (s||'').replace(/-/g,' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}
function statusColor(s) {
  var map = { diagnostic:'#f59e0b','in-progress':'#2563eb','waiting-parts':'#8b5cf6',ready:'#16a34a',completed:'#6b7280',collected:'#374151' };
  return map[s] || '#6b7280';
}
function val(id) {
  var el = document.getElementById(id);
  return el ? (el.value || '').trim() : '';
}
