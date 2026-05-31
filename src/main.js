import './style.css';
import { initReader } from './components/reader.js';
import { initSearchAndFilter } from './components/search.js';
import { initialIssues } from './data/issues.js';

// ── GLOBAL ENGAGEMENT TRACKER DISPATCHER (HTTP POST API) ──
window.trackEvent = function(action, details) {
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, details })
  }).catch(() => {
    // Fail silently in browser, logs on server console
  });
};

// ── DIRECT FORMSPREE SUBSCRIPTION ──
window._pendingSubscribe = null;
window.handleSubscribe = async function(event) {
  event.preventDefault();
  const form = event.target;
  const btn = form.querySelector('button');
  const emailInput = form.querySelector('input[type="email"]');
  const email = emailInput ? emailInput.value : '';
  
  if (btn) { 
    btn.dataset.original = btn.textContent;
    btn.textContent = 'Joining...'; 
    btn.disabled = true;
  }
  
  try {
    // 1. Send directly to Formspree
    const formspreeRes = await fetch('https://formspree.io/f/mbdbeqnq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email: email, _subject: "New The Upgrade Subscriber!" })
    });
    
    // 2. Sync with our own database (silent background)
    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source: 'Frontend Form' })
    }).then(() => {
      window.dispatchEvent(new Event('subscriberListUpdated'));
    }).catch(() => {});
    
    if (formspreeRes.ok) {
      if (window.showToast) window.showToast('You are on the list! Welcome to The Upgrade.', 'Success');
      form.reset();
    } else {
      if (window.showToast) window.showToast('We received your email, but there was a minor issue. Welcome aboard!', 'Subscribed');
      form.reset();
    }
  } catch (err) {
    if (window.showToast) window.showToast('Failed to connect. Please check your internet connection.', 'Error');
  } finally {
    if (btn) {
      btn.textContent = btn.dataset.original || 'Niingie →';
      btn.disabled = false;
    }
  }
};

// ── CUSTOM BANNER NOTIFICATION ──
window.showToast = function(message, title = "Notification") {
  const container = document.getElementById('global-toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-banner';
  toast.innerHTML = `
    <div class="toast-indicator"></div>
    <div class="toast-content">
      <strong>${title}</strong>
      <p>${message}</p>
    </div>
    <button class="toast-close">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 50);

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  });

  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
};

document.addEventListener('DOMContentLoaded', async () => {
  // ── THEME STATE MANAGEMENT ──
  const themeToggleBtn = document.getElementById('theme-toggle');
  
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
      if (themeToggleBtn) themeToggleBtn.textContent = 'Light';
    } else {
      document.body.classList.remove('dark-theme');
      if (themeToggleBtn) themeToggleBtn.textContent = 'Dark';
    }
  }

  // Load theme preference
  const savedTheme = localStorage.getItem('upgrade_theme') || 'light';
  applyTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isDark = document.body.classList.contains('dark-theme');
      const newTheme = isDark ? 'light' : 'dark';
      
      applyTheme(newTheme);
      localStorage.setItem('upgrade_theme', newTheme);
      
      if (window.trackEvent) {
        window.trackEvent('THEME_TOGGLE', `Switched theme to: "${newTheme}"`);
      }
    });
  }

  // ── HELPER TO INITIALIZE MODULES WITH ISSUES LIST ──
  function initializeWithIssues(issues) {
    window.trackEvent('PAGE_LOAD', 'User landed on homepage');

    // Initialize Reader Module
    initReader(issues);

    // Initialize Search & Filtering Module
    initSearchAndFilter(issues);

    updateMainStats();
    updateTopicCounts(issues);
  }

  // Helper to update topics based on actual issues count
  function updateTopicCounts(issues) {
    const topicCards = document.querySelectorAll('.topic-card');
    topicCards.forEach(card => {
      const topicName = card.querySelector('.topic-name').textContent.trim();
      let count = 0;
      issues.forEach(issue => {
        if (issue.category.toLowerCase().trim() === topicName.toLowerCase().trim() ||
            (topicName.toLowerCase() === 'money & finance' && issue.category.toLowerCase() === 'money') ||
            (topicName.toLowerCase() === 'personality & self' && issue.category.toLowerCase() === 'personality') ||
            (topicName.toLowerCase() === 'identity & society' && issue.category.toLowerCase() === 'identity') ||
            (topicName.toLowerCase() === 'growth & purpose' && issue.category.toLowerCase() === 'growth') ||
            (topicName.toLowerCase() === 'career & education' && issue.category.toLowerCase() === 'career')) {
          count++;
        }
      });
      const countEl = card.querySelector('.topic-count');
      if (countEl && count > 0) {
        countEl.textContent = `${count} Issues`;
      }
    });
    
    // Also update total articles count in "What We Cover" header
    const headerCount = document.querySelector('.topics-header .section-count');
    if (headerCount) {
      headerCount.textContent = `8 Core Topics · ${issues.length} Articles`;
    }
  }

  // ── LOAD DYNAMIC STATED DATA FROM BACKEND API ──
  fetch('/api/issues')
    .then(res => {
      if (!res.ok) throw new Error('API server returned error status');
      return res.json();
    })
    .then(issues => {
      const finalIssues = issues.length > 0 ? issues : initialIssues;
      initializeWithIssues(finalIssues);
    })
    .catch(err => {
      console.warn('Failed to load issues database from backend, falling back to static default catalog:', err);
      // Run the site using the default static issues catalog
      initializeWithIssues(initialIssues);
    });

  // ── UPDATE LANDING PAGE DYNAMIC STATS ──
  function updateMainStats() {
    fetch('/api/stats')
      .then(res => res.json())
      .then(stats => {
        const heroIssuesCount = document.getElementById('hero-issue-count');
        const footerIssuesCount = document.getElementById('footer-issues-count');
        if (heroIssuesCount) heroIssuesCount.textContent = `${stats.totalIssues}+`;
        if (footerIssuesCount) footerIssuesCount.textContent = `${stats.totalIssues}`;

        const subCounter = document.getElementById('hero-sub-count');
        if (subCounter) {
          subCounter.textContent = stats.totalSubscribers.toLocaleString();
        }
      });
  }

  // Listen to subscriber updates from components to sync counter instantly
  window.addEventListener('subscriberListUpdated', updateMainStats);

  // ── SCROLL-TRIGGERED REVEAL ANIMATIONS ──
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  function bindRevealAnimations() {
    document.querySelectorAll('.topic-card, .sample-card, .why-item, .hero-stat, .about-strip, .quote-section').forEach((el) => {
      el.classList.add('reveal-on-scroll');
      observer.observe(el);
    });
  }

  bindRevealAnimations();
});
