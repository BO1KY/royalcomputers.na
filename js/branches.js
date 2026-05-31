/**
 * ROYAL COMPUTERS - BRANCHES DATA MODULE
 * Manages all company branch information for quotes and checkouts
 */

window.BRANCHES = (function () {
  'use strict';

  // All company branches with complete details
  const branchesData = [
    {
      id: 'branch-001',
      name: 'Royal Computers - Gustav Voigts Centre, Windhoek',
      city: 'Windhoek',
      address: 'GF Shop 12 Gustav Voigts Center, Independence Ave',
      phone: '061228179',
      whatsapp: '+264813631483',
      email: 'windhoek@netmac.co.za',
      coordinates: { lat: -22.5579, lng: 17.0832 },
      hours: 'Mon-Fri: 08:30 - 17:30 | Sat: 08:30 - 13:00 | Sun: 09:00 - 13:00',
      image: '',
      isHeadquarters: true,
      description: 'Main headquarters store with complete inventory and service center'
    },
    {
      id: 'branch-002',
      name: 'Royal Computers - Swakopmund',
      city: 'Swakopmund',
      address: 'Shop 03 Minette Court Sam Nujoma Street',
      phone: '064406914',
      whatsapp: '+264818031126',
      email: 'swakop@netmec.co.za',
      coordinates: { lat: -22.6797, lng: 14.5301 },
      hours: 'Mon-Fri: 08:30 - 17:30 | Sat: 08:30 - 13:00 | Sun: Closed ',
      image: '',
      isHeadquarters: false,
      description: 'Coastal branch serving the Erongo region'
    },
    {
      id: 'branch-003',
      name: 'Royal Computers - Oshakati',
      city: 'Oshakati',
      address: 'Shop 42 Etango Complex',
      phone: '065227045',
      whatsapp: '+264816540001',
      email: 'oshakati@netmac.co.za',
      coordinates: { lat: -17.3041, lng: 15.7039 },
      hours: 'Mon-Fri: 08:30 - 17:30 | Sat: 08:30 - 13:00 | Sun: Closed',
      image: '',
      isHeadquarters: false,
      description: 'Northern branch serving Oshana and Kunene regions'
    },
    {
      id: 'branch-004',
      name: 'Royal Computers - Walvis Bay',
      city: 'Walvis Bay',
      address: '111 Hage Geingob Street Office C',
      phone: '064200453',
      whatsapp: '+264816413220',
      email: 'walvisbay@netmac.co.za',
      coordinates: { lat: -22.9976, lng: 14.5057 },
      hours: 'Mon-Fri: 08:00 - 17:30 | Sat: 09:00 - 13:00 | Sun: Closed',
      image: '',
      isHeadquarters: false,
      description: 'Port city branch with specialized logistics support'
    },
    {
      id: 'branch-005',
      name: 'Royal Computers - Tsumeb',
      city: 'Tsumeb',
      address: 'Shop 03 Tsumeb Shopping Mall',
      phone: '+264818163936',
      whatsapp: '+26481816396',
      email: 'tsumeb@netmac.co.za',
      coordinates: { lat: -19.2505, lng: 16.9149 },
      hours: 'Mon-Fri: 08:30 - 17:30 | Sat: 09:00 - 13:30 | Sun: Closed',
      image: '',
      isHeadquarters: false,
      description: 'Mining region branch serving Otjozondjupa'
    },
    {
      id: 'branch-006',
      name: 'Royal Computers - Grove Mall, Windhoek',
      city: 'Windhoek',
      address: 'GF Shop 256 Grove Mall',
      phone: '061242938',
      whatsapp: '+264818031124',
      email: 'grove@netmac.co.za',
      coordinates: { lat: -22.5481, lng: 17.0654 },
      hours: 'Mon-Fri: 09:00 - 19:00 | Sat: 09:00 - 17:00 | Sun: 10:00 - 15:00',
      image: '',
      isHeadquarters: false,
      description: 'Mall branch at Grove Mall of Namibia'
    }
  ];

  // Company information for quotes
  const companyInfo = {
    name: 'ROYAL COMPUTERS ',
    logo: 'ROYAL PICS/royal logo.png',
    website: 'www.netmac.co.za',
    businessReg: 'P O BOX 6687, AUSSPANPLATZ, Windhoek',
    taxId: 'Tax ID: 4686005015',
    tagline: 'Leading the way in digital lifestyle'
  };

  /**
   * Get all branches
   * @returns {Array} Array of all branch objects
   */
  function getAllBranches() {
    return branchesData;
  }

  /**
   * Get branch by ID
   * @param {string} branchId - The branch ID
   * @returns {Object|null} Branch object or null if not found
   */
  function getBranchById(branchId) {
    return branchesData.find(branch => branch.id === branchId) || null;
  }

  /**
   * Get default branch (headquarters)
   * @returns {Object} Headquarters branch object
   */
  function getDefaultBranch() {
    return branchesData.find(branch => branch.isHeadquarters) || branchesData[0];
  }

  /**
   * Get branch by city name
   * @param {string} cityName - The city name
   * @returns {Object|null} Branch object or null if not found
   */
  function getBranchByCity(cityName) {
    return branchesData.find(
      branch => branch.city.toLowerCase() === cityName.toLowerCase()
    ) || null;
  }

  /**
   * Format branch info for display
   * @param {Object} branch - Branch object
   * @returns {string} Formatted branch info string
   */
  function formatBranchInfo(branch) {
    if (!branch) return '';
    return `${branch.name}\n${branch.address}\nPhone: ${branch.phone}\nEmail: ${branch.email}\nHours: ${branch.hours}`;
  }

  /**
   * Get company information
   * @returns {Object} Company info object
   */
  function getCompanyInfo() {
    return companyInfo;
  }

  /**
   * Format company header for quote
   * @returns {string} HTML formatted company header
   */
  function getCompanyHeader() {
    return `
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="font-size: 22px; font-weight: 700; margin: 0 0 4px 0; color: #e5383b;">
          ${companyInfo.name}
        </h2>
        <p style="font-size: 12px; color: #6b7280; margin: 4px 0; letter-spacing: 0.5px;">
          ${companyInfo.tagline}
        </p>
        <p style="font-size: 11px; color: #9ca3af; margin: 8px 0 0 0;">
          ${companyInfo.businessReg} | ${companyInfo.taxId}
        </p>
      </div>
    `;
  }

  /**
   * Get branch details section for quote
   * @param {Object} branch - Branch object
   * @returns {string} HTML formatted branch details
   */
  function getBranchDetailsSection(branch) {
    if (!branch) branch = getDefaultBranch();

    return `
      <div style="background: #f8f8f9; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0; color: #e5383b;">
          Collection Branch
        </h3>
        <div style="font-size: 13px; line-height: 1.6; color: #1a1a1a;">
          <p style="margin: 0 0 8px 0;"><strong>${branch.name}</strong></p>
          <p style="margin: 0 0 4px 0;">${branch.address}</p>
          <p style="margin: 0 0 4px 0;"><strong>Phone:</strong> <a href="tel:${branch.phone}" style="color: #e5383b; text-decoration: none;">${branch.phone}</a></p>
          <p style="margin: 0 0 4px 0;"><strong>Email:</strong> <a href="mailto:${branch.email}" style="color: #e5383b; text-decoration: none;">${branch.email}</a></p>
          <p style="margin: 0;"><strong>Hours:</strong> ${branch.hours}</p>
        </div>
      </div>
    `;
  }

  /**
   * Get branch option HTML for select dropdown
   * @returns {string} HTML option tags for all branches
   */
  function getBranchOptionsHTML() {
    return branchesData.map(branch =>
      `<option value="${branch.id}" ${branch.isHeadquarters ? 'selected' : ''}>
        ${branch.name} (${branch.city})
      </option>`
    ).join('');
  }

  /**
   * Validate branch selection
   * @param {string} branchId - Branch ID to validate
   * @returns {boolean} True if branch ID is valid
   */
  function isValidBranch(branchId) {
    return branchesData.some(branch => branch.id === branchId);
  }

  /**
   * Save selected branch to localStorage
   * @param {string} branchId - Branch ID to save
   */
  function saveBranchSelection(branchId) {
    if (isValidBranch(branchId)) {
      localStorage.setItem('royalquote_selectedbranch', branchId);
    }
  }

  /**
   * Get saved branch selection from localStorage
   * @returns {Object} Saved branch object or default branch
   */
  function getSavedBranchSelection() {
    const branchId = localStorage.getItem('royalquote_selectedbranch');
    if (branchId && isValidBranch(branchId)) {
      return getBranchById(branchId);
    }
    return getDefaultBranch();
  }

  // Public API
  return {
    getAllBranches,
    getBranchById,
    getDefaultBranch,
    getBranchByCity,
    formatBranchInfo,
    getCompanyInfo,
    getCompanyHeader,
    getBranchDetailsSection,
    getBranchOptionsHTML,
    isValidBranch,
    saveBranchSelection,
    getSavedBranchSelection
  };
})();
