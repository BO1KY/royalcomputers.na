(function() {
  'use strict';

  window.PRODUCT_FILTERS = (function() {
    let activeFilters = { categories: [], priceMin: 0, priceMax: Infinity, search: '' };
    let onFilterChange = null;

    function getCategories() {
      const products = window.PRODUCTS_DB || [];
      const cats = new Set(products.map(p => p.category));
      return Array.from(cats).sort();
    }

    function getPriceRange() {
      const products = window.PRODUCTS_DB || [];
      let min = Infinity, max = 0;
      products.forEach(p => {
        (p.variants || []).forEach(v => {
          if (v.price < min) min = v.price;
          if (v.price > max) max = v.price;
        });
      });
      return { min: Math.floor(min), max: Math.ceil(max) };
    }

    function filter(products) {
      return products.filter(p => {
        if (activeFilters.search) {
          const q = activeFilters.search.toLowerCase();
          const match = p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            (p.variants || []).some(v => v.label.toLowerCase().includes(q));
          if (!match) return false;
        }
        if (activeFilters.categories.length > 0) {
          if (!activeFilters.categories.includes(p.category)) return false;
        }
        const minPrice = getMinPrice(p);
        if (minPrice < activeFilters.priceMin || minPrice > activeFilters.priceMax) return false;
        return true;
      });
    }

    function getMinPrice(p) {
      return Math.min(...(p.variants || []).map(v => v.price));
    }

    function setFilters(filters) {
      for (var key in filters) {
        if (filters.hasOwnProperty(key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
          activeFilters[key] = filters[key];
        }
      }
      if (onFilterChange) onFilterChange(getActiveFilters());
    }

    function getActiveFilters() { return { ...activeFilters }; }
    function resetFilters() {
      const range = getPriceRange();
      activeFilters = { categories: [], priceMin: range.min, priceMax: range.max, search: '' };
      if (onFilterChange) onFilterChange(getActiveFilters());
    }
    function onChange(cb) { onFilterChange = cb; }

    function renderFilterPanel(container) {
      const cats = getCategories();
      const range = getPriceRange();
      if (!activeFilters.priceMax) {
        activeFilters.priceMin = range.min;
        activeFilters.priceMax = range.max;
      }
      container.innerHTML = `
        <div class="filter-panel">
          <div class="filter-active-tags" id="filterActiveTags"></div>
          <div class="filter-group">
            <div class="filter-group-title">Category</div>
            <div id="filterCategories">${cats.map(c => `
              <span class="filter-chip${activeFilters.categories.includes(c) ? ' active' : ''}" data-cat="${c}">${c}</span>
            `).join('')}</div>
          </div>
          <div class="filter-group">
            <div class="filter-group-title">Price Range (N$)</div>
            <div class="filter-price-range">
              <input type="number" id="filterPriceMin" placeholder="Min" value="${activeFilters.priceMin}" min="${range.min}" max="${range.max}">
              <span>—</span>
              <input type="number" id="filterPriceMax" placeholder="Max" value="${activeFilters.priceMax >= range.max ? '' : activeFilters.priceMax}" min="${range.min}" max="${range.max}">
            </div>
          </div>
          <button class="btn-reset-filters active" id="filterResetBtn" style="width:100%;margin-top:12px;">Clear All Filters</button>
        </div>
      `;

      container.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
          const cat = this.dataset.cat;
          const idx = activeFilters.categories.indexOf(cat);
          if (idx >= 0) {
            activeFilters.categories.splice(idx, 1);
            this.classList.remove('active');
          } else {
            activeFilters.categories.push(cat);
            this.classList.add('active');
          }
          updateActiveTags();
          if (onFilterChange) onFilterChange(getActiveFilters());
        });
      });

      const minInput = container.querySelector('#filterPriceMin');
      const maxInput = container.querySelector('#filterPriceMax');
      function onPriceChange() {
        activeFilters.priceMin = parseFloat(minInput.value) || range.min;
        activeFilters.priceMax = parseFloat(maxInput.value) || range.max;
        updateActiveTags();
        if (onFilterChange) onFilterChange(getActiveFilters());
      }
      minInput.addEventListener('change', onPriceChange);
      maxInput.addEventListener('change', onPriceChange);

      container.querySelector('#filterResetBtn').addEventListener('click', function() {
        const range2 = getPriceRange();
        activeFilters.categories = [];
        activeFilters.priceMin = range2.min;
        activeFilters.priceMax = range2.max;
        container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        minInput.value = range2.min;
        maxInput.value = '';
        updateActiveTags();
        if (onFilterChange) onFilterChange(getActiveFilters());
      });
    }

    function updateActiveTags() {
      const container = document.getElementById('filterActiveTags');
      if (!container) return;
      let tags = '';
      activeFilters.categories.forEach(c => {
        tags += `<span class="filter-tag">${c} <button data-remove-cat="${c}">&times;</button></span>`;
      });
      const range = getPriceRange();
      if (activeFilters.priceMin > range.min || activeFilters.priceMax < range.max) {
        tags += `<span class="filter-tag">N$${activeFilters.priceMin} - N$${activeFilters.priceMax >= range.max ? '∞' : activeFilters.priceMax} <button id="removePriceFilter">&times;</button></span>`;
      }
      container.innerHTML = tags;
      container.querySelectorAll('[data-remove-cat]').forEach(btn => {
        btn.addEventListener('click', function() {
          const cat = this.dataset.removeCat;
          activeFilters.categories = activeFilters.categories.filter(c => c !== cat);
          document.querySelectorAll('.filter-chip').forEach(c => {
            if (c.dataset.cat === cat) c.classList.remove('active');
          });
          updateActiveTags();
          if (onFilterChange) onFilterChange(getActiveFilters());
        });
      });
      const removePrice = container.querySelector('#removePriceFilter');
      if (removePrice) {
        removePrice.addEventListener('click', function() {
          const range2 = getPriceRange();
          activeFilters.priceMin = range2.min;
          activeFilters.priceMax = range2.max;
          const minInput = document.getElementById('filterPriceMin');
          const maxInput = document.getElementById('filterPriceMax');
          if (minInput) minInput.value = range2.min;
          if (maxInput) maxInput.value = '';
          updateActiveTags();
          if (onFilterChange) onFilterChange(getActiveFilters());
        });
      }
    }

    return {
      getCategories,
      getPriceRange,
      filter,
      setFilters,
      getActiveFilters,
      resetFilters,
      onChange,
      renderFilterPanel,
      updateActiveTags
    };
  })();
})();
