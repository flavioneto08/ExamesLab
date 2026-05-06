import './styles/index.css';
import { initToast } from './components/toast.js';
import { renderPatients } from './views/patients.js';
import { renderExams } from './views/exams.js';
import { renderDashboard } from './views/dashboard.js';

// Initialize toast system
initToast();

// DOM references
const viewContainer = document.getElementById('view-container');
const navLinks = document.querySelectorAll('.nav-link');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const menuToggle = document.getElementById('menu-toggle');

// Mobile sidebar toggle
menuToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
});
overlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
});

// Router
const routes = {
  '/pacientes': { render: renderPatients, nav: 'patients' },
  '/exames': { render: renderExams, nav: 'exams' },
  '/dashboard': { render: renderDashboard, nav: 'dashboard' },
};

async function navigate() {
  const hash = window.location.hash || '#/pacientes';
  const path = hash.replace('#', '').split('?')[0];
  const route = routes[path] || routes['/pacientes'];

  // Update nav active state
  navLinks.forEach(link => {
    link.classList.toggle('active', link.dataset.view === route.nav);
  });

  // Close mobile sidebar
  sidebar.classList.remove('open');
  overlay.classList.remove('active');

  // Render view with animation
  viewContainer.style.opacity = '0';
  viewContainer.style.transform = 'translateY(8px)';

  setTimeout(async () => {
    await route.render(viewContainer);
    viewContainer.style.opacity = '1';
    viewContainer.style.transform = 'translateY(0)';
  }, 150);
}

window.addEventListener('hashchange', navigate);
navigate();

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
