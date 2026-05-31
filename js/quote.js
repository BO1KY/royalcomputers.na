/**
 * QUOTE MODULE  — Royal Computers
 * Generates proforma quotes from cart items.
 * BUG FIX: removed duplicate `selectedBranch` declaration that caused
 *           ReferenceError (selectedBranchId used before declaration).
 * Global: window.QUOTE
 */

window.QUOTE = (function () {
  'use strict';

  const TAX_RATE = 1.15; // 15 % VAT (prices are VAT-inclusive)

  /* ─── helpers ─────────────────────────────────────────────────────── */

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function validatePhone(phone) {
    return String(phone || '').replace(/\D/g, '').length >= 7;
  }

  function formatPrice(num) {
    return Number(num).toLocaleString('en-NA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatDate(date) {
    const d = new Date(date);
    const day   = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year  = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function generateQuoteNumber() {
    const rnd = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
    return 'QW' + rnd;
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─── createQuote ──────────────────────────────────────────────────── */

  /**
   * Build a quote object from cart items + customer info.
   * @param {Array}  cartItems    – items from CART.getItems()
   * @param {Object} customerInfo – { email, phone, name, company, address,
   *                                  branchId, notes, additionalDetails, paymentMethod }
   * @returns {Object} quote
   */
  function createQuote(cartItems, customerInfo) {
    const now        = new Date();
    const quoteNumber = generateQuoteNumber();
    const validUntil  = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    /* ── line items ── */
    let subtotal = 0;
    const lineItems = (cartItems || []).map(item => {
      const lineTotal = (item.price || 0) * (item.quantity || 1);
      subtotal += lineTotal;
      return {
        productId : item.productId,
        name      : item.name,
        category  : item.categoryName,
        variant   : item.variantLabel,
        quantity  : item.quantity,
        unitPrice : item.price,
        lineTotal
      };
    });

    const tax   = subtotal/TAX_RATE;
    const total = subtotal;

    /* ── branch – FIX: selectedBranchId declared BEFORE it is used ── */
    const selectedBranchId = (customerInfo && customerInfo.branchId)
      ? customerInfo.branchId
      : (window.BRANCHES ? window.BRANCHES.getDefaultBranch().id : 'branch-001');

    const selectedBranch = window.BRANCHES
      ? (window.BRANCHES.getBranchById(selectedBranchId) || window.BRANCHES.getDefaultBranch())
      : null;

    return {
      number      : quoteNumber,
      date        : now.toISOString(),
      validUntil  : validUntil.toISOString(),
      customer    : {
        email             : (customerInfo && customerInfo.email)             || '',
        phone             : (customerInfo && customerInfo.phone)             || '',
        name              : (customerInfo && customerInfo.name)              || '',
        company           : (customerInfo && customerInfo.company)           || '',
        address           : (customerInfo && customerInfo.address)           || '',
        notes             : (customerInfo && customerInfo.notes)             || '',
        additionalDetails : (customerInfo && customerInfo.additionalDetails) || '',
        paymentMethod     : (customerInfo && customerInfo.paymentMethod)     || 'CASH',
        accountType       : (customerInfo && customerInfo.paymentMethod)     || 'CASH'
      },
      selectedBranch,
      items   : lineItems,
      subtotal,
      tax,
      total,
      taxRate : TAX_RATE
    };
  }

  /* ─── generateHTMLSummary ──────────────────────────────────────────── */

  function generateHTMLSummary(quote) {
    const dateFormatted  = formatDate(quote.date);
    const validFormatted = formatDate(quote.validUntil);
    const branch   = quote.selectedBranch || {};
    const customer = quote.customer       || {};

    const boxBase = 'border:1px solid #ffffff;padding:14px;font-family:Arial,sans-serif;font-size:11px;';
    const thBase  = 'padding:7px 9px;border:1px solid #bbb;background:#f0f0f0;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;';
    const tdBase  = 'padding:7px 9px;border:1px solid #ddd;font-family:Arial,sans-serif;font-size:11px;vertical-align:top;';

    const th  = thBase + 'text-align:left;';
    const thC = thBase + 'text-align:center;';
    const thR = thBase + 'text-align:right;';
    const td  = tdBase + 'text-align:left;';
    const tdC = tdBase + 'text-align:center;';
    const tdR = tdBase + 'text-align:right;';

    /* customer block */
    const billLines = [
      customer.name    ? `<strong>${esc(customer.name)}</strong>`     : '',
      customer.company ? esc(customer.company)                        : '',
      customer.address ? esc(customer.address).replace(/\n/g, '<br>') : '',
      customer.email   ? esc(customer.email)                          : '',
      customer.phone   ? esc(customer.phone)                          : ''
    ].filter(Boolean).join('<br>');

    /* rows */
    const rows = (quote.items || []).map(item => `
      <tr>
        <td style="${td}">${esc(item.productId || '')}</td>
        <td style="${td}">
          ${esc(item.name)}
          ${item.variant ? `<br><span style="font-size:10px;color:#555;">${esc(item.variant)}</span>` : ''}
        </td>
        <td style="${tdC}">${item.quantity}</td>
        <td style="${tdC}">-</td>
        <td style="${tdR}">${formatPrice(item.unitPrice)}</td>
        <td style="${tdC}">0.00%</td>
        <td style="${tdC}">15.00%</td>
        <td style="${tdR}"><strong>${formatPrice(item.lineTotal)}</strong></td>
      </tr>`
    ).join('');

    const notesBlock = (customer.notes || customer.additionalDetails) ? `
      <div style="margin:8px 0;padding:10px 12px;background:#f9f9f9;border-left:3px solid #c00;font-family:Arial,sans-serif;font-size:11px;line-height:1.7;">
        ${customer.additionalDetails ? `<strong>Additional Details:</strong> ${esc(customer.additionalDetails).replace(/\n/g,'<br>')}<br>` : ''}
        ${customer.notes ? `<strong>Notes:</strong> ${esc(customer.notes)}` : ''}
      </div>` : '';

    var branchName = esc(branch.name || '');
    var branchAddr = esc(branch.address || '');
    var bankSectionHtml = `
          <div class="bank-section" style="font-family: Arial, sans-serif; font-size: 11px;">
            <p style="font-family: Arial, sans-serif; font-size: 11px;"><strong style="font-family: Arial, sans-serif; font-size: 11px;">${branchName}</strong></p>
            <p style="font-family: Arial, sans-serif; font-size: 11px;">${branchAddr}</p>
            <p style="font-family: Arial, sans-serif; font-size: 11px;">Bank: Windhoek</p>
            <p style="font-family: Arial, sans-serif; font-size: 11px;">A/C#8001836801 Code: 486372</p>
          </div>`;

    var totalsHtml = `
          <div class="totals-container">
            <div></div>
            <div class="totals-right">
              <div class="totals-row" style="font-family: Arial, sans-serif; font-size: 11px;">
                <span class="totals-label" style="font-family: Arial, sans-serif; font-size: 11px;">Sub Total</span>
                <span class="totals-value" style="font-family: Arial, sans-serif; font-size: 11px;">N$${formatPrice(quote.subtotal)}</span>
              </div>
              <div class="totals-row" style="font-family: Arial, sans-serif; font-size: 11px;">
                <span class="totals-label" style="font-family: Arial, sans-serif; font-size: 11px;">Discount @ 0.00%</span>
                <span class="totals-value" style="font-family: Arial, sans-serif; font-size: 11px;">-N$0.00</span>
              </div>
              <div class="totals-row" style="font-family: Arial, sans-serif; font-size: 11px;">
                <span class="totals-label" style="font-family: Arial, sans-serif; font-size: 11px;">VAT (Exclusive.)</span>
                <span class="totals-value" style="font-family: Arial, sans-serif; font-size: 11px;">${formatPrice(quote.tax)}</span>
              </div>
              <div class="totals-row" style="font-family: Arial, sans-serif; font-size: 11px;">
                <span class="totals-label" style="font-family: Arial, sans-serif; font-size: 11px;">TAX </span>
                <span class="totals-value" style="font-family: Arial, sans-serif; font-size: 11px;">${formatPrice(quote.subtotal - quote.tax)}</span>
              </div>
              <div class="totals-row totals-total" style="font-family: Arial, sans-serif; font-size: 11px;">
                <span style="font-family: Arial, sans-serif; font-size: 11px;">TOTAL</span>
                <span class="totals-value" style="font-weight: bold; font-family: Arial, sans-serif; font-size: 11px;">N$${formatPrice(quote.total)}</span>
              </div>
            </div>
          </div>`;

    return `
 <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Web Quote - Royal Computers</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { font-family: Arial, sans-serif; color: #333; background: white; font-size: 11px; }
          .page { max-width: 210mm; margin: 0 auto; padding: 20px 20px 160px; font-family: Arial, sans-serif; min-height: 100vh; position: relative; }
          .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 25px; }
          .company-box { border: 2px solid #333; padding: 15px; font-family: Arial, sans-serif; }
          .company-logo { font-size: 14px; font-weight: bold; margin-bottom: 10px; font-family: Arial, sans-serif; }
          .company-details { font-size: 11px; line-height: 1.6; font-family: Arial, sans-serif; }
          .company-details p { margin: 2px 0; font-family: Arial, sans-serif; font-size: 11px; }
          .invoice-box { border: 1px solid #999; padding: 15px; font-family: Arial, sans-serif; }
          .invoice-title { font-size: 16px; font-weight: bold; text-decoration: underline; margin-bottom: 8px; font-family: Arial, sans-serif; }
          .invoice-detail { display: grid; grid-template-columns: 100px 1fr; margin-bottom: 5px; font-size: 11px; font-family: Arial, sans-serif; }
          .invoice-detail-label { font-weight: bold; font-family: Arial, sans-serif; font-size: 11px; }
          .customer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .customer-box { border: 1px solid #999; padding: 12px; min-height: 100px; font-family: Arial, sans-serif; }
          .customer-title { font-weight: bold; font-size: 11px; margin-bottom: 6px; font-family: Arial, sans-serif; }
          .customer-text { font-size: 11px; line-height: 1.5; font-family: Arial, sans-serif; }
          .account-info { display: grid; grid-template-columns: repeat(6, 1fr); gap: 15px; padding: 10px 0; margin-bottom: 15px; border-bottom: 1px solid #999; font-size: 11px; font-family: Arial, sans-serif; }
          .account-field { font-family: Arial, sans-serif; }
          .account-label { font-weight: bold; margin-bottom: 3px; font-family: Arial, sans-serif; font-size: 11px; }
          .account-value { font-size: 11px; font-family: Arial, sans-serif; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-family: Arial, sans-serif; }
          table th { background: #f5f5f5; padding: 8px; text-align: left; border: 1px solid #999; font-weight: bold; font-size: 11px; font-family: Arial, sans-serif; }
          table td { padding: 8px; border: 1px solid #ddd; font-size: 11px; font-family: Arial, sans-serif; }
          thead { display: table-header-group; }
          .totals-container { display: grid; grid-template-columns: 1fr 220px; gap: 20px; margin-bottom: 20px; page-break-inside: avoid; }
          .totals-right { padding-right: 10px; font-family: Arial, sans-serif; }
          .totals-row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 11px; font-family: Arial, sans-serif; }
          .totals-label { font-weight: bold; font-family: Arial, sans-serif; font-size: 11px; }
          .totals-value { text-align: right; border-bottom: 1px solid #999; padding-bottom: 3px; min-width: 90px; font-family: Arial, sans-serif; font-size: 11px; }
          .totals-total { font-weight: bold; font-size: 11px; border-top: 2px solid #333; padding-top: 5px; margin-top: 5px; font-family: Arial, sans-serif; }
          .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; page-break-inside: avoid; }
          .signature-area { font-size: 11px; font-family: Arial, sans-serif; }
          .sig-line { border-top: 1px solid #333; padding-top: 30px; }
          .logo-img { max-width: 120px; height: auto; margin-bottom: 10px; }
          .page-footer { display: none; }
          @media screen and (max-width: 700px) {
            .page { padding: 10px 10px 140px; }
            .header-grid { grid-template-columns: 1fr; gap: 15px; }
            .customer-grid { grid-template-columns: 1fr; gap: 12px; }
            .account-info { grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 10px; }
            .totals-container { grid-template-columns: 1fr; }
            .totals-right { padding-right: 0; }
            table { font-size: 10px; }
            table th, table td { padding: 5px; font-size: 10px; }
            .company-box { padding: 10px; }
            .invoice-box { padding: 10px; }
            .customer-box { padding: 8px; min-height: auto; }
            .signature-section { grid-template-columns: 1fr; gap: 20px; margin-top: 20px; }
          }
          @media print {
            @page { margin: 12mm 8mm 22mm 8mm; }
            @page { @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 9px; font-family: Arial, sans-serif; color: #666; } }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .page { margin: 0; padding: 0 10px 120px; max-width: none; min-height: auto; }
            thead { display: table-header-group; }
            .bank-section { position: fixed; bottom: 14px; left: 10mm; right: 10mm; background: white; border-top: 2px solid #999; padding: 8px 0; margin: 0; }
            .totals-container { page-break-inside: avoid; }
            .signature-section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header-grid">
            <div class="company-box">
              <img src="ROYAL PICS/royal logo.png" alt="Royal Computers" class="logo-img" onerror="this.style.display='none';">
              <div class="company-details">
                <p style="font-family: Arial, sans-serif; font-size: 11px; font-weight: bold;">${branchName}</p>
                <p style="font-family: Arial, sans-serif; font-size: 11px;">${branchAddr}</p>
                <p style="font-family: Arial, sans-serif; font-size: 11px;">${branch.phone ? `Tel: ${esc(branch.phone)}` : ''}</p>
                <p style="font-family: Arial, sans-serif; font-size: 11px;">${branch.email ? `Email: ${esc(branch.email)}` : ''}</p>
              </div>
            </div>
            <div class="invoice-box">
              <div class="invoice-title" style="font-family: Arial, sans-serif; font-size: 16px;">Proforma Invoice</div>
              <div class="invoice-detail" style="font-family: Arial, sans-serif; font-size: 11px;"><span class="invoice-detail-label" style="font-family: Arial, sans-serif; font-size: 11px;">Document No:</span><span style="font-family: Arial, sans-serif; font-size: 11px;">${esc(quote.number)}</span></div>
              <div class="invoice-detail" style="font-family: Arial, sans-serif; font-size: 11px;"><span class="invoice-detail-label" style="font-family: Arial, sans-serif; font-size: 11px;">Date:</span><span style="font-family: Arial, sans-serif; font-size: 11px;">${dateFormatted}</span></div>
              <div class="invoice-detail" style="font-family: Arial, sans-serif; font-size: 11px;"><span class="invoice-detail-label" style="font-family: Arial, sans-serif; font-size: 11px;">Expiry:</span><span style="font-family: Arial, sans-serif; font-size: 11px;">${validFormatted}</span></div>
            </div>
          </div>
          <div class="customer-grid">
            <div class="customer-box">
              <div class="customer-title" style="font-family: Arial, sans-serif; font-size: 11px; font-weight: bold;">Bill to:</div>
              <div class="customer-text" style="font-family: Arial, sans-serif; font-size: 11px;">${billLines || 'Cash Customer'}</div>
            </div>
            <div class="customer-box">
              <div class="customer-title" style="font-family: Arial, sans-serif; font-size: 11px; font-weight: bold;">Deliver to:</div>
              <div class="customer-text" style="font-family: Arial, sans-serif; font-size: 11px;">${billLines || 'Pick in Person'}</div>
            </div>
          </div>
          <div class="account-info">
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Account</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">${esc(customer.paymentMethod || customer.accountType || 'CASH')}</div></div>
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Your Ref</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">${esc(customer.company || customer.additionalDetails || '-')}</div></div>
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Tax Exempt</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">N</div></div>
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Tax Ref</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">-</div></div>
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Sales Code</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">WEB QUOTE</div></div>
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Expiry</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">${validFormatted}</div></div>
          </div>
          <table>
            <thead>
              <tr style="font-family: Arial, sans-serif;">
                <th style="font-family: Arial, sans-serif; font-size: 11px;">Code</th>
                <th style="font-family: Arial, sans-serif; font-size: 11px;">Description</th>
                <th style="font-family: Arial, sans-serif; font-size: 11px;">Quantity</th>
                <th style="font-family: Arial, sans-serif; font-size: 11px;">Unit</th>
                <th style="font-family: Arial, sans-serif; font-size: 11px;">Unit Price</th>
                <th style="font-family: Arial, sans-serif; font-size: 11px;">Disc%</th>
                <th style="font-family: Arial, sans-serif; font-size: 11px;">Tax</th>
                <th style="font-family: Arial, sans-serif; font-size: 11px;">Nett Price</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          ${totalsHtml}
          <div class="signature-section">
            <div class="signature-area" style="font-family: Arial, sans-serif; font-size: 11px;">
              <div style="font-family: Arial, sans-serif; font-size: 11px;"><strong style="font-family: Arial, sans-serif; font-size: 11px;">Received in good order</strong></div>
              <div style="margin-top: 30px; text-align: center; font-family: Arial, sans-serif; font-size: 11px;">____________________</div>
              <div style="text-align: center; font-size: 10px; font-family: Arial, sans-serif;">Signature</div>
            </div>
            <div class="signature-area" style="font-family: Arial, sans-serif; font-size: 11px;">
              <div style="font-family: Arial, sans-serif; font-size: 11px;"><strong style="font-family: Arial, sans-serif; font-size: 11px;">Date</strong></div>
              <div style="margin-top: 30px; text-align: center; font-family: Arial, sans-serif; font-size: 11px;">____________________</div>
              <div style="text-align: center; font-size: 10px; font-family: Arial, sans-serif;">Authorized</div>
            </div>
          </div>
        </div>
        <div class="page-footer">
          ${bankSectionHtml}
        </div>
      </body>
      </html>
    `;
  }

  /* ─── public API ───────────────────────────────────────────────────── */
  return {
    validateEmail,
    validatePhone,
    createQuote,
    generateHTMLSummary,
    formatPrice,
    formatDate
  };

})();