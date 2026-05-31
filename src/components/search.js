export function initSearchAndFilter(issues) {
  const searchInput = document.getElementById('issue-search-input');
  const samplesGrid = document.querySelector('.samples-grid');
  const countDisplay = document.getElementById('issues-count-display');
  const activeFiltersContainer = document.getElementById('active-filters');
  const sidebarPreviewContainer = document.querySelector('.hero-articles-preview');
  const topicCards = document.querySelectorAll('.topic-card');
  
  // Dynamically calculate and update topic counts
  const topicCounts = {};
  issues.forEach(issue => {
    const topic = issue.category.trim();
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  });

  topicCards.forEach(card => {
    const topicKey = card.getAttribute('data-topic') || card.querySelector('.topic-name').textContent.trim();
    const countEl = card.querySelector('.topic-count');
    if (countEl) {
      const count = topicCounts[topicKey] || topicCounts[card.querySelector('.topic-name').textContent.trim()] || 0;
      countEl.textContent = `${count} Issues`;
    }
  });

  // Update total article count
  const sectionSubtitle = document.querySelector('.section-subtitle');
  if (sectionSubtitle) {
    sectionSubtitle.innerHTML = `8 Core Topics &middot; ${issues.length} Articles`;
  }
  
  let activeCategory = null;
  let searchQuery = '';
  let searchTimeout = null;

  // Render Issues in the grid
  function renderIssuesGrid() {
    if (!samplesGrid) return;
    
    // Filter issues based on active category and search query
    const filtered = issues.filter(issue => {
      const matchesCategory = !activeCategory || 
        issue.category.toLowerCase().trim() === activeCategory.toLowerCase().trim() ||
        (activeCategory.toLowerCase() === 'money & finance' && issue.category.toLowerCase() === 'money') ||
        (activeCategory.toLowerCase() === 'personality & self' && issue.category.toLowerCase() === 'personality') ||
        (activeCategory.toLowerCase() === 'identity & society' && issue.category.toLowerCase() === 'identity') ||
        (activeCategory.toLowerCase() === 'growth & purpose' && issue.category.toLowerCase() === 'growth');

      const matchesSearch = !searchQuery || 
        issue.title.toLowerCase().includes(searchQuery) ||
        issue.category.toLowerCase().includes(searchQuery) ||
        issue.excerpt.toLowerCase().includes(searchQuery) ||
        issue.content.toLowerCase().includes(searchQuery);

      return matchesCategory && matchesSearch;
    });

    // Update count
    if (countDisplay) {
      countDisplay.textContent = `${filtered.length} Issue${filtered.length === 1 ? '' : 's'} Shown`;
    }

    // Render active category badge
    if (activeFiltersContainer) {
      if (activeCategory || searchQuery) {
        let badgeHtml = '';
        if (activeCategory) {
          badgeHtml += `<span class="filter-badge">Category: <strong>${activeCategory}</strong> <span class="clear-badge-x" id="clear-cat-filter">&times;</span></span>`;
        }
        if (searchQuery) {
          badgeHtml += `<span class="filter-badge">Search: <strong>"${searchQuery}"</strong> <span class="clear-badge-x" id="clear-search-filter">&times;</span></span>`;
        }
        badgeHtml += `<button class="clear-all-btn" id="clear-all-filters">Clear All</button>`;
        activeFiltersContainer.innerHTML = badgeHtml;
        activeFiltersContainer.style.display = 'flex';

        // Bind clear events
        const clearCat = activeFiltersContainer.querySelector('#clear-cat-filter');
        if (clearCat) clearCat.addEventListener('click', () => { 
          if (window.trackEvent) window.trackEvent('CLEAR_FILTER', `Cleared category filter: ${activeCategory}`);
          activeCategory = null; 
          runFilter(); 
        });
        
        const clearSearch = activeFiltersContainer.querySelector('#clear-search-filter');
        if (clearSearch) clearSearch.addEventListener('click', () => { 
          if (window.trackEvent) window.trackEvent('CLEAR_SEARCH', `Cleared search query: "${searchQuery}"`);
          if (searchInput) searchInput.value = '';
          searchQuery = ''; 
          runFilter(); 
        });

        const clearAll = activeFiltersContainer.querySelector('#clear-all-filters');
        if (clearAll) clearAll.addEventListener('click', () => {
          if (window.trackEvent) window.trackEvent('CLEAR_ALL_FILTERS', `Cleared all search and category filters`);
          activeCategory = null;
          searchQuery = '';
          if (searchInput) searchInput.value = '';
          runFilter();
        });
      } else {
        activeFiltersContainer.innerHTML = '';
        activeFiltersContainer.style.display = 'none';
      }
    }

    // Render HTML
    if (filtered.length === 0) {
      samplesGrid.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 8px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
          <h3>Hakuna kitu hapa!</h3>
          <p>We couldn't find any issues matching your active search or filters. Try clearing them or looking for topics like "Money", "Mtaa", "Introvert", or "Grief".</p>
          <button class="masthead-cta" id="empty-state-reset" style="margin-top: 16px;">View All Issues</button>
        </div>
      `;
      samplesGrid.classList.add('empty-state-active');
      const resetBtn = samplesGrid.querySelector('#empty-state-reset');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (window.trackEvent) window.trackEvent('RESET_EMPTY_STATE', `Clicked reset button on empty search state`);
          activeCategory = null;
          searchQuery = '';
          if (searchInput) searchInput.value = '';
          runFilter();
        });
      }
      return;
    }

    samplesGrid.classList.remove('empty-state-active');
    samplesGrid.innerHTML = filtered.map(issue => `
      <div class="sample-card" data-id="${issue.id}">
        <div class="sample-card-top">
          <span class="sample-category">${issue.category}</span>
          <h3 class="sample-title">${issue.title}</h3>
          <p class="sample-excerpt">${issue.excerpt}</p>
        </div>
        <div class="sample-read">Read Issue &rarr;</div>
      </div>
    `).join('');

    // Bind click listeners directly
    samplesGrid.querySelectorAll('.sample-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        if (window.openIssueReader) {
          window.openIssueReader(id, 'Recent Issues Grid');
        }
      });
    });

    // Trigger reveal fade-in animation
    setTimeout(() => {
      samplesGrid.querySelectorAll('.sample-card').forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    }, 50);
  }

  // Filter implementation
  function runFilter() {
    renderIssuesGrid();
    const header = document.querySelector('.samples-section');
    if (header && (activeCategory || searchQuery)) {
      header.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Setup sidebar list
  function renderSidebarIssues() {
    if (!sidebarPreviewContainer) return;
    
    // Render top 5 newest issues in the hero sidebar
    const latestIssues = issues.slice(0, 5);
    
    sidebarPreviewContainer.innerHTML = `
      <div class="preview-label">Upcoming Issues</div>
      ${latestIssues.map(issue => `
        <div class="preview-item" data-id="${issue.id}">
          <div>
            <div class="preview-title">${issue.title}</div>
            <span class="preview-tag">${issue.category}</span>
          </div>
        </div>
      `).join('')}
    `;

    // Bind click listeners directly
    sidebarPreviewContainer.querySelectorAll('.preview-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        if (window.openIssueReader) {
          window.openIssueReader(id, 'Hero Sidebar');
        }
      });
    });
  }

  // Bind Text Search
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderIssuesGrid();
      
      // Debounce logging
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        if (searchQuery && window.trackEvent) {
          window.trackEvent('SEARCH_QUERY', `Searched for: "${searchQuery}"`);
        }
      }, 700);
    });
  }

  // Bind topic cards in "What We Cover" section
  topicCards.forEach(card => {
    card.addEventListener('click', () => {
      const topicName = card.querySelector('.topic-name').textContent.trim();
      activeCategory = topicName;
      
      // Log engagement
      if (window.trackEvent) {
        window.trackEvent('TOPIC_FILTER', `Clicked topic card: "${topicName}"`);
      }
      
      runFilter();
    });
  });

  // Initial loads
  renderIssuesGrid();
  renderSidebarIssues();

  return {
    refresh: () => {
      renderIssuesGrid();
      renderSidebarIssues();
    }
  };
}
