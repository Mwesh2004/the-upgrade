export function initDashboard(issues, refreshCallback) {
  let currentUser = null;

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // ── INJECT PORTAL CONTAINER DOM ──
  let dashboardEl = document.getElementById('creator-dashboard-portal');
  if (!dashboardEl) {
    dashboardEl = document.createElement('div');
    dashboardEl.id = 'creator-dashboard-portal';
    dashboardEl.className = 'dashboard-portal-panel';
    document.body.appendChild(dashboardEl);
  }

  // ── PORTAL VIEW ROUTER ──
  function renderPortalFrame() {
    if (!currentUser) {
      renderLoginScreen();
    } else {
      renderAdminDashboard();
    }
  }

  // ── RENDER AUTHORIZATION GATE LOGIN SCREEN ──
  function renderLoginScreen() {
    dashboardEl.innerHTML = `
      <div class="login-gate-overlay">
        <div class="login-card">
          <div class="login-header">
            <span class="lock-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: 0 auto 12px; opacity: 0.8;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </span>
            <h2>The Upgrade Portal</h2>
            <p>Access requires role authorization credentials</p>
          </div>
          <form class="login-form" id="portal-login-form">
            <div class="form-group">
              <label for="login-user">Username</label>
              <input type="text" id="login-user" placeholder="Enter username..." required autocomplete="username">
            </div>
            <div class="form-group">
              <label for="login-pass">Password</label>
              <input type="password" id="login-pass" placeholder="••••••••" required autocomplete="current-password">
            </div>
            <button type="submit" class="login-submit-btn">Unlock Portal →</button>
          </form>
          <div style="margin-top: 24px; text-align: center;">
            <button class="exit-portal-btn" id="exit-portal-login">Back to Landing Page</button>
          </div>
        </div>
      </div>
    `;

    // Handle Login API
    const loginForm = dashboardEl.querySelector('#portal-login-form');
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = dashboardEl.querySelector('#login-user').value.trim();
      const password = dashboardEl.querySelector('#login-pass').value.trim();

      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      .then(res => {
        if (!res.ok) throw new Error('Incorrect credentials');
        return res.json();
      })
      .then(user => {
        currentUser = user;
        renderPortalFrame();
        showNotification(`Welcome back, ${user.name} (${user.role.toUpperCase()})`);
      })
      .catch(() => {
        const card = dashboardEl.querySelector('.login-card');
        card.classList.add('shake-anim');
        setTimeout(() => card.classList.remove('shake-anim'), 500);
        showNotification("Invalid credentials. Access Denied.", "error");
      });
    });

    const exitLoginBtn = dashboardEl.querySelector('#exit-portal-login');
    if (exitLoginBtn) exitLoginBtn.addEventListener('click', closeDashboard);
  }

  // ── RENDER DYNAMIC ROLE-BASED ADMIN DASHBOARD ──
  function renderAdminDashboard() {
    const hasSubPermission = currentUser.permissions.includes('subscribers:read');
    const hasIssuesPermission = currentUser.permissions.includes('issues:write');
    const hasLogsPermission = currentUser.permissions.includes('logs:read');
    const hasMetricsPermission = currentUser.permissions.includes('metrics:read');

    dashboardEl.innerHTML = `
      <div class="dashboard-sidebar">
        <div class="dashboard-logo-area">
          <div class="db-logo">The Upgrade</div>
          <span class="db-badge">Portal: ${currentUser.role}</span>
        </div>
        <nav class="dashboard-nav">
          <button class="db-nav-item active" data-tab="analytics">Analytics</button>
          ${hasSubPermission ? `<button class="db-nav-item" data-tab="subscribers">Subscribers (<span id="sidebar-sub-count">0</span>)</button>` : ''}
          ${hasIssuesPermission ? `<button class="db-nav-item" data-tab="composer">Compose Issue</button>` : ''}
          ${currentUser.role === 'superadmin' ? `<button class="db-nav-item" data-tab="users">Manage Users</button>` : ''}
        </nav>
        <div class="dashboard-sidebar-footer">
          <div style="font-size: 11px; color: #666; margin-bottom: 12px; font-family: monospace;">User: ${currentUser.name}</div>
          <button class="logout-portal-btn" id="logout-portal" style="margin-bottom:12px;">Lock Portal</button>
          <button class="exit-portal-btn" id="exit-portal">Back to Landing Page</button>
        </div>
      </div>
      <div class="dashboard-main-content">
        <header class="dashboard-header">
          <div class="header-title-block">
            <h2 id="dashboard-tab-title">Analytics Dashboard</h2>
            <p id="dashboard-tab-subtitle">Real-time performance metrics for The Upgrade.</p>
          </div>
          <div class="dashboard-notification-area" id="db-notifications"></div>
        </header>
        
        <!-- Tab 1: Analytics -->
        <div class="dashboard-tab-panel active" id="tab-analytics">
          <!-- Stats Grid -->
          <div class="stats-grid" id="dashboard-stats-grid">
            <!-- Rendered dynamically depending on role permissions -->
          </div>
          
          <!-- Chart and Analytics Details -->
          <div class="analytics-detail-grid">
            <div class="chart-card" id="metrics-chart-card">
              <h3>Subscriber Growth</h3>
              <div class="svg-chart-container" id="growth-chart-wrap">
                <!-- SVG Chart -->
              </div>
            </div>
            
            <div class="performers-card">
              <h3>Live Activity Log</h3>
              <div class="activity-feed-container" id="activity-feed-list">
                <!-- Server activity logs -->
              </div>
            </div>
          </div>
        </div>

        <!-- Tab 2: Subscribers (Rendered conditionally) -->
        ${hasSubPermission ? `
        <div class="dashboard-tab-panel" id="tab-subscribers">
          <div class="subscribers-controls">
            <div class="search-box-wrap">
              <input type="text" id="sub-search-input" placeholder="Search subscribers by email...">
            </div>
            <form class="add-sub-form" id="add-sub-form">
              <input type="email" id="add-sub-email" placeholder="Add manual email..." required>
              <button type="submit" id="add-sub-submit-btn">Add Sub</button>
            </form>
          </div>
          <div class="sub-table-container">
            <table class="sub-table">
              <thead>
                <tr>
                  <th>Subscriber Email</th>
                  <th>Subscription Date</th>
                  <th>Acquisition Source</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="subscribers-table-body">
                <!-- Subscribers data rows -->
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}

        <!-- Tab 4: User Management (Superadmin only) -->
        ${currentUser.role === 'superadmin' ? `
        <div class="dashboard-tab-panel" id="tab-users">
          <div class="subscribers-controls" style="margin-bottom: 24px;">
            <div class="search-box-wrap">
              <input type="text" id="user-search-input" placeholder="Search users by name or username...">
            </div>
            <button class="masthead-cta" id="create-user-trigger" style="font-size: 11px; padding: 10px 18px; margin-left: auto;">+ Add Creator User</button>
          </div>
          
          <div id="user-composer-panel" class="composer-grid" style="display:none; margin-bottom: 30px; border: 2px solid var(--db-border); padding: 24px; background: var(--db-card);">
            <form id="user-composer-form" class="composer-form" style="width:100%;">
              <h3 id="user-form-title" style="margin-bottom: 20px; font-family: 'Space Mono', monospace; font-size: 14px; text-transform: uppercase; color: var(--gold);">Add New User</h3>
              <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 16px;">
                <div class="form-group">
                  <label for="user-username" style="display:block; margin-bottom:8px; font-size:11px; font-family: 'Space Mono'; text-transform:uppercase; color:#888;">Username</label>
                  <input type="text" id="user-username" required placeholder="e.g. berylbytes" style="width:100%; padding:10px; background:#1a1a1a; border:1px solid #333; color:#fff;">
                </div>
                <div class="form-group">
                  <label for="user-password" style="display:block; margin-bottom:8px; font-size:11px; font-family: 'Space Mono'; text-transform:uppercase; color:#888;">Password</label>
                  <input type="password" id="user-password" required placeholder="••••••••" style="width:100%; padding:10px; background:#1a1a1a; border:1px solid #333; color:#fff;">
                </div>
              </div>
              <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div class="form-group">
                  <label for="user-fullname" style="display:block; margin-bottom:8px; font-size:11px; font-family: 'Space Mono'; text-transform:uppercase; color:#888;">Full Name</label>
                  <input type="text" id="user-fullname" required placeholder="e.g. Beryl Bytes" style="width:100%; padding:10px; background:#1a1a1a; border:1px solid #333; color:#fff;">
                </div>
                <div class="form-group">
                  <label for="user-role" style="display:block; margin-bottom:8px; font-size:11px; font-family: 'Space Mono'; text-transform:uppercase; color:#888;">Role</label>
                  <select id="user-role" required style="width:100%; padding:10px; background:#1a1a1a; border:1px solid #333; color:#fff; cursor:pointer;">
                    <option value="superadmin">Superadmin (Full Access)</option>
                    <option value="editor">Editor (Compose Issues)</option>
                    <option value="moderator">Moderator (Manage Subscribers)</option>
                    <option value="viewer">Viewer (Read-only Analytics)</option>
                  </select>
                </div>
              </div>
              <div style="display:flex; gap:12px; margin-top:20px;">
                <button type="submit" class="publish-btn" style="width:auto; padding:12px 24px; font-size:11px;">Save User</button>
                <button type="button" class="exit-portal-btn" id="cancel-user-composer" style="width:auto; padding:12px 24px; font-size:11px; margin-top:0;">Cancel</button>
              </div>
            </form>
          </div>

          <div class="sub-table-container">
            <table class="sub-table" style="width:100%; border-collapse:collapse; text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid var(--db-border);">
                  <th style="padding:12px;">Full Name</th>
                  <th style="padding:12px;">Username</th>
                  <th style="padding:12px;">Role</th>
                  <th style="padding:12px;">Permissions</th>
                  <th style="padding:12px;">Actions</th>
                </tr>
              </thead>
              <tbody id="users-table-body">
                <!-- Dynamic user data -->
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}

        <!-- Tab 3: Composer (Rendered conditionally) -->
        ${hasIssuesPermission ? `
        <div class="dashboard-tab-panel" id="tab-composer">
          <div class="composer-grid">
            <form class="composer-form" id="composer-form">
              <div class="form-row">
                <div class="form-group">
                  <label for="comp-title">Issue Title</label>
                  <input type="text" id="comp-title" placeholder="e.g. Mshahara Ya Kwanza" required>
                </div>
                <div class="form-group">
                  <label for="comp-category">Category</label>
                  <select id="comp-category" required>
                    <option value="Life">Life</option>
                    <option value="Growth">Personal Growth</option>
                    <option value="Identity">Identity</option>
                    <option value="Mental Health">Mental Health</option>
                    <option value="Relationships">Relationships</option>
                    <option value="Personality">Personality</option>
                    <option value="City Life">City Life</option>
                    <option value="Money">Money</option>
                    <option value="Career">Career & Education</option>
                    <option value="Culture">Culture</option>
                    <option value="Business">Business</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="comp-excerpt">Brief Excerpt</label>
                <input type="text" id="comp-excerpt" placeholder="Provide a compelling 1-2 sentence hook..." required>
              </div>
              <div class="form-group">
                <label for="comp-content">Issue Content (HTML supported)</label>
                <textarea id="comp-content" rows="12" placeholder="Write paragraphs using tags like <p>, <h3>..." required></textarea>
              </div>
              <div class="form-group">
                <label for="comp-question">One Honest Question</label>
                <input type="text" id="comp-question" placeholder="Ask a question..." required>
              </div>
              <div class="composer-actions">
                <button type="submit" class="publish-btn">Publish &amp; Send to Subscribers</button>
              </div>
            </form>
            
            <div class="composer-preview">
              <h3>Live Preview</h3>
              <div class="mobile-phone-frame">
                <div class="phone-screen">
                  <div class="phone-header">The Upgrade Preview</div>
                  <div class="phone-scroll">
                    <span class="phone-issue-num" id="prev-num">#DRAFT</span>
                    <h2 class="phone-title" id="prev-title">Title Draft</h2>
                    <div class="phone-content" id="prev-content">
                      <p>Draft issue preview text will display here...</p>
                    </div>
                    <div class="phone-question" id="prev-question">
                      <p>Draft question preview will show here.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        ` : ''}
      </div>
    `;

    // ── RBAC UI CONTROLS BINDING ──
    const tabBtns = dashboardEl.querySelectorAll('.db-nav-item');
    const tabPanels = dashboardEl.querySelectorAll('.dashboard-tab-panel');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const tabName = btn.getAttribute('data-tab');
        tabPanels.forEach(p => p.classList.remove('active'));
        
        const targetPanel = dashboardEl.querySelector(`#tab-${tabName}`);
        if (targetPanel) targetPanel.classList.add('active');

        // Update titles
        const tabTitle = dashboardEl.querySelector('#dashboard-tab-title');
        const tabSubtitle = dashboardEl.querySelector('#dashboard-tab-subtitle');
        if (tabName === 'analytics') {
          tabTitle.textContent = "Analytics Dashboard";
          tabSubtitle.textContent = "Performance metrics and activity log feed.";
          loadAnalyticsData();
        } else if (tabName === 'subscribers') {
          tabTitle.textContent = "Subscribers Registry";
          tabSubtitle.textContent = "View and manage email list registrations.";
          loadSubscribersData();
        } else if (tabName === 'composer') {
          tabTitle.textContent = "Compose Newsletter Issue";
          tabSubtitle.textContent = "Write and publish a new issue instantly to the landing page.";
          setupComposerForm();
        } else if (tabName === 'users') {
          tabTitle.textContent = "User Accounts Directory";
          tabSubtitle.textContent = "Create, modify, or delete creator roles and credentials.";
          loadUsersData();
        }
      });
    });

    // Logout Portal
    const logoutBtn = dashboardEl.querySelector('#logout-portal');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        fetch('/api/auth/logout', { method: 'POST' })
          .then(() => {
            currentUser = null;
            renderPortalFrame();
            showNotification("Portal access locked.", "warning");
          });
      });
    }

    const exitBtn = dashboardEl.querySelector('#exit-portal');
    if (exitBtn) exitBtn.addEventListener('click', closeDashboard);

    // Initial analytics load
    loadAnalyticsData();

    // Auto-refresh activity log and stats every 15 seconds for live tracking
    const activityPollInterval = setInterval(() => {
      if (!dashboardEl.classList.contains('open')) {
        clearInterval(activityPollInterval);
        return;
      }
      loadAnalyticsData();
      // Also refresh subscriber count in sidebar
      const sidebarSubsCount = dashboardEl.querySelector('#sidebar-sub-count');
      if (sidebarSubsCount) {
        fetch('/api/admin/subscribers')
          .then(r => r.json())
          .then(subs => { sidebarSubsCount.textContent = subs.length; })
          .catch(() => {});
      }
    }, 15000);
  }

  // ── LOAD ANALYTICS & LOG EVENTS ──
  function loadAnalyticsData() {
    const statsGrid = dashboardEl.querySelector('#dashboard-stats-grid');
    const chartCard = dashboardEl.querySelector('#metrics-chart-card');
    const hasMetricsPermission = currentUser.permissions.includes('metrics:read');
    const hasLogsPermission = currentUser.permissions.includes('logs:read');

    // 1. Render Stats Grid
    if (statsGrid) {
      if (hasMetricsPermission) {
        fetch('/api/admin/metrics')
          .then(res => res.json())
          .then(metrics => {
            statsGrid.innerHTML = `
              <div class="stat-card">
                <span class="stat-lbl">Total Subscribers</span>
                <strong class="stat-val">${metrics.totalSubscribers}</strong>
                <span class="stat-change" style="color: #44dd66;">Active List</span>
              </div>
              <div class="stat-card">
                <span class="stat-lbl">Avg. Open Rate</span>
                <strong class="stat-val">${metrics.openRate.toFixed(1)}%</strong>
                <span class="stat-change">—</span>
              </div>
              <div class="stat-card">
                <span class="stat-lbl">Click-Through Rate</span>
                <strong class="stat-val">${metrics.ctrRate.toFixed(1)}%</strong>
                <span class="stat-change">—</span>
              </div>
            `;
            // Draw chart
            drawGrowthChart(metrics.growthData);
          });
      } else {
        // Clear metrics views
        statsGrid.innerHTML = `
          <div class="stat-card" style="grid-column: 1 / -1; align-items: center; justify-content: center; padding: 32px; border: 2px dashed #333;">
            <p style="color: #666; font-family: monospace; font-size:12px;">[Access Denied] Clearances Required: "metrics:read" (Hidden from ${currentUser.role.toUpperCase()})</p>
          </div>
        `;
        if (chartCard) chartCard.style.display = 'none';
      }
    }

    // 2. Render Activity Logs Feed
    if (hasLogsPermission) {
      fetch('/api/admin/activity-log')
        .then(res => res.json())
        .then(logs => {
          const feedList = dashboardEl.querySelector('#activity-feed-list');
          if (!feedList) return;
          
          if (logs.length === 0) {
            feedList.innerHTML = `<div style="color: #666; text-align:center; padding: 24px; font-size: 12px; font-family: monospace;">No log events registered.</div>`;
            return;
          }

          feedList.innerHTML = logs.map(log => `
            <div class="activity-row">
              <span class="act-time">[${escapeHTML(log.timestamp)}]</span>
              <div class="act-details">
                <span class="act-label">${escapeHTML(log.action)}</span>
                <p>${escapeHTML(log.details)}</p>
              </div>
            </div>
          `).join('');
        });
    } else {
      const feedList = dashboardEl.querySelector('#activity-feed-list');
      if (feedList) {
        feedList.innerHTML = `<div style="color: #666; text-align:center; padding: 24px; font-size: 12px; font-family: monospace;">[Access Denied] Permission clearance "logs:read" required.</div>`;
      }
    }
  }

  // ── DRAW SVG CHART ──
  function drawGrowthChart(data) {
    const container = document.getElementById('growth-chart-wrap');
    if (!container) return;

    const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
    const width = 450;
    const height = 200;
    const padding = 35;
    
    const minVal = Math.min(...data);
    const maxVal = Math.max(...data) + 2;
    
    const points = data.map((val, idx) => {
      const x = padding + (idx * (width - padding * 2) / (data.length - 1));
      const range = (maxVal - minVal === 0) ? 1 : (maxVal - minVal);
      const y = height - padding - ((val - minVal) * (height - padding * 2) / range);
      return { x, y, val };
    });

    const pathData = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, "");

    const areaPathData = `
      ${pathData} 
      L ${points[points.length - 1].x} ${height - padding} 
      L ${points[0].x} ${height - padding} Z
    `;

    container.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" class="svg-growth-chart">
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#333" stroke-width="1" />
        <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="#333" stroke-dasharray="4" stroke-width="1" />
        <text x="${padding - 5}" y="${padding + 4}" font-family="Space Mono" font-size="8" fill="#666" text-anchor="end">${Math.round(maxVal)}</text>
        <text x="${padding - 5}" y="${height - padding + 4}" font-family="Space Mono" font-size="8" fill="#666" text-anchor="end">${Math.round(minVal)}</text>
        <path d="${areaPathData}" fill="rgba(232, 76, 43, 0.05)" />
        <path d="${pathData}" fill="none" stroke="var(--accent)" stroke-width="3" />
        ${points.map(p => `
          <g class="chart-point-group">
            <circle cx="${p.x}" cy="${p.y}" r="5" fill="#121212" stroke="var(--accent)" stroke-width="2" />
            <text x="${p.x}" y="${p.y - 12}" font-family="Space Mono" font-size="8" font-weight="700" fill="#fff" text-anchor="middle" class="chart-tooltip">${p.val}</text>
          </g>
        `).join('')}
      </svg>
    `;
  }

  // ── LOAD & RENDER SUBSCRIBERS ──
  function loadSubscribersData() {
    const tableBody = dashboardEl.querySelector('#subscribers-table-body');
    const sidebarSubsCount = dashboardEl.querySelector('#sidebar-sub-count');
    const subSearchInput = dashboardEl.querySelector('#sub-search-input');
    const hasWritePermission = currentUser.permissions.includes('subscribers:write');

    if (!tableBody) return;

    fetch('/api/admin/subscribers')
      .then(res => res.json())
      .then(subscribers => {
        if (sidebarSubsCount) sidebarSubsCount.textContent = subscribers.length;

        const query = subSearchInput ? subSearchInput.value.toLowerCase().trim() : '';
        const filtered = subscribers.filter(sub => sub.email.toLowerCase().includes(query));

        if (filtered.length === 0) {
          tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#666; padding: 32px;">No registered email subscribers.</td></tr>`;
          return;
        }

        tableBody.innerHTML = filtered.map((sub, idx) => `
          <tr>
            <td><strong>${escapeHTML(sub.email)}</strong></td>
            <td>${escapeHTML(sub.date)}</td>
            <td><span class="source-tag">${escapeHTML(sub.source)}</span></td>
            <td>
              ${hasWritePermission ? 
                `<button class="sub-delete-btn" data-email="${escapeHTML(sub.email)}">&times; Delete</button>` : 
                `<span style="color:#444; font-size:11px; font-family:monospace;">Read Only</span>`}
            </td>
          </tr>
        `).join('');

        // Bind delete action
        if (hasWritePermission) {
          tableBody.querySelectorAll('.sub-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const email = btn.getAttribute('data-email');
              fetch(`/api/admin/subscribers/${encodeURIComponent(email)}`, { method: 'DELETE' })
                .then(res => {
                  if (!res.ok) throw new Error();
                  showNotification(`Removed ${email} from subscriber directory.`, 'warning');
                  loadSubscribersData();
                  // Notify landing page stats to update immediately
                  const event = new CustomEvent('subscriberListUpdated');
                  window.dispatchEvent(event);
                })
                .catch(() => showNotification('Error deleting subscriber.', 'error'));
            });
          });
        }
      });
  }

  // Bind subscriber manual add form
  function bindAddSubscriber() {
    const addSubForm = dashboardEl.querySelector('#add-sub-form');
    const hasWritePermission = currentUser.permissions.includes('subscribers:write');
    
    if (!addSubForm) return;

    if (!hasWritePermission) {
      // Disable manual inputs for Read-Only roles
      const emailInput = addSubForm.querySelector('#add-sub-email');
      const submitBtn = addSubForm.querySelector('#add-sub-submit-btn');
      if (emailInput) emailInput.disabled = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Locked';
        submitBtn.style.opacity = '0.5';
      }
      return;
    }

    addSubForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('add-sub-email');
      const email = emailInput.value.trim();

      fetch('/api/admin/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      .then(res => {
        if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed'); });
        return res.json();
      })
      .then(() => {
        emailInput.value = '';
        showNotification(`Added subscriber email: ${email}`);
        loadSubscribersData();
        const event = new CustomEvent('subscriberListUpdated');
        window.dispatchEvent(event);
      })
      .catch((err) => showNotification(err.message, 'error'));
    });
  }

  // ── SETUP COMPOSER DYNAMICS ──
  function setupComposerForm() {
    const composerForm = dashboardEl.querySelector('#composer-form');
    if (!composerForm) return;

    const compTitle = dashboardEl.querySelector('#comp-title');
    const compCategory = dashboardEl.querySelector('#comp-category');
    const compExcerpt = dashboardEl.querySelector('#comp-excerpt');
    const compContent = dashboardEl.querySelector('#comp-content');
    const compQuestion = dashboardEl.querySelector('#comp-question');

    function updateComposerPreview() {
      const nextIdNum = issues.length > 0 ? parseInt(issues[0].id) + 1 : 1;
      const nextId = String(nextIdNum).padStart(3, '0');
      
      dashboardEl.querySelector('#prev-num').textContent = `#${nextId}`;
      dashboardEl.querySelector('#prev-title').textContent = compTitle.value || "Title Draft";
      dashboardEl.querySelector('#prev-content').innerHTML = compContent.value || "<p>Issue content draft will display here...</p>";
      dashboardEl.querySelector('#prev-question').textContent = compQuestion.value || "Question draft goes here.";
    }

    [compTitle, compCategory, compExcerpt, compContent, compQuestion].forEach(input => {
      if (input) input.addEventListener('input', updateComposerPreview);
    });

    composerForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const title = compTitle.value.trim();
      const category = compCategory.value;
      const excerpt = compExcerpt.value.trim();
      const content = compContent.value.trim();
      const question = compQuestion.value.trim();

      fetch('/api/admin/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, excerpt, content, question })
      })
      .then(res => {
        if (!res.ok) throw new Error('Publishing failed');
        return res.json();
      })
      .then(newIssue => {
        composerForm.reset();
        updateComposerPreview();
        showNotification(`Successfully published Issue #${newIssue.id}!`);
        if (refreshCallback) refreshCallback();
      })
      .catch(() => showNotification('Failed to publish issue.', 'error'));
    });
  }

  // ── PUBLIC REGISTRATION INTERCEPT ──
  // Re-link public forms
  window.handleSubscribe = function(event) {
    event.preventDefault();
    const input = event.target.querySelector('input[type="email"]');
    const btn = event.target.querySelector('button');
    if (!input || !btn) return;

    const email = input.value.trim();
    const source = event.target.className === 'hero-form' ? 'Hero Form' : 'Footer Form';

    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source })
    })
    .then(res => {
      if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed'); });
      return res.json();
    })
    .then(() => {
      // Dispatch alert
      if (window.showToast) {
        window.showToast(
          `Welcome to The Upgrade! We've dispatched a welcome confirmation email to <strong>${email}</strong>. Check your inbox!`,
          "Subscription Approved!"
        );
      }

      // Sync counters instantly
      const ev = new CustomEvent('subscriberListUpdated');
      window.dispatchEvent(ev);

      // UI Success Animation
      const originalText = btn.textContent;
      btn.textContent = 'Umeingia! ✓';
      btn.style.background = '#0a0a0a';
      btn.style.borderColor = '#0a0a0a';
      input.value = '';
      input.placeholder = 'Check your inbox soon!';
      
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        btn.style.borderColor = '';
        input.placeholder = 'Enter your email';
      }, 4000);
    })
    .catch((err) => {
      const msg = err && err.message ? err.message : 'Subscription failed. Please try again.';
      if (window.showToast) {
        window.showToast(msg, "Failed Registration");
      }
    });
  };

  // ── AUTO CHECK ADMIN COOKIE SESSION ──
  function checkSessionStatus() {
    fetch('/api/auth/status')
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(user => {
        currentUser = user;
      })
      .catch(() => {
        currentUser = null;
      });
  }

  // Check login on script import
  checkSessionStatus();

  // Auto-open dashboard since this is now a dedicated portal page
  fetch('/api/auth/status')
    .then(res => res.json())
    .then(user => {
      currentUser = user;
      openDashboard();
    })
    .catch(() => {
      currentUser = null;
      openDashboard();
    });

  // ── LOAD & RENDER USERS ──
  function loadUsersData() {
    const tableBody = dashboardEl.querySelector('#users-table-body');
    const userSearchInput = dashboardEl.querySelector('#user-search-input');
    const createTrigger = dashboardEl.querySelector('#create-user-trigger');
    const composerPanel = dashboardEl.querySelector('#user-composer-panel');
    const composerForm = dashboardEl.querySelector('#user-composer-form');
    const cancelBtn = dashboardEl.querySelector('#cancel-user-composer');

    if (!tableBody) return;

    let isEditing = false;
    let originalUsername = '';

    // Fetch and render users table
    function fetchAndRenderUsers() {
      fetch('/api/admin/users')
        .then(res => res.json())
        .then(users => {
          const query = userSearchInput ? userSearchInput.value.toLowerCase().trim() : '';
          const filtered = users.filter(u => 
            u.name.toLowerCase().includes(query) || 
            u.username.toLowerCase().includes(query) || 
            u.role.toLowerCase().includes(query)
          );

          if (filtered.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#666; padding: 32px;">No matching creator accounts.</td></tr>`;
            return;
          }

          tableBody.innerHTML = filtered.map(u => `
            <tr style="border-bottom: 1px solid var(--db-border);">
              <td style="padding:12px;"><strong>${escapeHTML(u.name)}</strong></td>
              <td style="padding:12px;"><span style="font-family: monospace;">@${escapeHTML(u.username)}</span></td>
              <td style="padding:12px;"><span class="source-tag">${escapeHTML(u.role.toUpperCase())}</span></td>
              <td style="padding:12px;"><span style="font-size:10px; color:#aaa; font-family:monospace;">${u.permissions.map(escapeHTML).join(', ')}</span></td>
              <td style="padding:12px; display:flex; gap:8px;">
                <button class="user-edit-btn" data-username="${escapeHTML(u.username)}" data-name="${escapeHTML(u.name)}" data-role="${escapeHTML(u.role)}" style="background:#222; border:1px solid #444; color:#fff; padding:6px 12px; cursor:pointer; font-size:11px;">Edit</button>
                <button class="user-delete-btn" data-username="${escapeHTML(u.username)}" style="background:transparent; border:1px solid #cc3333; color:#cc3333; padding:6px 12px; cursor:pointer; font-size:11px;">Delete</button>
              </td>
            </tr>
          `).join('');

          // Bind edit buttons
          tableBody.querySelectorAll('.user-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              isEditing = true;
              originalUsername = btn.getAttribute('data-username');
              
              dashboardEl.querySelector('#user-form-title').textContent = `Edit User: @${originalUsername}`;
              dashboardEl.querySelector('#user-username').value = originalUsername;
              dashboardEl.querySelector('#user-username').disabled = true; // cannot rename key
              dashboardEl.querySelector('#user-password').value = ''; // blank means unchanged
              dashboardEl.querySelector('#user-password').required = false;
              dashboardEl.querySelector('#user-fullname').value = btn.getAttribute('data-name');
              dashboardEl.querySelector('#user-role').value = btn.getAttribute('data-role');

              composerPanel.style.display = 'block';
              composerPanel.scrollIntoView({ behavior: 'smooth' });
            });
          });

          // Bind delete buttons
          tableBody.querySelectorAll('.user-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const username = btn.getAttribute('data-username');
              if (confirm(`Are you sure you want to permanently delete user account @${username}?`)) {
                fetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' })
                  .then(res => res.json())
                  .then(data => {
                    if (data.error) {
                      showNotification(data.error, 'error');
                    } else {
                      showNotification(`Successfully deleted creator user @${username}.`, 'warning');
                      fetchAndRenderUsers();
                    }
                  })
                  .catch(() => showNotification('Error deleting user.', 'error'));
              }
            });
          });
        });
    }

    // Bind search input
    if (userSearchInput) {
      userSearchInput.addEventListener('input', fetchAndRenderUsers);
    }

    // Show add panel
    if (createTrigger) {
      createTrigger.addEventListener('click', () => {
        isEditing = false;
        dashboardEl.querySelector('#user-form-title').textContent = "Add New User";
        dashboardEl.querySelector('#user-username').value = '';
        dashboardEl.querySelector('#user-username').disabled = false;
        dashboardEl.querySelector('#user-password').value = '';
        dashboardEl.querySelector('#user-password').required = true;
        dashboardEl.querySelector('#user-fullname').value = '';
        dashboardEl.querySelector('#user-role').value = 'viewer';

        composerPanel.style.display = 'block';
        composerPanel.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Cancel panel
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        composerPanel.style.display = 'none';
        composerForm.reset();
      });
    }

    // Form submission (Save)
    if (composerForm) {
      // Avoid multiple submit binds
      const newForm = composerForm.cloneNode(true);
      composerForm.parentNode.replaceChild(newForm, composerForm);
      
      newForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const usernameInput = newForm.querySelector('#user-username');
        const passwordInput = newForm.querySelector('#user-password');
        const nameInput = newForm.querySelector('#user-fullname');
        const roleInput = newForm.querySelector('#user-role');

        const payload = {
          name: nameInput.value.trim(),
          role: roleInput.value
        };

        if (passwordInput.value) {
          payload.password = passwordInput.value;
        }

        let url = '/api/admin/users';
        let method = 'POST';

        if (isEditing) {
          url = `/api/admin/users/${encodeURIComponent(originalUsername)}`;
          method = 'PUT';
        } else {
          payload.username = usernameInput.value.trim();
        }

        fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            showNotification(data.error, 'error');
          } else {
            showNotification(isEditing ? `Updated user @${originalUsername} successfully.` : `Created user @${payload.username} successfully.`);
            newForm.reset();
            composerPanel.style.display = 'none';
            fetchAndRenderUsers();
          }
        })
        .catch(() => showNotification('Error saving user changes.', 'error'));
      });
    }

    // Initial render call
    fetchAndRenderUsers();
  }

  function openDashboard() {
    dashboardEl.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderPortalFrame();
    
    // Bind forms once rendered
    const hasSubPermission = currentUser && currentUser.permissions.includes('subscribers:read');
    if (hasSubPermission) {
      bindAddSubscriber();
    }
  }

  function closeDashboard() {
    dashboardEl.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Custom alert bubble builder
  function showNotification(message, type = 'success') {
    const notificationsArea = dashboardEl.querySelector('#db-notifications');
    if (!notificationsArea) return;
    
    const notif = document.createElement('div');
    notif.className = `db-notification ${type}`;
    notif.innerHTML = `
      <span>${message}</span>
      <button class="notif-close">&times;</button>
    `;
    
    notificationsArea.appendChild(notif);
    
    notif.querySelector('.notif-close').addEventListener('click', () => {
      notif.remove();
    });

    setTimeout(() => notif.classList.add('show'), 10);
    setTimeout(() => {
      notif.classList.remove('show');
      setTimeout(() => notif.remove(), 300);
    }, 4500);
  }

  // ── URL HASH ROUTER FOR HIDDEN ENTRY POINT ──
  function checkHashRoute() {
    if (window.location.hash === '#creator-portal' || window.location.hash === '#admin') {
      openDashboard();
    }
  }

  window.addEventListener('hashchange', checkHashRoute);
  // Check hash on page load
  setTimeout(checkHashRoute, 200);

  return {
    open: openDashboard,
    close: closeDashboard
  };
}
