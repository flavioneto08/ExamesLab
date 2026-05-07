// Reusable modal component
// size: 'md' (480px default) | 'lg' (660px) | 'xl' (900px)
export function openModal({ title, body, footer, onClose, wide = false, size = 'md' }) {
  const container = document.getElementById('modal-container');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const sizeClass = (size === 'xl' || wide === 'xl') ? ' modal-xl'
                  : (size === 'lg' || wide === true)  ? ' modal-wide'
                  : '';
  backdrop.innerHTML = `
    <div class="modal${sizeClass}">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" data-close>&times;</button>
      </div>
      <div class="modal-body">${typeof body === 'string' ? body : ''}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  const close = () => {
    backdrop.style.opacity = '0';
    setTimeout(() => {
      backdrop.remove();
      if (onClose) onClose();
    }, 150);
  };

  backdrop.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', close));
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  container.appendChild(backdrop);

  if (typeof body !== 'string' && body instanceof HTMLElement) {
    backdrop.querySelector('.modal-body').innerHTML = '';
    backdrop.querySelector('.modal-body').appendChild(body);
  }

  return { close, element: backdrop };
}
