(function() {
  'use strict';
  var phoneNumber = '+264813631483';
  var message = 'Hi! I have a question about your products.';
  var waUrl = 'https://wa.me/' + phoneNumber.replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(message);

  var css = [
    '#rcWhatsappWidget { position: fixed; bottom: 24px; right: 24px; z-index: 99999; display: flex; align-items: center; gap: 8px; cursor: pointer; }',
    '#rcWhatsappWidget .wa-bubble { background: #25D366; color: #fff; padding: 8px 16px; border-radius: 20px 20px 20px 4px; font-size: 13px; font-weight: 600; font-family: "DM Sans", sans-serif; box-shadow: 0 2px 12px rgba(37,211,102,0.3); opacity: 0; transform: translateX(10px); transition: all 0.3s ease; pointer-events: none; white-space: nowrap; }',
    '#rcWhatsappWidget:hover .wa-bubble { opacity: 1; transform: translateX(0); }',
    '#rcWhatsappWidget .wa-icon { width: 56px; height: 56px; background: #25D366; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(37,211,102,0.4); transition: transform 0.2s, box-shadow 0.2s; }',
    '#rcWhatsappWidget .wa-icon:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(37,211,102,0.5); }',
    '#rcWhatsappWidget .wa-icon svg { width: 28px; height: 28px; fill: #fff; }',
    '@media (max-width: 600px) { #rcWhatsappWidget { bottom: 16px; right: 16px; } #rcWhatsappWidget .wa-icon { width: 48px; height: 48px; } #rcWhatsappWidget .wa-icon svg { width: 24px; height: 24px; } #rcWhatsappWidget .wa-bubble { display: none; } }'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var widget = document.createElement('div');
  widget.id = 'rcWhatsappWidget';
  widget.setAttribute('role', 'button');
  widget.setAttribute('aria-label', 'Chat on WhatsApp');

  var bubble = document.createElement('div');
  bubble.className = 'wa-bubble';
  bubble.textContent = 'Chat with us';

  var icon = document.createElement('div');
  icon.className = 'wa-icon';
  icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.956 9.956 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.889 0-3.633-.656-5.008-1.756l-.36-.268-3.008.894.894-3.008-.268-.36A7.94 7.94 0 0 1 4 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/></svg>';

  widget.appendChild(bubble);
  widget.appendChild(icon);

  widget.addEventListener('click', function() {
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  });

  document.body.appendChild(widget);
})();
