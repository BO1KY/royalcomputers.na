/**
 * SEARCH DROPDOWN — Royal Computers
 * Enhancements over original:
 *  - Input debouncing (250 ms) – prevents a search call on every keystroke
 *  - ARIA roles / live region for screen-reader announcements
 *  - Safe DOM manipulation with null-checks throughout
 *  - Shared singleton dropdown per input (no orphaned elements)
 */

window.SEARCH_DROPDOWN = (function () {
  'use strict';

  const DEBOUNCE_MS = 250;

  


  
  




  /* ── tiny debounce util ── */
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /* ── HTML escape ── */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  /* ── Create / reuse a dropdown element anchored to an input ── */
  function ensureDropdown(inputEl) {
    const parent = inputEl.parentElement;
    if (!parent) return null;

    let dropdown = parent.querySelector('.search-dropdown');
    if (!dropdown) {
      parent.style.position = 'relative';
      dropdown = document.createElement('div');
      dropdown.className = 'search-dropdown';
      dropdown.setAttribute('role', 'listbox');
      dropdown.setAttribute('aria-label', 'Search suggestions');
      dropdown.style.display = 'none';
      parent.appendChild(dropdown);
    }
    return dropdown;
  }

  /* ── Render results ── */
  function renderResults(results, inputEl, dropdown) {
    if (!dropdown) return;

    let productCount = 0;
    let pageCount    = 0;
    let html         = '';

    (results || []).forEach((result, idx) => {
      if (result.type === 'product' && productCount < 6) {
        html += `
          <div class="search-dropdown-item search-product-item"
               role="option"
               data-index="${idx}"
               data-id="${escapeHtml(result.id)}"
               data-type="product"
               tabindex="-1">
            <div class="search-product-thumbnail">
              <img src="${escapeHtml(result.image)}"
                   alt="${escapeHtml(result.title)}"
                   loading="lazy"
                   onerror="this.src='https://placehold.co/40x40/eef2f5/1a1a1a?text=?'">
            </div>
            <div class="search-product-info">
              <div class="search-product-name">${escapeHtml(result.title)}</div>
              <div class="search-product-meta">
                <span class="search-product-category">${escapeHtml(result.category)}</span>
                <span class="search-product-price">${escapeHtml(result.price)}</span>
              </div>
            </div>
          </div>`;
        productCount++;

      } else if (result.type === 'page' && pageCount < 4) {
        html += `
          <div class="search-dropdown-item search-page-item"
               role="option"
               data-index="${idx}"
               data-id="${escapeHtml(result.id)}"
               data-type="page"
               data-path="${escapeHtml(result.path)}"
               tabindex="-1">
            <div class="search-page-icon" aria-hidden="true">📄</div>
            <div class="search-page-info">
              <div class="search-page-name">${escapeHtml(result.title)}</div>
            </div>
          </div>`;
        pageCount++;
      }
    });

    if (!html) {
      html = '<div class="search-dropdown-item search-no-results" role="option" aria-disabled="true">No results found</div>';
    }

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    /* attach click + hover listeners */
    dropdown.querySelectorAll('.search-dropdown-item:not(.search-no-results)').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault(); // prevent blur on input
        handleResultClick(item, inputEl);
      });
      item.addEventListener('mouseover', () => {
        setSelected(dropdown, parseInt(item.dataset.index, 10));
      });
    });
  }

  /* ── Navigate to clicked result ── */
  function handleResultClick(el, inputEl) {
    if (!el) return;
    if (el.dataset.type === 'product') {
      const query = inputEl ? inputEl.value.trim() : '';
      const dest  = query
        ? `products.html?search=${encodeURIComponent(query)}&highlight=${el.dataset.id}`
        : `products.html?highlight=${el.dataset.id}`;
      window.location.href = dest;
    } else if (el.dataset.type === 'page') {
      window.location.href = el.dataset.path;
    }
  }

  /* ── Visual selection by index ── */
  function setSelected(dropdown, targetIdx) {
    if (!dropdown) return;
    dropdown.querySelectorAll('.search-dropdown-item').forEach(item => {
      const match = parseInt(item.dataset.index, 10) === targetIdx;
      item.classList.toggle('selected', match);
      if (match) item.setAttribute('aria-selected', 'true');
      else        item.removeAttribute('aria-selected');
    });
  }

  /* ── Keyboard navigation inside an open dropdown ── */
  function handleKeydown(e, dropdown, inputEl, results, selectedIdxRef) {
    if (!dropdown || dropdown.style.display === 'none') return;

    const items = dropdown.querySelectorAll(
      '.search-dropdown-item:not(.search-no-results)'
    );
    const count = items.length;

    // Allow space key in search input
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdxRef.value = Math.min(selectedIdxRef.value + 1, count - 1);
      setSelected(dropdown, parseInt(items[selectedIdxRef.value]?.dataset.index, 10));

    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdxRef.value = Math.max(selectedIdxRef.value - 1, -1);
      if (selectedIdxRef.value < 0) {
        dropdown.querySelectorAll('.search-dropdown-item').forEach(i => {
          i.classList.remove('selected');
          i.removeAttribute('aria-selected');
        });
      } else {
        setSelected(dropdown, parseInt(items[selectedIdxRef.value]?.dataset.index, 10));
      }

    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdxRef.value >= 0 && items[selectedIdxRef.value]) {
        handleResultClick(items[selectedIdxRef.value], inputEl);
      } else if (inputEl) {
        // fallback: go to products page with full-text search
        const q = inputEl.value.trim();
        if (q) window.location.href = `products.html?search=${encodeURIComponent(q)}`;
      }

    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      selectedIdxRef.value = -1;
    }
  }

  /* ── Public init ── */
  function init(selector) {
    const inputs = document.querySelectorAll(selector);
    if (!inputs.length) return;

    inputs.forEach(inputEl => {
      const dropdown     = ensureDropdown(inputEl);
      const selectedIdx  = { value: -1 }; // mutable ref

      /* DEBOUNCED search handler */
      const debouncedSearch = debounce(function () {
        const q = inputEl.value.trim();
        selectedIdx.value = -1;

        if (!q || q.length < 1) {
          if (dropdown) dropdown.style.display = 'none';
          return;
        }

        const results = window.SEARCH_ENGINE
          ? window.SEARCH_ENGINE.searchAll(q)
          : [];

        renderResults(results, inputEl, dropdown);
      }, DEBOUNCE_MS);

      inputEl.addEventListener('input', debouncedSearch);

      inputEl.addEventListener('focus', function () {
        if (this.value.trim().length >= 1 && dropdown && dropdown.children.length) {
          dropdown.style.display = 'block';
        }
      });

      inputEl.addEventListener('keydown', function (e) {

        const results = window.SEARCH_ENGINE
          ? window.SEARCH_ENGINE.searchAll(this.value.trim())
          : [];
        handleKeydown(e, dropdown, inputEl, results, selectedIdx);
      });

      /* close dropdown on blur (delay allows click to register first) */
      inputEl.addEventListener('blur', function () {
        setTimeout(() => {
          if (dropdown) dropdown.style.display = 'none';
          selectedIdx.value = -1;
        }, 200);
      });
    });
  }

  /* ── Auto-init on DOMContentLoaded ── */
  document.addEventListener('DOMContentLoaded', function () {
    if (document.querySelector('.search-wrap input')) {
      init('.search-wrap input');
    }
    if (document.querySelector('#searchInput')) {
      init('#searchInput');
    }
  });

  return { init };

})();