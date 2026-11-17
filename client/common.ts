import { ApiRequestError, getMe, logout } from './api.js';
import { User } from './types.js';

export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Элемент #${id} не найден на странице`);
  }

  return element as T;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

const priceFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatPrice(value: number | string): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? priceFormatter.format(numeric) : '—';
}

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

export function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : timeFormatter.format(date);
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function todayInputDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function defaultBookingDateTime(): string {
  const date = new Date();
  date.setHours(date.getHours() + 2);

  const minutes = date.getMinutes();
  const roundedMinutes = minutes <= 30 ? 30 : 60;
  date.setMinutes(roundedMinutes, 0, 0);

  return toDateTimeLocalValue(date);
}

export function categoryIcon(name: string): string {
  const icons: Record<string, string> = {
    'Суши': '🍣',
    'Роллы': '🍥',
    'Горячие блюда': '🍜',
    'Супы': '🍲',
    'Напитки': '🍵',
    'Десерты': '🍡',
  };

  return icons[name] ?? '🍱';
}

export function statusClass(status: string): string {
  const classes: Record<string, string> = {
    'новый': 'status-new',
    'готовится': 'status-cooking',
    'подан': 'status-served',
    'оплачен': 'status-paid',
    'закрыт': 'status-closed',
    'отменён': 'status-cancelled',
    'новая': 'status-new',
    'подтверждена': 'status-confirmed',
    'отменена': 'status-cancelled',
    'выполнена': 'status-closed',
    'свободен': 'status-paid',
    'забронирован': 'status-confirmed',
    'занят': 'status-cooking',
  };

  return classes[status] ?? 'status-new';
}

export function showToast(
  message: string,
  type: 'success' | 'error' | 'info' = 'info'
): void {
  let container = document.getElementById('toast-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('toast-hide');
    window.setTimeout(() => toast.remove(), 300);
  }, 3500);
}

export function showFormError(element: HTMLElement, message: string): void {
  element.textContent = message;
  element.hidden = false;
}

export function hideFormError(element: HTMLElement): void {
  element.textContent = '';
  element.hidden = true;
}

function renderHeader(user: User, active: 'menu' | 'admin'): void {
  const header = document.getElementById('app-header');

  if (!header) {
    return;
  }

  const roleLabel = user.role === 'admin' ? 'Администратор' : 'Гость';
  const isAdmin = user.role === 'admin';
  // Администратору раздел «Меню» не показываем: список блюд есть в панели управления.
  const homeHref = isAdmin ? '/order.html' : '/index.html';
  const navLinks = isAdmin
    ? `<a href="/order.html" class="nav-link ${
        active === 'admin' ? 'is-active' : ''
      }">Панель управления</a>`
    : `<a href="/index.html" class="nav-link ${active === 'menu' ? 'is-active' : ''}">Меню</a>`;

  header.innerHTML = `
    <header class="site-header">
      <a class="brand" href="${homeHref}">
        <span class="brand-mark">И</span>
        <span class="brand-text"><strong>Ирис</strong><small>японский ресторан</small></span>
      </a>
      <nav class="main-nav">
        ${navLinks}
      </nav>
      <div class="user-box">
        <span class="user-name">${escapeHtml(user.fullName)}</span>
        <span class="role-badge role-${user.role}">${roleLabel}</span>
        <button id="logout-button" type="button" class="btn btn-ghost btn-small">Выйти</button>
      </div>
    </header>
  `;

  document.getElementById('logout-button')?.addEventListener('click', async () => {
    try {
      await logout();
    } catch {
      // Сессия могла уже завершиться — всё равно уводим на страницу входа.
    }
    window.location.href = '/login.html';
  });
}

export async function initShell(
  active: 'menu' | 'admin',
  requireAdmin = false
): Promise<User | null> {
  try {
    const { user } = await getMe();

    if (requireAdmin && user.role !== 'admin') {
      window.location.href = '/index.html';
      return null;
    }

    renderHeader(user, active);
    return user;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      window.location.href = '/login.html';
      return null;
    }

    showToast('Не удалось загрузить данные пользователя', 'error');
    return null;
  }
}
