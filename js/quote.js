window.QUOTE=(function(){"use strict";function u(t){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(t||"").trim())}function z(t){return String(t||"").replace(/\D/g,"").length>=7}function l(t){return Number(t).toLocaleString("en-NA",{minimumFractionDigits:2,maximumFractionDigits:2})}function m(t){const i=new Date(t),o=String(i.getDate()).padStart(2,"0"),e=String(i.getMonth()+1).padStart(2,"0"),a=i.getFullYear();return`${o}/${e}/${a}`}function $(){return"QW"+Math.floor(Math.random()*1e7).toString().padStart(7,"0")}function s(t){return String(t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function w(t,i){const o=new Date,e=$(),a=new Date(o.getTime()+720*60*60*1e3);let d=0;const p=(t||[]).map(n=>{const r=(n.price||0)*(n.quantity||1);return d+=r,{productId:n.productId,name:n.name,category:n.categoryName,variant:n.variantLabel,quantity:n.quantity,unitPrice:n.price,lineTotal:r}}),c=d/1.15,y=d,x=i&&i.branchId?i.branchId:window.BRANCHES?window.BRANCHES.getDefaultBranch().id:"branch-001",g=window.BRANCHES?window.BRANCHES.getBranchById(x)||window.BRANCHES.getDefaultBranch():null;return{number:e,date:o.toISOString(),validUntil:a.toISOString(),customer:{email:i&&i.email||"",phone:i&&i.phone||"",name:i&&i.name||"",company:i&&i.company||"",address:i&&i.address||"",notes:i&&i.notes||"",additionalDetails:i&&i.additionalDetails||"",paymentMethod:i&&i.paymentMethod||"CASH",accountType:i&&i.paymentMethod||"CASH"},selectedBranch:g,items:p,subtotal:d,tax:c,total:y,taxRate:1.15}}function _(t){const i=m(t.date),o=m(t.validUntil),e=t.selectedBranch||{},a=t.customer||{},d="border:1px solid #ffffff;padding:14px;font-family:Arial,sans-serif;font-size:11px;",p="padding:7px 9px;border:1px solid #bbb;background:#f0f0f0;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;",c="padding:7px 9px;border:1px solid #ddd;font-family:Arial,sans-serif;font-size:11px;vertical-align:top;",y=p+"text-align:left;",x=p+"text-align:center;",g=p+"text-align:right;",n=c+"text-align:left;",r=c+"text-align:center;",v=c+"text-align:right;",A=[a.name?`<strong>${s(a.name)}</strong>`:"",a.company?s(a.company):"",a.address?s(a.address).replace(/\n/g,"<br>"):"",a.email?s(a.email):"",a.phone?s(a.phone):""].filter(Boolean).join("<br>"),S=(t.items||[]).map(f=>`
      <tr>
        <td style="${n}">${s(f.productId||"")}</td>
        <td style="${n}">
          ${s(f.name)}
          ${f.variant?`<br><span style="font-size:10px;color:#555;">${s(f.variant)}</span>`:""}
        </td>
        <td style="${r}">${f.quantity}</td>
        <td style="${r}">-</td>
        <td style="${v}">${l(f.unitPrice)}</td>
        <td style="${r}">0.00%</td>
        <td style="${r}">15.00%</td>
        <td style="${v}"><strong>${l(f.lineTotal)}</strong></td>
      </tr>`).join(""),C=a.notes||a.additionalDetails?`
      <div style="margin:8px 0;padding:10px 12px;background:#f9f9f9;border-left:3px solid #c00;font-family:Arial,sans-serif;font-size:11px;line-height:1.7;">
        ${a.additionalDetails?`<strong>Additional Details:</strong> ${s(a.additionalDetails).replace(/\n/g,"<br>")}<br>`:""}
        ${a.notes?`<strong>Notes:</strong> ${s(a.notes)}`:""}
      </div>`:"";var b=s(e.name||""),h=s(e.address||""),D=`
          <div class="bank-section" style="font-family: Arial, sans-serif; font-size: 11px;">
            <p style="font-family: Arial, sans-serif; font-size: 11px;"><strong style="font-family: Arial, sans-serif; font-size: 11px;">${b}</strong></p>
            <p style="font-family: Arial, sans-serif; font-size: 11px;">${h}</p>
            <p style="font-family: Arial, sans-serif; font-size: 11px;">Bank: Windhoek</p>
            <p style="font-family: Arial, sans-serif; font-size: 11px;">A/C#8001836801 Code: 486372</p>
          </div>`,T=`
          <div class="totals-container">
            <div></div>
            <div class="totals-right">
              <div class="totals-row" style="font-family: Arial, sans-serif; font-size: 11px;">
                <span class="totals-label" style="font-family: Arial, sans-serif; font-size: 11px;">Sub Total</span>
                <span class="totals-value" style="font-family: Arial, sans-serif; font-size: 11px;">N$${l(t.subtotal)}</span>
              </div>
              <div class="totals-row" style="font-family: Arial, sans-serif; font-size: 11px;">
                <span class="totals-label" style="font-family: Arial, sans-serif; font-size: 11px;">Discount @ 0.00%</span>
                <span class="totals-value" style="font-family: Arial, sans-serif; font-size: 11px;">-N$0.00</span>
              </div>
              <div class="totals-row" style="font-family: Arial, sans-serif; font-size: 11px;">
                <span class="totals-label" style="font-family: Arial, sans-serif; font-size: 11px;">VAT (Exclusive.)</span>
                <span class="totals-value" style="font-family: Arial, sans-serif; font-size: 11px;">${l(t.tax)}</span>
              </div>
              <div class="totals-row" style="font-family: Arial, sans-serif; font-size: 11px;">
                <span class="totals-label" style="font-family: Arial, sans-serif; font-size: 11px;">TAX </span>
                <span class="totals-value" style="font-family: Arial, sans-serif; font-size: 11px;">${l(t.subtotal-t.tax)}</span>
              </div>
              <div class="totals-row totals-total" style="font-family: Arial, sans-serif; font-size: 11px;">
                <span style="font-family: Arial, sans-serif; font-size: 11px;">TOTAL</span>
                <span class="totals-value" style="font-weight: bold; font-family: Arial, sans-serif; font-size: 11px;">N$${l(t.total)}</span>
              </div>
            </div>
          </div>`;return`
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
                <p style="font-family: Arial, sans-serif; font-size: 11px; font-weight: bold;">${b}</p>
                <p style="font-family: Arial, sans-serif; font-size: 11px;">${h}</p>
                <p style="font-family: Arial, sans-serif; font-size: 11px;">${e.phone?`Tel: ${s(e.phone)}`:""}</p>
                <p style="font-family: Arial, sans-serif; font-size: 11px;">${e.email?`Email: ${s(e.email)}`:""}</p>
              </div>
            </div>
            <div class="invoice-box">
              <div class="invoice-title" style="font-family: Arial, sans-serif; font-size: 16px;">Proforma Invoice</div>
              <div class="invoice-detail" style="font-family: Arial, sans-serif; font-size: 11px;"><span class="invoice-detail-label" style="font-family: Arial, sans-serif; font-size: 11px;">Document No:</span><span style="font-family: Arial, sans-serif; font-size: 11px;">${s(t.number)}</span></div>
              <div class="invoice-detail" style="font-family: Arial, sans-serif; font-size: 11px;"><span class="invoice-detail-label" style="font-family: Arial, sans-serif; font-size: 11px;">Date:</span><span style="font-family: Arial, sans-serif; font-size: 11px;">${i}</span></div>
              <div class="invoice-detail" style="font-family: Arial, sans-serif; font-size: 11px;"><span class="invoice-detail-label" style="font-family: Arial, sans-serif; font-size: 11px;">Expiry:</span><span style="font-family: Arial, sans-serif; font-size: 11px;">${o}</span></div>
            </div>
          </div>
          <div class="customer-grid">
            <div class="customer-box">
              <div class="customer-title" style="font-family: Arial, sans-serif; font-size: 11px; font-weight: bold;">Bill to:</div>
              <div class="customer-text" style="font-family: Arial, sans-serif; font-size: 11px;">${A||"Cash Customer"}</div>
            </div>
            <div class="customer-box">
              <div class="customer-title" style="font-family: Arial, sans-serif; font-size: 11px; font-weight: bold;">Deliver to:</div>
              <div class="customer-text" style="font-family: Arial, sans-serif; font-size: 11px;">${A||"Pick in Person"}</div>
            </div>
          </div>
          <div class="account-info">
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Account</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">${s(a.paymentMethod||a.accountType||"CASH")}</div></div>
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Your Ref</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">${s(a.company||a.additionalDetails||"-")}</div></div>
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Tax Exempt</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">N</div></div>
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Tax Ref</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">-</div></div>
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Sales Code</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">WEB QUOTE</div></div>
            <div class="account-field" style="font-family: Arial, sans-serif;"><div class="account-label" style="font-family: Arial, sans-serif; font-size: 11px;">Expiry</div><div class="account-value" style="font-family: Arial, sans-serif; font-size: 11px;">${o}</div></div>
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
              ${S}
            </tbody>
          </table>
          ${T}
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
          ${D}
        </div>
      </body>
      </html>
    `}return{validateEmail:u,validatePhone:z,createQuote:w,generateHTMLSummary:_,formatPrice:l,formatDate:m}})();
