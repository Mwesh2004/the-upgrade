import { initialIssues } from './data/issues.js';
import { initDashboard } from './components/dashboard.js';

// Custom toast notification function
window.showToast = function(message, title = "Notification") {
  const container = document.getElementById('global-toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = 'toast-alert';
  toast.innerHTML = `
    <strong>${title}</strong>
    <p>${message}</p>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/issues');
    if (res.ok) {
      const data = await res.json();
      initDashboard(data.length > 0 ? data : initialIssues, () => {});
    } else {
      initDashboard(initialIssues, () => {});
    }
  } catch (err) {
    initDashboard(initialIssues, () => {});
  }
});
