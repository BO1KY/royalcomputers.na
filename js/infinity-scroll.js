window.INFINITY_SCROLL=(function(){"use strict";const d="infinityScrollContainer",g="loadingIndicator";let r=null,a=null,i=null;function s(n){return"N$\u202F"+Number(n).toLocaleString("en-NA",{minimumFractionDigits:2,maximumFractionDigits:2})}function u(){return!window.PRODUCTS_DB||!Array.isArray(window.PRODUCTS_DB)?(console.error("[Random Products] PRODUCTS_DB not found"),[]):window.PRODUCTS_DB}function v(n){const t=[...n];for(let o=t.length-1;o>0;o--){const e=Math.floor(Math.random()*(o+1));[t[o],t[e]]=[t[e],t[o]]}return t}function h(n){const t=u();return t.length===0?[]:v(t).slice(0,Math.min(n,t.length))}function w(n){const t=n.variants[0]||{},o=t.image||n.image||"https://via.placeholder.com/240x180?text=Product",e=n._sale||null,c=n.badge||null,f=n.oldPrice||null,y=e?e.sale_price:t.price||0,D=f?'<span class="product-old-price">'+s(f)+"</span>":"",P=c?'<span class="product-badge '+c+'">'+c+"</span>":"";return`
      <div class="product-item-scroll">
        <div class="product-image-scroll" style="position: relative;">
          <img src="${o}" alt="${n.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/240x180?text=No+Image'">
          ${P}
        </div>
        <div class="product-info-scroll">
          <p class="product-category-scroll">${n.category}</p>
          <h3 class="product-name-scroll">${n.name}</h3>
          <p class="product-price-scroll">${s(y)}${D}</p>
          <button class="add-to-cart-btn-scroll" data-product-id="${n.id}" onclick="addToCart('${n.id}', event)">
            Add to Cart
          </button>
        </div>
      </div>
    `}function p(n,t){if(t.preventDefault(),t.stopPropagation(),!window.CART){console.error("[Random Products] CART module not found");return}const o=u().find(e=>e.id===n);if(!o){console.error("[Random Products] Product not found:",n);return}window.CART.add(o,0)}function l(){if(!r)return;const n=h(12);if(n.length===0){r.innerHTML='<p style="color: var(--text-muted); text-align: center; padding: 40px;">No products available.</p>';return}const t=n.map(o=>w(o)).join("");r.innerHTML=t,r.querySelectorAll(".add-to-cart-btn-scroll").forEach(o=>{o.addEventListener("click",function(e){const c=this.getAttribute("data-product-id");p(c,e)})}),console.log(`[Random Products] Displayed ${n.length} random products`)}function m(){if(r=document.getElementById(d),a=document.getElementById(g),!r){console.error(`[Random Products] Container with ID "${d}" not found`);return}a&&(a.style.display="none");const n=setInterval(()=>{window.PRODUCTS_DB&&Array.isArray(window.PRODUCTS_DB)&&(clearInterval(n),l(),i=setInterval(l,24e4),console.log("[Random Products] Initialized successfully (refresh every 4 min)"))},100);setTimeout(()=>clearInterval(n),5e3)}return window.addToCart=p,document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m(),{refresh:l,reset:function(){r&&(r.innerHTML=""),i&&clearInterval(i)}}})();
