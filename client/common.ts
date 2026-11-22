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

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

const RU_MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

/**
 * Разбирает значение даты из API. Дата без времени (ГГГГ-ММ-ДД)
 * трактуется как локальная, чтобы не сдвигать день из-за часового пояса.
 */
function parseDateValue(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3])
    );
  }

  return new Date(value);
}

/**
 * Дата в формате день.месяц.год, например 22.11.2026.
 */
export function formatDate(value: string): string {
  const date = parseDateValue(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/**
 * Время в 24-часовом формате, например 15:50.
 */
export function formatTime(value: string): string {
  const date = parseDateValue(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Дата и время: 22.11.2026, 15:50.
 */
export function formatDateTime(value: string): string {
  const date = parseDateValue(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return `${formatDate(value)}, ${formatTime(value)}`;
}

/**
 * Месяц и год словами: ноябрь 2026. Принимает значение ГГГГ-ММ.
 */
export function formatMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(value.trim());

  if (!match) {
    return value;
  }

  const monthIndex = Number(match[2]) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    return value;
  }

  return `${RU_MONTHS[monthIndex]} ${match[1]}`;
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

/**
 * Преобразует ГГГГ-ММ-ДД в русское представление ДД.ММ.ГГГГ для полей ввода.
 */
export function toRussianDateValue(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());

  if (!match) {
    return value;
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

/**
 * Преобразует ГГГГ-ММ-ДДTЧЧ:ММ в ДД.ММ.ГГГГ ЧЧ:ММ для полей ввода.
 */
export function toRussianDateTimeValue(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(
    value.trim()
  );

  if (!match) {
    return value;
  }

  return `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}`;
}

/**
 * Преобразует ГГГГ-ММ в ММ.ГГГГ для полей ввода.
 */
export function toRussianMonthValue(value: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(value.trim());

  if (!match) {
    return value;
  }

  return `${match[2]}.${match[1]}`;
}

/**
 * Разбирает введённую дату ДД.ММ.ГГГГ и возвращает ГГГГ-ММ-ДД.
 * Возвращает null, если дата некорректна.
 */
export function parseRussianDate(value: string): string | null {
  const match = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Разбирает введённые дату и время ДД.ММ.ГГГГ ЧЧ:ММ и возвращает
 * ГГГГ-ММ-ДДTЧЧ:ММ. Возвращает null, если значение некорректно.
 */
export function parseRussianDateTime(value: string): string | null {
  const match =
    /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})[,\s]+(\d{1,2}):(\d{2})$/.exec(
      value.trim()
    );

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hours)}:${pad2(minutes)}`;
}

/**
 * Разбирает введённый месяц ММ.ГГГГ и возвращает ГГГГ-ММ.
 * Возвращает null, если значение некорректно.
 */
export function parseRussianMonth(value: string): string | null {
  const match = /^(\d{1,2})[.\/-](\d{4})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const year = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return `${year}-${pad2(month)}`;
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
        <span class="brand-mark">Л</span>
        <span class="brand-text"><strong>Лотос</strong><small>японский ресторан</small></span>
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
