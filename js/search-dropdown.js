window.SEARCH_DROPDOWN=(function(){"use strict";function p(t,a){let e;return function(...n){clearTimeout(e),e=setTimeout(()=>t.apply(this,n),a)}}function d(t){const a=document.createElement("div");return a.textContent=String(t||""),a.innerHTML}function h(t){const a=t.parentElement;if(!a)return null;let e=a.querySelector(".search-dropdown");return e||(a.style.position="relative",e=document.createElement("div"),e.className="search-dropdown",e.setAttribute("role","listbox"),e.setAttribute("aria-label","Search suggestions"),e.style.display="none",a.appendChild(e)),e}function v(t,a,e){if(!e)return;let n=0,s=0,i="";(t||[]).forEach((r,o)=>{r.type==="product"&&n<6?(i+=`
          <div class="search-dropdown-item search-product-item"
               role="option"
               data-index="${o}"
               data-id="${d(r.id)}"
               data-type="product"
               tabindex="-1">
            <div class="search-product-thumbnail">
              <img src="${d(r.image)}"
                   alt="${d(r.title)}"
                   loading="lazy"
                   onerror="this.src='https://placehold.co/40x40/eef2f5/1a1a1a?text=?'">
            </div>
            <div class="search-product-info">
              <div class="search-product-name">${d(r.title)}</div>
              <div class="search-product-meta">
                <span class="search-product-category">${d(r.category)}</span>
                <span class="search-product-price">${d(r.price)}</span>
              </div>
            </div>
          </div>`,n++):r.type==="page"&&s<4&&(i+=`
          <div class="search-dropdown-item search-page-item"
               role="option"
               data-index="${o}"
               data-id="${d(r.id)}"
               data-type="page"
               data-path="${d(r.path)}"
               tabindex="-1">
            <div class="search-page-icon" aria-hidden="true">\u{1F4C4}</div>
            <div class="search-page-info">
              <div class="search-page-name">${d(r.title)}</div>
            </div>
          </div>`,s++)}),i||(i='<div class="search-dropdown-item search-no-results" role="option" aria-disabled="true">No results found</div>'),e.innerHTML=i,e.style.display="block",e.querySelectorAll(".search-dropdown-item:not(.search-no-results)").forEach(r=>{r.addEventListener("mousedown",o=>{o.preventDefault(),u(r,a)}),r.addEventListener("mouseover",()=>{l(e,parseInt(r.dataset.index,10))})})}function u(t,a){if(t)if(t.dataset.type==="product"){const e=a?a.value.trim():"",n=e?`products.html?search=${encodeURIComponent(e)}&highlight=${t.dataset.id}`:`products.html?highlight=${t.dataset.id}`;window.location.href=n}else t.dataset.type==="page"&&(window.location.href=t.dataset.path)}function l(t,a){t&&t.querySelectorAll(".search-dropdown-item").forEach(e=>{const n=parseInt(e.dataset.index,10)===a;e.classList.toggle("selected",n),n?e.setAttribute("aria-selected","true"):e.removeAttribute("aria-selected")})}function f(t,a,e,n,s){if(!a||a.style.display==="none")return;const i=a.querySelectorAll(".search-dropdown-item:not(.search-no-results)"),r=i.length;if(t.key==="ArrowDown")t.preventDefault(),s.value=Math.min(s.value+1,r-1),l(a,parseInt(i[s.value]?.dataset.index,10));else if(t.key==="ArrowUp")t.preventDefault(),s.value=Math.max(s.value-1,-1),s.value<0?a.querySelectorAll(".search-dropdown-item").forEach(o=>{o.classList.remove("selected"),o.removeAttribute("aria-selected")}):l(a,parseInt(i[s.value]?.dataset.index,10));else if(t.key==="Enter"){if(t.preventDefault(),s.value>=0&&i[s.value])u(i[s.value],e);else if(e){const o=e.value.trim();o&&(window.location.href=`products.html?search=${encodeURIComponent(o)}`)}}else t.key==="Escape"&&(a.style.display="none",s.value=-1)}function c(t){const a=document.querySelectorAll(t);a.length&&a.forEach(e=>{const n=h(e),s={value:-1},i=p(function(){const r=e.value.trim();if(s.value=-1,!r||r.length<1){n&&(n.style.display="none");return}const o=window.SEARCH_ENGINE?window.SEARCH_ENGINE.searchAll(r):[];v(o,e,n)},250);e.addEventListener("input",i),e.addEventListener("focus",function(){this.value.trim().length>=1&&n&&n.children.length&&(n.style.display="block")}),e.addEventListener("keydown",function(r){const o=window.SEARCH_ENGINE?window.SEARCH_ENGINE.searchAll(this.value.trim()):[];f(r,n,e,o,s)}),e.addEventListener("blur",function(){setTimeout(()=>{n&&(n.style.display="none"),s.value=-1},200)})})}return document.addEventListener("DOMContentLoaded",function(){document.querySelector(".search-wrap input")&&c(".search-wrap input"),document.querySelector("#searchInput")&&c("#searchInput")}),{init:c}})();
