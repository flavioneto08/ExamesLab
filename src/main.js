import './styles/index.css';
import { initToast, showToast } from './components/toast.js';
import { renderPatients } from './views/patients.js';
import { renderExams } from './views/exams.js';
import { renderDashboard } from './views/dashboard.js';
import { renderAuth } from './views/auth.js';
import { supabase, signOut } from './supabase.js';

// Initialize toast system
initToast();

// DOM references
const viewContainer = document.getElementById('view-container');
const navLinks      = document.querySelectorAll('.nav-link');
const sidebar       = document.getElementById('sidebar');
const overlay       = document.getElementById('sidebar-overlay');
const menuToggle    = document.getElementById('menu-toggle');
const userEmailEl   = document.getElementById('user-email');
const logoutBtn     = document.getElementById('logout-btn');

// Mobile sidebar toggle
menuToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
});
overlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
});

// Logout
logoutBtn.addEventListener('click', async () => {
  try {
    await signOut();
  } catch (err) {
    showToast('Erro ao sair: ' + err.message, 'error');
  }
});

// Router
const routes = {
  '/pacientes': { render: renderPatients, nav: 'patients' },
  '/exames':    { render: renderExams,    nav: 'exams' },
  '/dashboard': { render: renderDashboard, nav: 'dashboard' },
};

async function navigate() {
  const hash = window.location.hash || '#/pacientes';
  const path = hash.replace('#', '').split('?')[0];
  const route = routes[path] || routes['/pacientes'];

  navLinks.forEach(link => {
    link.classList.toggle('active', link.dataset.view === route.nav);
  });

  sidebar.classList.remove('open');
  overlay.classList.remove('active');

  viewContainer.style.opacity = '0';
  viewContainer.style.transform = 'translateY(8px)';

  setTimeout(async () => {
    await route.render(viewContainer);
    viewContainer.style.opacity = '1';
    viewContainer.style.transform = 'translateY(0)';
  }, 150);
}

// ===== AUTH STATE MANAGEMENT =====
function initApp(user) {
  if (window._appInitialized) return; // prevent double-init
  window._appInitialized = true;
  if (userEmailEl) userEmailEl.textContent = user.email;
  window.addEventListener('hashchange', navigate);
  navigate();
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    // Only init if not already initialized (e.g., after page refresh)
    if (!document.getElementById('auth-overlay') && !window._appInitialized) {
      initApp(session.user);
    }
  }
  if (event === 'SIGNED_OUT') {
    window._appInitialized = false;
    window.removeEventListener('hashchange', navigate);
    viewContainer.innerHTML = '';
    if (userEmailEl) userEmailEl.textContent = '';
    renderAuth((user) => initApp(user));
  }
});

// Initial check on load
async function bootstrap() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    initApp(session.user);
  } else {
    renderAuth((user) => initApp(user));
  }
}

bootstrap();

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
  });
}
