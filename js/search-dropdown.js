window.SEARCH_DROPDOWN=(function(){"use strict";function h(t,a){let e;return function(...r){clearTimeout(e),e=setTimeout(()=>t.apply(this,r),a)}}function c(t){const a=document.createElement("div");return a.textContent=String(t||""),a.innerHTML}function p(t){const a=t.parentElement;if(!a)return null;let e=a.querySelector(".search-dropdown");return e||(a.style.position="relative",e=document.createElement("div"),e.className="search-dropdown",e.setAttribute("role","listbox"),e.setAttribute("aria-label","Search suggestions"),e.style.display="none",a.appendChild(e)),e}function v(t,a,e){if(!e)return;let r=0,i=0,o="";(t||[]).forEach((n,s)=>{n.type==="product"&&r<6?(o+=`
          <div class="search-dropdown-item search-product-item"
               role="option"
               data-index="${s}"
               data-id="${c(n.id)}"
               data-type="product"
               tabindex="-1">
            <div class="search-product-thumbnail">
              <img src="${c(n.image)}"
                   alt="${c(n.title)}"
                   loading="lazy"
                   onerror="this.src='https://placehold.co/40x40/eef2f5/1a1a1a?text=?'">
            </div>
            <div class="search-product-info">
              <div class="search-product-name">${c(n.title)}</div>
              <div class="search-product-meta">
                <span class="search-product-category">${c(n.category)}</span>
                <span class="search-product-price">${c(n.price)}</span>
              </div>
            </div>
          </div>`,r++):n.type==="page"&&i<4&&(o+=`
          <div class="search-dropdown-item search-page-item"
               role="option"
               data-index="${s}"
               data-id="${c(n.id)}"
               data-type="page"
               data-path="${c(n.path)}"
               tabindex="-1">
            <div class="search-page-icon" aria-hidden="true">\u{1F4C4}</div>
            <div class="search-page-info">
              <div class="search-page-name">${c(n.title)}</div>
            </div>
          </div>`,i++)}),o||(o='<div class="search-dropdown-item search-no-results" role="option" aria-disabled="true">No results found</div>'),e.innerHTML=o,e.style.display="block",e.querySelectorAll(".search-dropdown-item:not(.search-no-results)").forEach(n=>{n.addEventListener("mousedown",s=>{s.preventDefault(),u(n,a)}),n.addEventListener("mouseover",()=>{l(e,parseInt(n.dataset.index,10))})})}function u(t,a){if(t)if(t.dataset.type==="product"){const e=a?a.value.trim():"",r=e?`products.html?search=${encodeURIComponent(e)}&highlight=${t.dataset.id}`:`products.html?highlight=${t.dataset.id}`;window.location.href=r}else t.dataset.type==="page"&&(window.location.href=t.dataset.path)}function l(t,a){t&&t.querySelectorAll(".search-dropdown-item").forEach(e=>{const r=parseInt(e.dataset.index,10)===a;e.classList.toggle("selected",r),r?e.setAttribute("aria-selected","true"):e.removeAttribute("aria-selected")})}function f(t,a,e,r,i){if(!a||a.style.display==="none")return;const o=a.querySelectorAll(".search-dropdown-item:not(.search-no-results)"),n=o.length;if(t.key==="ArrowDown")t.preventDefault(),i.value=Math.min(i.value+1,n-1),l(a,parseInt(o[i.value]?.dataset.index,10));else if(t.key==="ArrowUp")t.preventDefault(),i.value=Math.max(i.value-1,-1),i.value<0?a.querySelectorAll(".search-dropdown-item").forEach(s=>{s.classList.remove("selected"),s.removeAttribute("aria-selected")}):l(a,parseInt(o[i.value]?.dataset.index,10));else if(t.key==="Enter"){if(t.preventDefault(),i.value>=0&&o[i.value])u(o[i.value],e);else if(e){const s=e.value.trim();s&&(window.location.href=`products.html?search=${encodeURIComponent(s)}`)}}else t.key==="Escape"&&(a.style.display="none",i.value=-1)}function d(t){const a=document.querySelectorAll(t);a.length&&a.forEach(e=>{const r=p(e),i={value:-1},o=h(function(){const n=e.value.trim();if(i.value=-1,!n||n.length<1){r&&(r.style.display="none");return}const s=window.SEARCH_ENGINE?window.SEARCH_ENGINE.searchAll(n):[];v(s,e,r)},250);e.addEventListener("input",o),e.addEventListener("focus",function(){this.value.trim().length>=1&&r&&r.children.length&&(r.style.display="block")}),e.addEventListener("keydown",function(n){const s=window.SEARCH_ENGINE?window.SEARCH_ENGINE.searchAll(this.value.trim()):[];f(n,r,e,s,i)}),e.addEventListener("blur",function(){setTimeout(()=>{r&&(r.style.display="none"),i.value=-1},200)})})}return document.addEventListener("DOMContentLoaded",function(){document.querySelector(".search-wrap input")&&d(".search-wrap input"),document.querySelector("#searchInput")&&d("#searchInput")}),{init:d}})();
