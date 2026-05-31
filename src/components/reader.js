export function initReader(issues) {
  // Create reader container if not exists
  let readerEl = document.getElementById('article-reader-drawer');
  if (!readerEl) {
    readerEl = document.createElement('div');
    readerEl.id = 'article-reader-drawer';
    readerEl.className = 'reader-drawer';
    readerEl.innerHTML = `
      <div class="reader-overlay"></div>
      <div class="reader-content-panel">
        <div class="reader-progress-bar-container">
          <div class="reader-progress-bar" id="reader-progress"></div>
        </div>
        <div class="reader-header">
          <div class="reader-meta">
            <span class="reader-issue-num" id="reader-num">#000</span>
            <span class="reader-dot">·</span>
            <span class="reader-category" id="reader-cat">Category</span>
            <span class="reader-dot">·</span>
            <span class="reader-date" id="reader-date-text">Date</span>
          </div>
          <div class="reader-controls">
            <div class="font-sizer">
              <button class="size-btn btn-sm" data-size="small">A-</button>
              <button class="size-btn btn-md active" data-size="medium">A</button>
              <button class="size-btn btn-lg" data-size="large">A+</button>
            </div>
            <button class="reader-close-btn" id="reader-close" aria-label="Close reader">&times;</button>
          </div>
        </div>
        <div class="reader-scroll-area" id="reader-scroll">
          <h1 class="reader-title" id="reader-title-text">Issue Title</h1>
          <div class="reader-body font-size-medium" id="reader-body-content">
            <!-- Article content will load here -->
          </div>
          <div class="reader-question-box">
            <span class="question-icon">?</span>
            <div class="question-label">One Honest Question to Sit With</div>
            <p class="question-text" id="reader-question-text">The question goes here.</p>
          </div>
          <div class="reader-nav-footer">
            <button class="nav-btn prev" id="reader-prev-btn">
              <span class="nav-arrow">←</span>
              <div class="nav-btn-text">
                <span>Previous Issue</span>
                <strong id="reader-prev-title">Issue Title</strong>
              </div>
            </button>
            <button class="nav-btn next" id="reader-next-btn">
              <div class="nav-btn-text" style="text-align: right;">
                <span>Next Issue</span>
                <strong id="reader-next-title">Issue Title</strong>
              </div>
              <span class="nav-arrow">→</span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(readerEl);
  }

  const overlay = readerEl.querySelector('.reader-overlay');
  const closeBtn = readerEl.querySelector('#reader-close');
  const scrollArea = readerEl.querySelector('#reader-scroll');
  const progressBar = readerEl.querySelector('#reader-progress');
  const bodyContent = readerEl.querySelector('#reader-body-content');
  const prevBtn = readerEl.querySelector('#reader-prev-btn');
  const nextBtn = readerEl.querySelector('#reader-next-btn');

  let currentIssueIndex = -1;

  // Open Reader
  function openIssue(issueId, source = "List Click") {
    const cleanId = String(issueId).replace('#', '').trim();
    const index = issues.findIndex(i => i.id === cleanId || i.number === issueId);
    if (index === -1) return;
    
    currentIssueIndex = index;
    const issue = issues[index];

    // Load data
    readerEl.querySelector('#reader-num').textContent = issue.number;
    readerEl.querySelector('#reader-cat').textContent = issue.category;
    readerEl.querySelector('#reader-date-text').textContent = issue.date || 'June 2026';
    readerEl.querySelector('#reader-title-text').textContent = issue.title;
    bodyContent.innerHTML = issue.content;
    readerEl.querySelector('#reader-question-text').textContent = issue.question;

    // Reset progress
    scrollArea.scrollTop = 0;
    progressBar.style.width = '0%';

    // Setup Nav Buttons
    if (index > 0) {
      nextBtn.style.visibility = 'visible';
      readerEl.querySelector('#reader-next-title').textContent = issues[index - 1].title;
    } else {
      nextBtn.style.visibility = 'hidden';
    }

    if (index < issues.length - 1) {
      prevBtn.style.visibility = 'visible';
      readerEl.querySelector('#reader-prev-title').textContent = issues[index + 1].title;
    } else {
      prevBtn.style.visibility = 'hidden';
    }

    // Toggle Drawer Open
    document.body.style.overflow = 'hidden'; // prevent background scrolling
    readerEl.classList.add('open');

    // ── ENGAGEMENT TRACKING ──
    if (window.trackEvent) {
      window.trackEvent('ISSUE_OPEN', `Opened Issue #${issue.id}: "${issue.title}" (via ${source})`);
    }
  }

  // Close Reader
  function closeReader() {
    readerEl.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Bind Close Events
  closeBtn.addEventListener('click', closeReader);
  overlay.addEventListener('click', closeReader);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeReader();
  });

  // Reading progress tracking
  scrollArea.addEventListener('scroll', () => {
    const totalHeight = scrollArea.scrollHeight - scrollArea.clientHeight;
    if (totalHeight > 0) {
      const percentage = (scrollArea.scrollTop / totalHeight) * 100;
      progressBar.style.width = `${percentage}%`;
    }
  });

  // Font sizing adjustment
  const sizeBtns = readerEl.querySelectorAll('.size-btn');
  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const size = btn.getAttribute('data-size');
      bodyContent.className = 'reader-body';
      if (size === 'small') {
        bodyContent.classList.add('font-size-small');
      } else if (size === 'medium') {
        bodyContent.classList.add('font-size-medium');
      } else if (size === 'large') {
        bodyContent.classList.add('font-size-large');
      }
      
      // Track font resize
      if (window.trackEvent) {
        window.trackEvent('FONT_RESIZE', `Changed reader font size to ${size}`);
      }
    });
  });

  // Prev / Next Binds
  prevBtn.addEventListener('click', () => {
    if (currentIssueIndex < issues.length - 1) {
      openIssue(issues[currentIssueIndex + 1].id, "Prev Navigation");
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentIssueIndex > 0) {
      openIssue(issues[currentIssueIndex - 1].id, "Next Navigation");
    }
  });

  // Export functions to window for global access
  window.openIssueReader = openIssue;
  window.closeIssueReader = closeReader;

  // Intercept any click events on sample cards or preview items
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.sample-card, .preview-item');
    if (card) {
      // Find issue ID
      const numSpan = card.querySelector('.sample-num, .preview-num');
      if (numSpan) {
        const id = numSpan.textContent.trim();
        openIssue(id, card.classList.contains('preview-item') ? 'Hero Sidebar' : 'Recent Issues Grid');
      }
    }
  });
}
