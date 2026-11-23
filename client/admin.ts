import { initAnalytics } from './analytics.js';
import {
  ApiRequestError,
  getBookings,
  getEmployees,
  getOrders,
  getSupplies,
  getTables,
  updateBookingStatus,
  updateOrderStatus,
} from './api.js';
import {
  byId,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatPrice,
  formatTime,
  initShell,
  parseRussianDate,
  showToast,
  statusClass,
} from './common.js';
import { Booking, Employee, Order, Supply, Table } from './types.js';

const tabs = document.querySelectorAll<HTMLButtonElement>('[data-tab]');
const panels = document.querySelectorAll<HTMLElement>('[data-panel]');

const ordersStatusFilter = byId<HTMLSelectElement>('orders-status-filter');
const refreshOrdersButton = byId<HTMLButtonElement>('refresh-orders');
const ordersList = byId<HTMLDivElement>('orders-list');

const bookingsDate = byId<HTMLInputElement>('bookings-date');
const refreshBookingsButton = byId<HTMLButtonElement>('refresh-bookings');
const clearBookingsDateButton = byId<HTMLButtonElement>('clear-bookings-date');
const bookingsList = byId<HTMLDivElement>('bookings-list');

const employeesList = byId<HTMLDivElement>('employees-list');
const refreshEmployeesButton = byId<HTMLButtonElement>('refresh-employees');
const tablesList = byId<HTMLDivElement>('tables-list');
const refreshTablesButton = byId<HTMLButtonElement>('refresh-tables');
const suppliesList = byId<HTMLDivElement>('supplies-list');
const refreshSuppliesButton = byId<HTMLButtonElement>('refresh-supplies');

let activeTab = 'orders';
let bookingsRefreshTimer: number | undefined;

interface StatusAction {
  status: string;
  label: string;
  variant: string;
}

const ORDER_ACTIONS: Record<string, StatusAction[]> = {
  'новый': [
    { status: 'готовится', label: 'Отправить на кухню', variant: 'btn-primary' },
    { status: 'отменён', label: 'Отменить', variant: 'btn-danger' },
  ],
  'готовится': [
    { status: 'подан', label: 'Блюда поданы', variant: 'btn-primary' },
    { status: 'отменён', label: 'Отменить', variant: 'btn-danger' },
  ],
  'подан': [
    { status: 'оплачен', label: 'Оплачен', variant: 'btn-primary' },
    { status: 'отменён', label: 'Отменить', variant: 'btn-danger' },
  ],
  'оплачен': [{ status: 'закрыт', label: 'Закрыть заказ', variant: 'btn-primary' }],
  'закрыт': [],
  'отменён': [],
};

const BOOKING_ACTIONS: Record<string, StatusAction[]> = {
  'новая': [
    { status: 'подтверждена', label: 'Подтвердить', variant: 'btn-primary' },
    { status: 'отменена', label: 'Отменить', variant: 'btn-danger' },
  ],
  'подтверждена': [
    { status: 'выполнена', label: 'Выполнена', variant: 'btn-primary' },
    { status: 'отменена', label: 'Отменить', variant: 'btn-danger' },
  ],
  'отменена': [],
  'выполнена': [],
};

function closestButton(
  target: EventTarget | null,
  selector: string
): HTMLButtonElement | null {
  return target instanceof HTMLElement
    ? target.closest<HTMLButtonElement>(selector)
    : null;
}

function renderStatusActions(
  actions: StatusAction[],
  kind: 'order' | 'booking',
  id: number
): string {
  if (actions.length === 0) {
    return '';
  }

  return `
    <div class="${kind}-actions">
      ${actions
        .map(
          (action) => `
            <button type="button"
                    class="btn btn-small ${action.variant}"
                    data-${kind}-id="${id}"
                    data-next-status="${action.status}">
              ${action.label}
            </button>
          `
        )
        .join('')}
    </div>
  `;
}

function renderOrders(orders: Order[]): void {
  if (orders.length === 0) {
    ordersList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🧾</span>
        <h3>Заказов пока нет</h3>
        <p>Официанты ещё не создали ни одного заказа.</p>
      </div>
    `;
    return;
  }

  ordersList.innerHTML = orders
    .map((order) => {
      const items = order.items
        .map(
          (item) => `
            <li>
              <span>${escapeHtml(item.name)}</span>
              <span class="muted">${item.quantity} × ${formatPrice(item.unitPrice)}</span>
            </li>
          `
        )
        .join('');

      return `
        <article class="order-card">
          <div class="order-head">
            <div class="order-id">
              <strong>Заказ №${order.orderId}</strong>
              <span class="muted">${formatDateTime(order.createdAt)}</span>
            </div>
            <span class="status-badge ${statusClass(order.status)}">${escapeHtml(
              order.status
            )}</span>
          </div>
          <div class="order-meta">
            <span>Стол №${order.tableNumber}</span>
            <span>Официант: ${escapeHtml(order.employeeName)}</span>
            <strong class="order-total">${formatPrice(order.total)}</strong>
          </div>
          <ul class="order-items">${items}</ul>
          ${renderStatusActions(ORDER_ACTIONS[order.status] ?? [], 'order', order.orderId)}
        </article>
      `;
    })
    .join('');
}

function renderBookings(bookings: Booking[]): void {
  if (bookings.length === 0) {
    bookingsList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📅</span>
        <h3>Броней нет</h3>
        <p>Измените фильтр по дате или оформите бронь на странице меню.</p>
      </div>
    `;
    return;
  }

  bookingsList.innerHTML = bookings
    .map(
      (booking) => `
        <article class="booking-card">
          <div class="booking-head">
            <div class="booking-id">
              <strong>${escapeHtml(booking.customerName)}</strong>
              <span class="muted">${formatDate(booking.bookingTime)} в ${formatTime(
                booking.bookingTime
              )}</span>
            </div>
            <span class="status-badge ${statusClass(booking.status)}">${escapeHtml(
              booking.status
            )}</span>
          </div>
          <div class="booking-meta">
            <span>Телефон: ${escapeHtml(booking.phone)}</span>
            <span>Стол №${booking.tableNumber ?? booking.tableId}</span>
            <span>Гостей: ${booking.guestsCount}</span>
          </div>
          ${renderStatusActions(
            BOOKING_ACTIONS[booking.status] ?? [],
            'booking',
            booking.bookingId
          )}
        </article>
      `
    )
    .join('');
}

async function loadOrders(): Promise<void> {
  ordersList.innerHTML =
    '<div class="empty-state compact"><p>Загружаем заказы...</p></div>';

  try {
    const response = await getOrders({
      status: ordersStatusFilter.value || undefined,
    });
    renderOrders(response.orders);
  } catch (error) {
    ordersList.innerHTML = `
      <div class="empty-state compact">
        <p>${escapeHtml(
          error instanceof ApiRequestError ? error.message : 'Не удалось загрузить заказы'
        )}</p>
      </div>
    `;
  }
}

async function loadBookings(silent = false): Promise<void> {
  const rawDate = bookingsDate.value.trim();
  let date: string | undefined;

  if (rawDate) {
    const parsedDate = parseRussianDate(rawDate);

    if (!parsedDate) {
      if (!silent) {
        bookingsList.innerHTML = `
          <div class="empty-state compact">
            <p>Укажите дату в формате дд.мм.гггг</p>
          </div>
        `;
      }
      return;
    }

    date = parsedDate;
  }

  if (!silent) {
    bookingsList.innerHTML =
      '<div class="empty-state compact"><p>Загружаем брони...</p></div>';
  }

  try {
    const response = await getBookings(date);
    renderBookings(response.bookings);
  } catch (error) {
    if (silent) {
      return;
    }

    bookingsList.innerHTML = `
      <div class="empty-state compact">
        <p>${escapeHtml(
          error instanceof ApiRequestError ? error.message : 'Не удалось загрузить брони'
        )}</p>
      </div>
    `;
  }
}

const BOOKINGS_REFRESH_INTERVAL = 10_000;

function startBookingsAutoRefresh(): void {
  stopBookingsAutoRefresh();
  bookingsRefreshTimer = window.setInterval(
    () => void loadBookings(true),
    BOOKINGS_REFRESH_INTERVAL
  );
}

function stopBookingsAutoRefresh(): void {
  if (bookingsRefreshTimer !== undefined) {
    window.clearInterval(bookingsRefreshTimer);
    bookingsRefreshTimer = undefined;
  }
}

function renderTable(headers: string[], rows: string[][]): string {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows
            .map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyState(icon: string, title: string, text: string): string {
  return `
    <div class="empty-state">
      <span class="empty-icon">${icon}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

function renderListError(container: HTMLElement, error: unknown, fallback: string): void {
  container.innerHTML = `
    <div class="empty-state compact">
      <p>${escapeHtml(error instanceof ApiRequestError ? error.message : fallback)}</p>
    </div>
  `;
}

async function loadEmployees(): Promise<void> {
  employeesList.innerHTML =
    '<div class="empty-state compact"><p>Загружаем сотрудников...</p></div>';

  try {
    const response = await getEmployees();

    if (response.employees.length === 0) {
      employeesList.innerHTML = renderEmptyState(
        '👥',
        'Сотрудников нет',
        'В базе пока не добавлен ни один сотрудник.'
      );
      return;
    }

    employeesList.innerHTML = renderTable(
      ['ФИО', 'Должность', 'Телефон'],
      response.employees.map((employee: Employee) => [
        `<strong>${escapeHtml(employee.fullName)}</strong>`,
        escapeHtml(employee.position),
        escapeHtml(employee.phone),
      ])
    );
  } catch (error) {
    renderListError(employeesList, error, 'Не удалось загрузить сотрудников');
  }
}

async function loadTables(): Promise<void> {
  tablesList.innerHTML =
    '<div class="empty-state compact"><p>Загружаем столы...</p></div>';

  try {
    const response = await getTables();

    if (response.tables.length === 0) {
      tablesList.innerHTML = renderEmptyState(
        '🪑',
        'Столов нет',
        'В базе пока не добавлен ни один стол.'
      );
      return;
    }

    tablesList.innerHTML = renderTable(
      ['Стол', 'Вместимость', 'Расположение', 'Статус'],
      response.tables.map((table: Table) => [
        `<strong>№${table.tableNumber}</strong>`,
        `${table.capacity} гостей`,
        escapeHtml(table.location),
        `<span class="status-badge ${statusClass(table.status)}">${escapeHtml(
          table.status
        )}</span>`,
      ])
    );
  } catch (error) {
    renderListError(tablesList, error, 'Не удалось загрузить столы');
  }
}

async function loadSupplies(): Promise<void> {
  suppliesList.innerHTML =
    '<div class="empty-state compact"><p>Загружаем поставки...</p></div>';

  try {
    const response = await getSupplies();

    if (response.supplies.length === 0) {
      suppliesList.innerHTML = renderEmptyState(
        '📦',
        'Поставок нет',
        'В базе пока не зарегистрировано ни одной поставки.'
      );
      return;
    }

    suppliesList.innerHTML = renderTable(
      ['Дата', 'Поставщик', 'Накладная', 'Сумма'],
      response.supplies.map((supply: Supply) => [
        formatDate(supply.supplyDate),
        `<strong>${escapeHtml(supply.supplier)}</strong>`,
        escapeHtml(supply.invoiceNumber),
        formatPrice(supply.amount),
      ])
    );
  } catch (error) {
    renderListError(suppliesList, error, 'Не удалось загрузить поставки');
  }
}

async function changeOrderStatus(orderId: number, nextStatus: string): Promise<void> {
  try {
    await updateOrderStatus(orderId, nextStatus);
    showToast(`Статус заказа изменён на «${nextStatus}»`, 'success');
    await Promise.all([loadOrders(), loadTables()]);
  } catch (error) {
    showToast(
      error instanceof ApiRequestError ? error.message : 'Не удалось изменить статус заказа',
      'error'
    );
    await loadOrders();
  }
}

async function changeBookingStatus(
  bookingId: number,
  nextStatus: string
): Promise<void> {
  try {
    await updateBookingStatus(bookingId, nextStatus);
    showToast(`Статус брони изменён на «${nextStatus}»`, 'success');
    await Promise.all([loadBookings(true), loadTables()]);
  } catch (error) {
    showToast(
      error instanceof ApiRequestError ? error.message : 'Не удалось изменить статус брони',
      'error'
    );
    await loadBookings(true);
  }
}

function switchTab(tab: string): void {
  activeTab = tab;

  tabs.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === tab);
  });

  panels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.panel === tab);
  });

  if (tab === 'orders') {
    void loadOrders();
  }
  if (tab === 'bookings') {
    void loadBookings();
    startBookingsAutoRefresh();
  } else {
    stopBookingsAutoRefresh();
  }
  if (tab === 'employees') {
    void loadEmployees();
  }
  if (tab === 'tables') {
    void loadTables();
  }
  if (tab === 'supplies') {
    void loadSupplies();
  }
  if (tab === 'analytics') {
    void initAnalytics();
  }
}

function setupTabs(): void {
  tabs.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      if (tab) {
        switchTab(tab);
      }
    });
  });
}

function setupOrders(): void {
  refreshOrdersButton.addEventListener('click', () => void loadOrders());
  ordersStatusFilter.addEventListener('change', () => void loadOrders());

  ordersList.addEventListener('click', (event) => {
    const button = closestButton(
      event.target,
      '[data-order-id][data-next-status]'
    );
    if (!button) {
      return;
    }

    const orderId = Number(button.dataset.orderId);
    const nextStatus = button.dataset.nextStatus;
    if (!orderId || !nextStatus) {
      return;
    }

    button.disabled = true;
    void changeOrderStatus(orderId, nextStatus);
  });
}

function setupBookings(): void {
  refreshBookingsButton.addEventListener('click', () => void loadBookings());
  bookingsDate.addEventListener('change', () => void loadBookings());
  bookingsDate.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void loadBookings();
    }
  });
  clearBookingsDateButton.addEventListener('click', () => {
    bookingsDate.value = '';
    void loadBookings();
  });

  bookingsList.addEventListener('click', (event) => {
    const button = closestButton(
      event.target,
      '[data-booking-id][data-next-status]'
    );
    if (!button) {
      return;
    }

    const bookingId = Number(button.dataset.bookingId);
    const nextStatus = button.dataset.nextStatus;
    if (!bookingId || !nextStatus) {
      return;
    }

    button.disabled = true;
    void changeBookingStatus(bookingId, nextStatus);
  });
}

function setupReferenceSections(): void {
  refreshEmployeesButton.addEventListener('click', () => void loadEmployees());
  refreshTablesButton.addEventListener('click', () => void loadTables());
  refreshSuppliesButton.addEventListener('click', () => void loadSupplies());
}

async function init(): Promise<void> {
  const user = await initShell('admin', ['admin']);
  if (!user) {
    return;
  }

  setupTabs();
  setupOrders();
  setupBookings();
  setupReferenceSections();

  window.addEventListener('focus', () => {
    if (activeTab === 'bookings') {
      void loadBookings(true);
    }
  });

  const tabFromHash = window.location.hash.replace('#', '');
  const knownTabs = ['orders', 'bookings', 'employees', 'tables', 'supplies', 'analytics'];
  switchTab(knownTabs.includes(tabFromHash) ? tabFromHash : 'orders');
}

void init();
