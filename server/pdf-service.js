var PDFDocument = require('pdfkit');
var path = require('path');
var fs = require('fs');

function statusLabel(s) {
  return (s || '').replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

var SERVICE_TYPE_LABELS = {
  'diagnostic': 'Diagnostic / Assessment',
  'screen-replacement-laptop': 'Screen Replacement (Laptop)',
  'screen-replacement-phone': 'Screen Replacement (Cellphone)',
  'charging-port-repair': 'Charging Port Repair',
  'keyboard-replacement': 'Keyboard Replacement',
  'battery-replacement': 'Battery Replacement',
  'ram-upgrade': 'RAM / Storage Upgrade (Hardware)',
  'hardware-upgrade': 'Other Hardware Upgrade / Installation',
  'power-repair': 'Power Supply / Adapter Repair',
  'liquid-damage': 'Liquid Damage Repair',
  'fan-repair': 'Fan / Cooling System Repair',
  'virus-removal': 'Virus / Malware Removal',
  'software-install': 'Software Installation / Upgrade',
  'data-recovery': 'Data Recovery / Backup',
  'os-repair': 'Operating System Repair',
  'networking-setup': 'Networking Setup / Configuration',
  'general-repair': 'General PC / Laptop Repair & Maintenance',
  'printer-repair': 'Printer Setup / Repair'
};

function generateJobCardPDF(jobCard, branch, history) {
  var doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: false });
  var buffers = [];
  doc.on('data', function(b) { buffers.push(b); });

  var pageWidth = doc.page.width - 80;
  var leftMargin = 40;
  var rightX = doc.page.width - 40;

  // Colors
  var DARK = '#1a1a2e';
  var RED = '#dc2626';
  var GRAY = '#6b7280';
  var LIGHT_GRAY = '#f3f4f6';

  // ── Helper: dotted line ──
  function dottedLine(y, x1, x2) {
    doc.moveTo(x1 || leftMargin, y)
       .lineTo(x2 || rightX, y)
       .dash(3, { space: 3 })
       .strokeColor('#999')
       .stroke()
       .undash();
  }

  // ── Helper: label with dotted underline field ──
  function field(label, value, y, x, w) {
    x = x || leftMargin;
    w = w || (rightX - x);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
       .text(label, x, y, { continued: false });
    var labelW = doc.widthOfString(label);
    var lineY = y + 10;
    doc.moveTo(x + labelW + 2, lineY)
       .lineTo(x + w, lineY)
       .dash(2, { space: 2 })
       .strokeColor('#aaa')
       .stroke()
       .undash();
    if (value) {
      doc.fontSize(9).font('Helvetica').fillColor('#111')
         .text(String(value), x + labelW + 4, y - 2);
    }
    return y + 22;
  }

  // ── Helper: two-column field row ──
  function fieldRow(label1, value1, label2, value2, y) {
    var half = (rightX - leftMargin) / 2;
    y = field(label1, value1, y, leftMargin, half - 10);
    return field(label2, value2, y - 22, leftMargin + half, half - 10);
  }

  // ── Helper: blank dotted line ──
  function blankLine(y, h) {
    h = h || 16;
    dottedLine(y + h);
    return y + h + 4;
  }

  var y = 40;

  // ═══════════════ HEADER ═══════════════
  var logoPath = path.join(__dirname, '..', 'ROYAL PICS', 'royal logo.webp');
  try {
    doc.image(logoPath, leftMargin, y, { height: 36 });
  } catch (e) {
    doc.fontSize(28).font('Helvetica-BoldOblique').fillColor(RED)
       .text('Royal', leftMargin, y, { continued: true });
    doc.fontSize(14).font('Helvetica-Bold').fillColor(DARK)
       .text('  Computers', { continued: false });
  }

  var taglineY = y + 38;
  doc.fontSize(8).font('Helvetica-Oblique').fillColor(RED)
     .text('...Leading the way in digital lifestyle...', leftMargin, taglineY);

  // Title right side
  var titleY = y;
  doc.fontSize(18).font('Helvetica-Bold').fillColor(DARK)
     .text('WORKSHOP JOB CARD', rightX - 170, titleY + 6, { align: 'right', width: 170 });

  // Red underline
  var lineY2 = titleY + 42;
  doc.moveTo(leftMargin, lineY2)
     .lineTo(rightX, lineY2)
     .lineWidth(3)
     .strokeColor(DARK)
     .stroke()
     .lineWidth(1);

  // Shortened JC reference (branch prefix + seq only)
  var idParts = (jobCard.id || '').split('-');
  var shortId = idParts.length >= 4 ? idParts.slice(-2).join('-') : (jobCard.id || '');
  var refY = lineY2 + 8;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(RED)
     .text('#' + shortId, leftMargin, refY);

  // Date
  var dateStr = jobCard.created_at ? jobCard.created_at.substring(0, 10) : '';
  doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
     .text('Date In:  ' + dateStr, rightX - 120, refY, { width: 120, align: 'right' });

  y = refY + 24;

  // ═══════════════ CLIENT & DEVICE SECTION ═══════════════
  // Client Info
  doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK)
     .text('CLIENT INFORMATION', leftMargin, y);
  y += 16;

  y = fieldRow('Attention:', jobCard.client_name || '', 'Date:', dateStr, y);
  y = fieldRow('Company:', jobCard.client_company || '', 'Sales Rep:', jobCard.sales_rep || '', y);
  y = blankLine(y);
  y = fieldRow('Phone:', jobCard.client_phone || '', 'Email:', jobCard.client_email || '', y);
  y = field('Address:', jobCard.client_address || '', y);
  y = fieldRow('Technician:', jobCard.technician_name || '', 'Status:', statusLabel(jobCard.status || 'diagnostic'), y);

  y += 8;

  // Service type
  if (jobCard.service_type) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
       .text('Service Type:', leftMargin, y, { continued: true });
    doc.fontSize(9).font('Helvetica').fillColor(RED)
       .text('  ' + (SERVICE_TYPE_LABELS[jobCard.service_type] || jobCard.service_type), { continued: false });
    y += 16;
  }

  // Device Info
  doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK)
     .text('DEVICE INFORMATION', leftMargin, y);
  y += 16;

  var deviceStr = [jobCard.device_type, jobCard.device_brand, jobCard.device_model].filter(Boolean).join(' - ');
  y = fieldRow('Device:', deviceStr || '', 'Serial No:', jobCard.device_serial || '', y);
  y = field('Condition:', jobCard.device_condition || '', y);

  // Accessories box
  y += 4;
  doc.roundedRect(leftMargin, y, rightX - leftMargin, 28, 3)
     .lineWidth(1)
     .strokeColor('#ccc')
     .stroke();
  doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY)
     .text('ACCESSORIES RECEIVED', leftMargin + 6, y + 3);
  doc.fontSize(9).font('Helvetica').fillColor(DARK)
     .text(jobCard.accessories || 'None', leftMargin + 6, y + 14);
  y += 36;

  // ═══════════════ REPORTED ISSUE ═══════════════
  doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK)
     .text('DESCRIPTION OF PROBLEM(S)', leftMargin, y);
  y += 16;

  var issueH = 40;
  doc.roundedRect(leftMargin, y, rightX - leftMargin, issueH, 3)
     .lineWidth(1)
     .strokeColor('#ccc')
     .stroke();
  if (jobCard.issue_description) {
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
       .text(jobCard.issue_description, leftMargin + 6, y + 4, { width: rightX - leftMargin - 12 });
  }
  y += issueH + 8;

  // ═══════════════ FOR OFFICIAL USE ═══════════════
  doc.fontSize(10).font('Helvetica-Bold').fillColor(RED)
     .text('FOR OFFICIAL USE', leftMargin, y);
  y += 16;

  // Work Done
  doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
     .text('Work Done:', leftMargin, y);
  y += 13;
  var workH = Math.max(30, jobCard.work_done ? 20 + (jobCard.work_done.length / 40) * 10 : 30);
  doc.roundedRect(leftMargin, y, rightX - leftMargin, workH, 3)
     .lineWidth(1)
     .strokeColor('#ccc')
     .stroke();
  if (jobCard.work_done) {
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
       .text(jobCard.work_done, leftMargin + 6, y + 4, { width: rightX - leftMargin - 12 });
  }
  y += workH + 6;

  // Parts Used
  y = field('Parts Used:', jobCard.parts_used || '', y);
  y += 2;
  y = fieldRow('Invoice No:', jobCard.invoice_no || '', 'Total Cost (N$):', (jobCard.total_cost || 0).toFixed(2), y);
  y = fieldRow('Diagnostic Fee (N$):', (jobCard.diag_fee || 0).toFixed(2), 'Amount Paid (N$):', (jobCard.amount_paid || 0).toFixed(2), y);

  var balance = (jobCard.total_cost || 0) - (jobCard.amount_paid || 0);
  y += 2;
  doc.fontSize(10).font('Helvetica-Bold').fillColor(balance > 0 ? RED : '#16a34a')
     .text('Balance Due: N$ ' + balance.toFixed(2), leftMargin, y);
  y += 20;

  // Technician Notes
  if (jobCard.technician_notes) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
       .text('Technician Remarks:', leftMargin, y);
    y += 13;
    var notesH = Math.max(20, 14 + (jobCard.technician_notes.length / 40) * 10);
    doc.roundedRect(leftMargin, y, rightX - leftMargin, notesH, 3)
       .lineWidth(1)
       .strokeColor('#ccc')
       .stroke();
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
       .text(jobCard.technician_notes, leftMargin + 6, y + 4, { width: rightX - leftMargin - 12 });
    y += notesH + 8;
  }

  // Check if we need a new page for history + footer
  var remainingSpace = doc.page.height - 40 - y;
  if (remainingSpace < 160) {
    doc.addPage();
    y = 40;
  }

  // ═══════════════ STATUS TIMELINE ═══════════════
  if (history && history.length > 0) {
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK)
       .text('STATUS UPDATES', leftMargin, y);
    y += 16;

    history.forEach(function(h) {
      var dateStr2 = (h.created_at || '').substring(0, 16);
      var statStr = statusLabel(h.status);
      doc.fontSize(8).font('Helvetica-Oblique').fillColor(GRAY)
         .text(dateStr2, leftMargin, y, { width: 130 });
      doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
         .text(statStr, leftMargin + 135, y, { width: 130 });
      if (h.note) {
        doc.fontSize(8).font('Helvetica').fillColor(GRAY)
           .text(h.note, leftMargin + 270, y, { width: rightX - leftMargin - 270 });
      }
      y += 14;
    });
  }

  // ═══════════════ COLLECTION INFO ═══════════════
  if (jobCard.collector_name) {
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK)
       .text('COLLECTION INFO', leftMargin, y);
    y += 16;
    y = field('Collected By:', jobCard.collector_name || '', y);
    if (jobCard.collection_code) {
      y = field('Collection Code:', jobCard.collection_code || '', y);
    }
    y += 6;
  }

  y += 10;

  // ═══════════════ IMPORTANT NOTES ═══════════════
  var impY = doc.page.height - 40 - 100;
  if (y > impY) {
    doc.addPage();
    y = 40;
  }

  // Signature
  doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK)
     .text('Customer Signature:', leftMargin, y);
  dottedLine(y + 14, leftMargin, leftMargin + 250);
  doc.fontSize(9).font('Helvetica').fillColor(GRAY)
     .text('Date Collected: ____________________', leftMargin + 270, y + 2);

  y += 30;

  // Important notice box
  doc.roundedRect(leftMargin, y, rightX - leftMargin, 50, 4)
     .lineWidth(2)
     .strokeColor(RED)
     .stroke();
  doc.fontSize(9).font('Helvetica-Bold').fillColor(RED)
     .text('IMPORTANT', leftMargin + 8, y + 6);
  doc.fontSize(7.5).font('Helvetica').fillColor(DARK)
     .text([
       'All goods brought in for repairs and unclaimed within THREE Months will be sold to defray workshop expenses.',
       'Whilst due caution will be taken to preserve data, Royal Computers shall not be held liable for any data/information loss.',
       'Please keep this document as proof of ownership. Goods will only be given out upon presentation of this document.'
     ].join('\n'), leftMargin + 8, y + 20, { width: rightX - leftMargin - 16 });

  y += 60;

  // ═══════════════ BRANCH FOOTER ═══════════════
  var footerTop = doc.page.height - 40 - 60;
  if (y > footerTop) {
    doc.addPage();
    y = 40;
  }

  // Line above footer
  doc.moveTo(leftMargin, doc.page.height - 40 - 65)
     .lineTo(rightX, doc.page.height - 40 - 65)
     .lineWidth(3)
     .strokeColor(DARK)
     .stroke()
     .lineWidth(1);

  // Branch info
  var branchY = doc.page.height - 40 - 55;
  if (branch) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(RED)
       .text(branch.name || '', leftMargin, branchY);
    doc.fontSize(8).font('Helvetica').fillColor(GRAY)
       .text([
         branch.address || '',
         'Tel: ' + (branch.phone || ''),
         'Email: ' + (branch.email || '')
       ].filter(Boolean).join(' | '), leftMargin, branchY + 12, { width: rightX - leftMargin });
  }

  doc.fontSize(7).font('Helvetica').fillColor(GRAY)
     .text('Royal Computers Namibia — Workshops Job Card — Generated ' + new Date().toISOString().substring(0, 10), leftMargin, doc.page.height - 40 - 20, { align: 'center', width: rightX - leftMargin });

  doc.end();

  return new Promise(function(resolve, reject) {
    doc.on('end', function() {
      resolve(Buffer.concat(buffers));
    });
    doc.on('error', reject);
  });
}

module.exports = { generateJobCardPDF };
