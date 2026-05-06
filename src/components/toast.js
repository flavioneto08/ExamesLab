// Toast notification system
let toastContainer;

export function initToast() {
  toastContainer = document.getElementById('toast-container');
}

export function showToast(message, type = 'success', duration = 3000) {
  if (!toastContainer) initToast();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = {
    success: '✓',
    error: '✗',
    info: 'ℹ'
  };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
