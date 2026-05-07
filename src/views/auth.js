import { supabase, signIn, signUp, resetPassword } from '../supabase.js';
import { showToast } from '../components/toast.js';

export function renderAuth(onAuthenticated) {
  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.className = 'auth-overlay';

  overlay.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">
        <img src="${import.meta.env.BASE_URL}icon-192.png" alt="ExamesLab" width="48" height="48" />
        <span class="auth-brand">ExamesLab</span>
      </div>

      <!-- LOGIN FORM -->
      <form id="login-form" class="auth-form">
        <h2 class="auth-title">Bem-vindo de volta</h2>
        <p class="auth-subtitle">Acesse sua conta para continuar</p>
        <div class="form-group">
          <label class="form-label">E-mail</label>
          <input id="auth-email" type="email" class="form-input" placeholder="seu@email.com" autocomplete="email" required />
        </div>
        <div class="form-group">
          <label class="form-label">Senha</label>
          <div class="auth-password-wrapper">
            <input id="auth-password" type="password" class="form-input" placeholder="••••••••" autocomplete="current-password" required />
            <button type="button" id="toggle-password" class="auth-eye-btn" tabindex="-1">
              <svg id="eye-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
        <button type="submit" id="login-btn" class="btn btn-primary auth-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          Entrar
        </button>
        <div class="auth-links">
          <button type="button" id="go-forgot" class="auth-link">Esqueci a senha</button>
          <span class="auth-divider">·</span>
          <button type="button" id="go-signup" class="auth-link">Criar conta</button>
        </div>
      </form>

      <!-- SIGNUP FORM -->
      <form id="signup-form" class="auth-form" style="display:none">
        <h2 class="auth-title">Criar conta</h2>
        <p class="auth-subtitle">Comece a gerenciar seus pacientes</p>
        <div class="form-group">
          <label class="form-label">E-mail</label>
          <input id="signup-email" type="email" class="form-input" placeholder="seu@email.com" autocomplete="email" required />
        </div>
        <div class="form-group">
          <label class="form-label">Senha</label>
          <input id="signup-password" type="password" class="form-input" placeholder="Mínimo 6 caracteres" autocomplete="new-password" required minlength="6" />
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar Senha</label>
          <input id="signup-confirm" type="password" class="form-input" placeholder="Repita a senha" autocomplete="new-password" required />
        </div>
        <button type="submit" id="signup-btn" class="btn btn-primary auth-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          Criar Conta
        </button>
        <div class="auth-links">
          <button type="button" id="go-login" class="auth-link">Já tenho conta</button>
        </div>
      </form>

      <!-- FORGOT PASSWORD FORM -->
      <form id="forgot-form" class="auth-form" style="display:none">
        <h2 class="auth-title">Recuperar senha</h2>
        <p class="auth-subtitle">Enviaremos um link para redefinir sua senha</p>
        <div class="form-group">
          <label class="form-label">E-mail</label>
          <input id="forgot-email" type="email" class="form-input" placeholder="seu@email.com" autocomplete="email" required />
        </div>
        <button type="submit" id="forgot-btn" class="btn btn-primary auth-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Enviar Link
        </button>
        <div class="auth-links">
          <button type="button" id="go-login-from-forgot" class="auth-link">← Voltar ao login</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  // Animated entrance
  requestAnimationFrame(() => overlay.classList.add('auth-overlay--visible'));

  const loginForm   = overlay.querySelector('#login-form');
  const signupForm  = overlay.querySelector('#signup-form');
  const forgotForm  = overlay.querySelector('#forgot-form');

  function showForm(form) {
    [loginForm, signupForm, forgotForm].forEach(f => f.style.display = 'none');
    form.style.display = 'flex';
    form.querySelector('input')?.focus();
  }

  overlay.querySelector('#go-signup').addEventListener('click', () => showForm(signupForm));
  overlay.querySelector('#go-login').addEventListener('click', () => showForm(loginForm));
  overlay.querySelector('#go-forgot').addEventListener('click', () => showForm(forgotForm));
  overlay.querySelector('#go-login-from-forgot').addEventListener('click', () => showForm(loginForm));

  // Toggle password visibility
  overlay.querySelector('#toggle-password').addEventListener('click', () => {
    const input = overlay.querySelector('#auth-password');
    const icon  = overlay.querySelector('#eye-icon');
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    icon.innerHTML = isText
      ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
      : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  });

  // LOGIN
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = overlay.querySelector('#login-btn');
    const email = overlay.querySelector('#auth-email').value.trim();
    const password = overlay.querySelector('#auth-password').value;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;margin:0;border-width:2px"></div> Entrando...';
    try {
      await signIn(email, password);
      overlay.classList.remove('auth-overlay--visible');
      setTimeout(() => { overlay.remove(); onAuthenticated(); }, 300);
    } catch (err) {
      showToast(translateAuthError(err.message), 'error');
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Entrar';
    }
  });

  // SIGNUP
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = overlay.querySelector('#signup-btn');
    const email    = overlay.querySelector('#signup-email').value.trim();
    const password = overlay.querySelector('#signup-password').value;
    const confirm  = overlay.querySelector('#signup-confirm').value;
    if (password !== confirm) { showToast('As senhas não coincidem', 'error'); return; }
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;margin:0;border-width:2px"></div> Criando...';
    try {
      const { user } = await signUp(email, password);
      if (user && !user.email_confirmed_at) {
        showToast('Conta criada! Verifique seu e-mail para confirmar.', 'success');
        showForm(loginForm);
      } else {
        overlay.classList.remove('auth-overlay--visible');
        setTimeout(() => { overlay.remove(); onAuthenticated(); }, 300);
      }
    } catch (err) {
      showToast(translateAuthError(err.message), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg> Criar Conta';
    }
  });

  // FORGOT PASSWORD
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = overlay.querySelector('#forgot-btn');
    const email = overlay.querySelector('#forgot-email').value.trim();
    btn.disabled = true;
    try {
      await resetPassword(email);
      showToast('Link de recuperação enviado! Verifique seu e-mail.', 'success');
      showForm(loginForm);
    } catch (err) {
      showToast(translateAuthError(err.message), 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // Focus first field
  setTimeout(() => overlay.querySelector('#auth-email')?.focus(), 100);
}

function translateAuthError(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos';
  if (msg.includes('Email not confirmed'))        return 'Confirme seu e-mail antes de entrar';
  if (msg.includes('User already registered'))    return 'Este e-mail já está cadastrado';
  if (msg.includes('Password should be'))         return 'A senha deve ter pelo menos 6 caracteres';
  if (msg.includes('rate limit'))                 return 'Muitas tentativas. Aguarde um momento.';
  return msg;
}
