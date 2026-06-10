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
  var pageBottom = doc.page.height - 40;
  var footerTop = pageBottom - 130; // Reserve bottom 130px for signature + important + footer

  var DARK = '#1a1a2e';
  var RED = '#dc2626';
  var GRAY = '#6b7280';

  function dottedLine(y, x1, x2) {
    doc.moveTo(x1 || leftMargin, y)
       .lineTo(x2 || rightX, y)
       .dash(3, { space: 3 })
       .strokeColor('#999')
       .stroke()
       .undash();
  }

  function field(label, value, y, x, w) {
    x = x || leftMargin;
    w = w || (rightX - x);
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(DARK)
       .text(label, x, y, { continued: false });
    var labelW = doc.widthOfString(label);
    var lineY = y + 9;
    doc.moveTo(x + labelW + 2, lineY)
       .lineTo(x + w, lineY)
       .dash(2, { space: 2 })
       .strokeColor('#aaa')
       .stroke()
       .undash();
    if (value) {
      doc.fontSize(8.5).font('Helvetica').fillColor('#111')
         .text(String(value), x + labelW + 4, y - 2);
    }
    return y + 20;
  }

  function fieldRow(label1, value1, label2, value2, y) {
    var half = (rightX - leftMargin) / 2;
    y = field(label1, value1, y, leftMargin, half - 10);
    return field(label2, value2, y - 20, leftMargin + half, half - 10);
  }

  var y = 36;

  // ═══════ HEADER ═══════
  var logoPath = path.join(__dirname, '..', 'ROYAL PICS', 'royal logo.png');
  try {
    doc.image(logoPath, leftMargin, y, { height: 34 });
  } catch (e) {
    doc.fontSize(26).font('Helvetica-BoldOblique').fillColor(RED)
       .text('Royal', leftMargin, y, { continued: true });
    doc.fontSize(13).font('Helvetica-Bold').fillColor(DARK)
       .text('  Computers', { continued: false });
  }

  var taglineY = y + 38;
  doc.fontSize(7.5).font('Helvetica-Oblique').fillColor(RED)
     .text('...Leading the way in digital lifestyle...', leftMargin, taglineY);

  doc.fontSize(15).font('Helvetica-Bold').fillColor(DARK)
     .text('WORKSHOP JOB CARD', rightX - 200, y + 8, { align: 'right', width: 200 });

  var lineY2 = taglineY + 12;
  doc.moveTo(leftMargin, lineY2)
     .lineTo(rightX, lineY2)
     .lineWidth(2.5)
     .strokeColor(DARK)
     .stroke()
     .lineWidth(1);

  var idParts = (jobCard.id || '').split('-');
  var shortId = idParts.length >= 4 ? idParts.slice(-2).join('-') : (jobCard.id || '');
  var refY = lineY2 + 6;
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(RED)
     .text('#' + shortId, leftMargin, refY);
  var dateStr = jobCard.created_at ? jobCard.created_at.substring(0, 10) : '';
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(DARK)
     .text('Date In:  ' + dateStr, rightX - 120, refY, { width: 120, align: 'right' });

  y = refY + 22;

  // ═══════ CLIENT & DEVICE ═══════
  doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
     .text('CLIENT INFORMATION', leftMargin, y);
  y += 13;

  y = fieldRow('Attention:', jobCard.client_name || '', 'Date:', dateStr, y);
  y = fieldRow('Company:', jobCard.client_company || '', 'Sales Rep:', jobCard.sales_rep || '', y);
  dottedLine(y + 2);
  y += 10;
  y = fieldRow('Phone:', jobCard.client_phone || '', 'Email:', jobCard.client_email || '', y);
  y = field('Address:', jobCard.client_address || '', y);
  y = fieldRow('Technician:', jobCard.technician_name || '', 'Status:', statusLabel(jobCard.status || 'diagnostic'), y);
  y += 2;

  if (jobCard.service_type) {
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(DARK)
       .text('Service Type:', leftMargin, y, { continued: true });
    doc.fontSize(8.5).font('Helvetica').fillColor(RED)
       .text('  ' + (SERVICE_TYPE_LABELS[jobCard.service_type] || jobCard.service_type), { continued: false });
    y += 14;
  }

  doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
     .text('DEVICE INFORMATION', leftMargin, y);
  y += 13;

  var deviceStr = [jobCard.device_type, jobCard.device_brand, jobCard.device_model].filter(Boolean).join(' - ');
  y = fieldRow('Device:', deviceStr || '', 'Serial No:', jobCard.device_serial || '', y);
  y = field('Condition:', jobCard.device_condition || '', y);

  // Accessories compact
  y += 3;
  doc.roundedRect(leftMargin, y, rightX - leftMargin, 22, 3)
     .lineWidth(1)
     .strokeColor('#ccc')
     .stroke();
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor(GRAY)
     .text('ACCESSORIES RECEIVED', leftMargin + 6, y + 2);
  doc.fontSize(8).font('Helvetica').fillColor(DARK)
     .text(jobCard.accessories || 'None', leftMargin + 6, y + 11);
  y += 28;

  // ═══════ ISSUE ═══════
  doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
     .text('DESCRIPTION OF PROBLEM(S)', leftMargin, y);
  y += 13;

  var issueH = 32;
  doc.roundedRect(leftMargin, y, rightX - leftMargin, issueH, 3)
     .lineWidth(1)
     .strokeColor('#ccc')
     .stroke();
  if (jobCard.issue_description) {
    doc.fontSize(8.5).font('Helvetica').fillColor(DARK)
       .text(jobCard.issue_description, leftMargin + 6, y + 4, { width: rightX - leftMargin - 12 });
  }
  y += issueH + 6;

  // ═══════ FOR OFFICIAL USE ═══════
  doc.fontSize(9).font('Helvetica-Bold').fillColor(RED)
     .text('FOR OFFICIAL USE', leftMargin, y);
  y += 13;

  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(DARK)
     .text('Work Done:', leftMargin, y);
  y += 11;
  var workH = Math.max(24, jobCard.work_done ? 16 + (jobCard.work_done.length / 50) * 8 : 24);
  doc.roundedRect(leftMargin, y, rightX - leftMargin, workH, 3)
     .lineWidth(1)
     .strokeColor('#ccc')
     .stroke();
  if (jobCard.work_done) {
    doc.fontSize(8).font('Helvetica').fillColor(DARK)
       .text(jobCard.work_done, leftMargin + 6, y + 3, { width: rightX - leftMargin - 12 });
  }
  y += workH + 5;

  y = field('Parts Used:', jobCard.parts_used || '', y);
  var grandTotal = (jobCard.diag_fee || 0) + (jobCard.total_cost || 0);
  y = fieldRow('Invoice No:', jobCard.invoice_no || '', 'Diagnostic Fee (N$):', (jobCard.diag_fee || 0).toFixed(2), y);
  y = fieldRow('Repair Cost (N$):', (jobCard.total_cost || 0).toFixed(2), 'Amount Paid (N$):', (jobCard.amount_paid || 0).toFixed(2), y);

  var balance = grandTotal - (jobCard.amount_paid || 0);
  y += 1;
  doc.fontSize(11).font('Helvetica-Bold').fillColor(DARK)
     .text('GRAND TOTAL: N$ ' + grandTotal.toFixed(2), leftMargin, y);
  y += 14;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(balance > 0 ? RED : '#16a34a')
     .text('Balance Due: N$ ' + balance.toFixed(2), leftMargin, y);
  y += 14;

  if (jobCard.technician_notes) {
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(DARK)
       .text('Technician Remarks:', leftMargin, y);
    y += 11;
    var notesH = Math.max(16, 12 + (jobCard.technician_notes.length / 50) * 8);
    doc.roundedRect(leftMargin, y, rightX - leftMargin, notesH, 3)
       .lineWidth(1)
       .strokeColor('#ccc')
       .stroke();
    doc.fontSize(8).font('Helvetica').fillColor(DARK)
       .text(jobCard.technician_notes, leftMargin + 6, y + 3, { width: rightX - leftMargin - 12 });
    y += notesH + 5;
  }

  // ═══════ STATUS TIMELINE ═══════
  if (history && history.length > 0) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
       .text('STATUS UPDATES', leftMargin, y);
    y += 12;

    var stepW = Math.min(105, (rightX - leftMargin) / Math.max(history.length, 1) - 6);
    var totalW = history.length * (stepW + 6) - 6;
    var startX = leftMargin + Math.max(0, (rightX - leftMargin - totalW) / 2);

    history.forEach(function(h, i) {
      var hx = startX + i * (stepW + 6);
      var dateStr2 = (h.created_at || '').substring(0, 16);
      var statStr = statusLabel(h.status);

      var circleY = y + 7;
      doc.circle(hx + stepW / 2, circleY, 3.5)
         .fillColor(DARK)
         .fill();

      doc.fontSize(6.5).font('Helvetica-Oblique').fillColor(GRAY)
         .text(dateStr2, hx, y - 2, { width: stepW, align: 'center' });
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(DARK)
         .text(statStr, hx, circleY + 7, { width: stepW, align: 'center' });

      if (h.note) {
        doc.fontSize(6).font('Helvetica').fillColor(GRAY)
           .text(h.note, hx, circleY + 17, { width: stepW, align: 'center' });
      }

      if (i < history.length - 1) {
        doc.fontSize(9).fillColor('#ccc')
           .text('\u2192', hx + stepW + 2, circleY - 4, { width: 4, align: 'center' });
      }
    });

    var maxNoteLines = 0;
    history.forEach(function(h) { if (h.note) maxNoteLines = Math.max(maxNoteLines, Math.ceil(h.note.length / 16)); });
    y += 32 + maxNoteLines * 9;
  }

  // ═══════ COLLECTION INFO ═══════
  if (jobCard.collector_name) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
       .text('COLLECTION INFO', leftMargin, y);
    y += 13;
    y = field('Collected By:', jobCard.collector_name || '', y);
    if (jobCard.collection_code) {
      y = field('Collection Code:', jobCard.collection_code || '', y);
    }
    y += 4;
  }

  // ═══════ FOOTER: Signature + Important + Branch (always at bottom) ═══════
  var footY = pageBottom - 125;

  // Signature
  doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
     .text('Customer Signature:', leftMargin, footY);
  dottedLine(footY + 13, leftMargin, leftMargin + 230);
  doc.fontSize(8).font('Helvetica').fillColor(GRAY)
     .text('Date Collected: ____________________', leftMargin + 245, footY + 1);

  footY += 24;

  // Important notice
  doc.roundedRect(leftMargin, footY, rightX - leftMargin, 42, 4)
     .lineWidth(1.5)
     .strokeColor(RED)
     .stroke();
  doc.fontSize(8).font('Helvetica-Bold').fillColor(RED)
     .text('IMPORTANT', leftMargin + 6, footY + 4);
  doc.fontSize(6.5).font('Helvetica').fillColor(DARK)
     .text([
       'All goods brought in for repairs and unclaimed within THREE Months will be sold to defray workshop expenses.',
       'Whilst due caution will be taken to preserve data, Royal Computers shall not be held liable for any data/information loss.',
       'Please keep this document as proof of ownership. Goods will only be given out upon presentation of this document.'
     ].join('\n'), leftMargin + 6, footY + 16, { width: rightX - leftMargin - 12 });

  footY += 50;

  // Line above branch footer
  doc.moveTo(leftMargin, footY)
     .lineTo(rightX, footY)
     .lineWidth(2.5)
     .strokeColor(DARK)
     .stroke()
     .lineWidth(1);

  footY += 6;

  if (branch) {
    doc.fontSize(8).font('Helvetica-Bold').fillColor(RED)
       .text(branch.name || '', leftMargin, footY);
    doc.fontSize(7).font('Helvetica').fillColor(GRAY)
       .text([
         branch.address || '',
         'Tel: ' + (branch.phone || ''),
         'Email: ' + (branch.email || '')
       ].filter(Boolean).join(' | '), leftMargin, footY + 10, { width: rightX - leftMargin });
  }

  doc.fontSize(6.5).font('Helvetica').fillColor(GRAY)
     .text('Royal Computers Namibia — Workshops Job Card — Generated ' + new Date().toISOString().substring(0, 10), leftMargin, pageBottom - 14, { align: 'center', width: rightX - leftMargin });

  doc.end();

  return new Promise(function(resolve, reject) {
    doc.on('end', function() {
      resolve(Buffer.concat(buffers));
    });
    doc.on('error', reject);
  });
}

module.exports = { generateJobCardPDF };
