import { ApiRequestError, getMe, login } from './api.js';
import { byId, hideFormError, showFormError } from './common.js';
import { Role } from './types.js';

const form = byId<HTMLFormElement>('login-form');
const loginInput = byId<HTMLInputElement>('login-input');
const passwordInput = byId<HTMLInputElement>('password-input');
const errorBox = byId<HTMLDivElement>('login-error');
const submitButton = byId<HTMLButtonElement>('login-submit');
const demoButtons = document.querySelectorAll<HTMLButtonElement>('[data-demo-login]');

// Каждая роль попадает только на свою стартовую страницу.
const ROLE_HOME: Record<Role, string> = {
  admin: '/admin.html',
  waiter: '/order.html',
  guest: '/index.html',
};

function homePath(role: Role): string {
  return ROLE_HOME[role] ?? '/index.html';
}

function setFormDisabled(disabled: boolean): void {
  submitButton.disabled = disabled;
  demoButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

async function redirectIfAuthenticated(): Promise<void> {
  try {
    const { user } = await getMe();
    window.location.href = homePath(user.role);
  } catch {
    // Пользователь ещё не вошёл — остаёмся на странице входа.
  }
}

async function submitLogin(loginValue: string, password: string): Promise<void> {
  hideFormError(errorBox);
  setFormDisabled(true);
  submitButton.textContent = 'Входим...';

  try {
    const { user } = await login(loginValue, password);
    window.location.href = homePath(user.role);
  } catch (error) {
    const message =
      error instanceof ApiRequestError
        ? error.message
        : 'Не удалось войти. Попробуйте ещё раз.';
    showFormError(errorBox, message);
  } finally {
    setFormDisabled(false);
    submitButton.textContent = 'Войти';
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const loginValue = loginInput.value.trim();
  const password = passwordInput.value;

  if (!loginValue || !password) {
    showFormError(errorBox, 'Заполните логин и пароль');
    return;
  }

  void submitLogin(loginValue, password);
});

demoButtons.forEach((button) => {
  button.addEventListener('click', () => {
    loginInput.value = button.dataset.demoLogin ?? '';
    passwordInput.value = button.dataset.demoPassword ?? '';
    void submitLogin(loginInput.value, passwordInput.value);
  });
});

void redirectIfAuthenticated();
