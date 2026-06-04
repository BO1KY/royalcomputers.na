window.INFINITY_SCROLL=(function(){"use strict";const s="infinityScrollContainer",p="loadingIndicator";let r=null,c=null,i=null;function d(t){return"N$\u202F"+Number(t).toLocaleString("en-NA",{minimumFractionDigits:2,maximumFractionDigits:2})}function u(){return!window.PRODUCTS_DB||!Array.isArray(window.PRODUCTS_DB)?(console.error("[Random Products] PRODUCTS_DB not found"),[]):window.PRODUCTS_DB}function P(t){const n=[...t];for(let o=n.length-1;o>0;o--){const e=Math.floor(Math.random()*(o+1));[n[o],n[e]]=[n[e],n[o]]}return n}function h(t){const n=u();return n.length===0?[]:P(n).slice(0,Math.min(t,n.length))}function R(t){const n=t.variants[0]||{},o=n.image||t.image||"https://via.placeholder.com/240x180?text=Product",e=t._sale||null,l=t.badge||null,g=t.oldPrice||null,D=e?e.sale_price:n.price||0,I=g?'<span class="product-old-price">'+d(g)+"</span>":"",T=l?'<span class="product-badge '+l+'">'+l+"</span>":"";return`
      <div class="product-item-scroll">
        <div class="product-image-scroll" style="position: relative;">
          <img src="${o}" alt="${t.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/240x180?text=No+Image'">
          ${T}
        </div>
        <div class="product-info-scroll">
          <p class="product-category-scroll">${t.category}</p>
          <h3 class="product-name-scroll">${t.name}</h3>
          <p class="product-price-scroll">${d(D)}${I}</p>
          <button class="add-to-cart-btn-scroll" data-product-id="${t.id}" onclick="addToCart('${t.id}', event)">
            Add to Cart
          </button>
        </div>
      </div>
    `}function f(t,n){if(n.preventDefault(),n.stopPropagation(),!window.CART){console.error("[Random Products] CART module not found");return}const e=u().find(l=>l.id===t);if(!e){console.error("[Random Products] Product not found:",t);return}window.CART.add(e,0)}function a(){if(!r)return;const t=h(10);if(t.length===0){r.innerHTML='<p style="color: var(--text-muted); text-align: center; padding: 40px;">No products available.</p>';return}const n=t.map(o=>R(o)).join("");r.innerHTML=n,r.querySelectorAll(".add-to-cart-btn-scroll").forEach(o=>{o.addEventListener("click",function(e){const l=this.getAttribute("data-product-id");f(l,e)})}),console.log(`[Random Products] Displayed ${t.length} random products`)}function m(){if(r=document.getElementById(s),c=document.getElementById(p),!r){console.error(`[Random Products] Container with ID "${s}" not found`);return}c&&(c.style.display="none");const t=setInterval(()=>{window.PRODUCTS_DB&&Array.isArray(window.PRODUCTS_DB)&&(clearInterval(t),a(),i=setInterval(a,24e4),console.log("[Random Products] Initialized successfully (refresh every 4 min)"))},100);setTimeout(()=>clearInterval(t),5e3)}return window.addToCart=f,document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m(),{refresh:a,reset:function(){r&&(r.innerHTML=""),i&&clearInterval(i)}}})();
