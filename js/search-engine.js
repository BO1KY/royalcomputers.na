// Global search engine - handles both products and pages
window.SEARCH_ENGINE = (function() {
  // Helper function to calculate relevance score
  function getRelevanceScore(query, haystack) {
    const q = query.toLowerCase();
    const h = haystack.toLowerCase();
    let score = 0;
    
    // Exact match = highest score
    if (h === q) score += 1000;
    // Starts with = high score
    else if (h.startsWith(q)) score += 500;
    // Contains = medium score
    else if (h.includes(q)) score += 100;
    // Word includes = lower score
    else {
      const words = h.split(/\s+/);
      words.forEach(word => {
        if (word.includes(q)) score += 50;
      });
    }
    
    return score;
  }

  // Format price helper
  function formatPrice(n) {
    return 'N$\u202f' + n.toLocaleString('en-NA');
  }

  // Get minimum price from variants
  function getMinPrice(variants) {
    if (!variants || variants.length === 0) return 0;
    return Math.min(...variants.map(v => v.price));
  }

  return {
    // Search for products only
    searchProducts: function(query) {
      if (!query || query.trim().length < 1) return [];
      
      const q = query.toLowerCase();
      const products = window.PRODUCTS_DB || [];
      
      const results = products
        .map(product => {
          let score = 0;
          
          // Score by name match
          score += getRelevanceScore(q, product.name) * 3;
          
          // Score by category match
          score += getRelevanceScore(q, product.category) * 2;
          
          // Score by variant match
          if (product.variants) {
            product.variants.forEach(variant => {
              score += getRelevanceScore(q, variant.label);
            });
          }
          
          return { product, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => ({
          type: 'product',
          id: item.product.id,
          title: item.product.name,
          category: item.product.category,
          image: item.product.image,
          price: formatPrice(getMinPrice(item.product.variants)),
          minPrice: getMinPrice(item.product.variants),
          badge: item.product.badge,
          score: item.score
        }))
        .slice(0, 8); // Limit to 8 product results
      
      return results;
    },

    // Search for pages only
    searchPages: function(query) {
      if (!query || query.trim().length < 1) return [];
      
      const q = query.toLowerCase();
      const pages = window.PAGES_DB || [];
      
      const results = pages
        .map(page => {
          let score = 0;
          
          // Score by title
          score += getRelevanceScore(q, page.title) * 3;
          
          // Score by keywords
          if (page.keywords) {
            page.keywords.forEach(keyword => {
              score += getRelevanceScore(q, keyword) * 2;
            });
          }
          
          return { page, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => ({
          type: 'page',
          id: item.page.id,
          title: item.page.title,
          path: item.page.path,
          score: item.score
        }));
      
      return results;
    },

    // Search all (products and pages combined, prioritized)
    searchAll: function(query) {
      const productResults = this.searchProducts(query);
      const pageResults = this.searchPages(query);
      
      // Combine and sort by score, products first
      const combined = [
        ...productResults,
        ...pageResults
      ].sort((a, b) => b.score - a.score);
      
      return combined.slice(0, 10); // Limit total results to 10
    },

    // Get single product by ID (for navigation)
    getProductById: function(id) {
      const products = window.PRODUCTS_DB || [];
      return products.find(p => p.id === id);
    }
  };
})();
