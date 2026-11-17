import {
  ApiRequestError,
  createOrder,
  getBookings,
  getDishes,
  getEmployees,
  getFreeTables,
  getMenu,
  getOrders,
  getSupplies,
  getTables,
  updateBookingStatus,
  updateOrderStatus,
} from './api.js';
import {
  byId,
  categoryIcon,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatPrice,
  formatTime,
  hideFormError,
  initShell,
  showFormError,
  showToast,
  statusClass,
} from './common.js';
import {
  Booking,
  CartLine,
  Category,
  Dish,
  Employee,
  Order,
  Supply,
  Table,
} from './types.js';

const tabs = document.querySelectorAll<HTMLButtonElement>('[data-tab]');
const panels = document.querySelectorAll<HTMLElement>('[data-panel]');

const catalog = byId<HTMLDivElement>('catalog');
const catalogSearch = byId<HTMLInputElement>('catalog-search');
const cartItems = byId<HTMLDivElement>('cart-items');
const cartTotal = byId<HTMLElement>('cart-total');
const clearCartButton = byId<HTMLButtonElement>('clear-cart');
const orderTable = byId<HTMLSelectElement>('order-table');
const orderWaiter = byId<HTMLSelectElement>('order-waiter');
const orderError = byId<HTMLDivElement>('order-error');
const submitOrderButton = byId<HTMLButtonElement>('submit-order');

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
const dishesList = byId<HTMLDivElement>('dishes-list');
const refreshDishesButton = byId<HTMLButtonElement>('refresh-dishes');

let menu: Category[] = [];
let tables: Table[] = [];
let waiters: Employee[] = [];
let catalogQuery = '';

let activeTab = 'new';
let bookingsRefreshTimer: number | undefined;

const cart = new Map<number, CartLine>();

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

function findDish(dishId: number): Dish | null {
  for (const category of menu) {
    const dish = category.dishes?.find((item) => item.dishId === dishId);
    if (dish) {
      return dish;
    }
  }

  return null;
}

function renderCatalog(): void {
  const query = catalogQuery.toLowerCase();

  const filtered = menu
    .map((category) => ({
      ...category,
      dishes: (category.dishes ?? []).filter((dish) =>
        `${dish.name} ${dish.description ?? ''}`.toLowerCase().includes(query)
      ),
    }))
    .filter((category) => (category.dishes?.length ?? 0) > 0);

  if (filtered.length === 0) {
    catalog.innerHTML = `
      <div class="empty-state compact">
        <span class="empty-icon">🍽️</span>
        <p>Блюда не найдены</p>
      </div>
    `;
    return;
  }

  catalog.innerHTML = filtered
    .map(
      (category) => `
        <section class="catalog-category">
          <h3><span class="section-icon">${categoryIcon(category.name)}</span>${escapeHtml(
            category.name
          )}</h3>
          <div class="catalog-list">
            ${(category.dishes ?? [])
              .map(
                (dish) => `
                  <div class="catalog-item">
                    <div class="catalog-info">
                      <strong>${escapeHtml(dish.name)}</strong>
                      <span class="muted">
                        ${dish.weightGrams ? `${dish.weightGrams} г` : ''}
                        ${dish.description ? ` · ${escapeHtml(dish.description)}` : ''}
                      </span>
                    </div>
                    <span class="catalog-price">${formatPrice(dish.price)}</span>
                    <button type="button" class="btn btn-ghost btn-small" data-add-dish="${
                      dish.dishId
                    }">Добавить</button>
                  </div>
                `
              )
              .join('')}
          </div>
        </section>
      `
    )
    .join('');
}

function renderCart(): void {
  if (cart.size === 0) {
    cartItems.innerHTML = `
      <div class="empty-state compact">
        <span class="empty-icon">🧺</span>
        <p>Добавьте блюда из меню</p>
      </div>
    `;
    cartTotal.textContent = formatPrice(0);
    return;
  }

  let total = 0;

  cartItems.innerHTML = Array.from(cart.values())
    .map((line) => {
      const sum = Number(line.dish.price) * line.quantity;
      total += sum;

      return `
        <div class="cart-item">
          <div class="cart-item-info">
            <strong>${escapeHtml(line.dish.name)}</strong>
            <span class="muted">${formatPrice(line.dish.price)}</span>
          </div>
          <div class="qty-control">
            <button type="button" class="icon-btn" data-cart-minus="${
              line.dish.dishId
            }" aria-label="Уменьшить">−</button>
            <span>${line.quantity}</span>
            <button type="button" class="icon-btn" data-cart-plus="${
              line.dish.dishId
            }" aria-label="Увеличить">+</button>
          </div>
          <span class="cart-sum">${formatPrice(sum)}</span>
          <button type="button" class="icon-btn icon-danger" data-cart-remove="${
            line.dish.dishId
          }" aria-label="Удалить">×</button>
        </div>
      `;
    })
    .join('');

  cartTotal.textContent = formatPrice(total);
}

function addToCart(dishId: number): void {
  const dish = findDish(dishId);
  if (!dish) {
    showToast('Блюдо не найдено в меню', 'error');
    return;
  }

  const line = cart.get(dishId);
  if (line) {
    if (line.quantity >= 100) {
      showToast('Максимум 100 порций одного блюда', 'error');
      return;
    }
    line.quantity += 1;
  } else {
    cart.set(dishId, { dish, quantity: 1 });
  }

  renderCart();
}

function changeCartQuantity(dishId: number, delta: number): void {
  const line = cart.get(dishId);
  if (!line) {
    return;
  }

  const next = line.quantity + delta;
  if (next <= 0) {
    cart.delete(dishId);
  } else if (next <= 100) {
    line.quantity = next;
  }

  renderCart();
}

async function loadMenu(): Promise<void> {
  catalog.innerHTML =
    '<div class="empty-state compact"><p>Загружаем меню...</p></div>';

  try {
    const response = await getMenu();
    menu = response.categories;
    renderCatalog();
  } catch (error) {
    catalog.innerHTML = `
      <div class="empty-state compact">
        <p>${escapeHtml(
          error instanceof ApiRequestError ? error.message : 'Не удалось загрузить меню'
        )}</p>
      </div>
    `;
  }
}

async function loadFreeTables(): Promise<void> {
  const previous = orderTable.value;

  try {
    const response = await getFreeTables();
    tables = response.tables;

    if (tables.length === 0) {
      orderTable.innerHTML = '<option value="">Нет свободных столов</option>';
      return;
    }

    orderTable.innerHTML =
      '<option value="">Выберите стол</option>' +
      tables
        .map(
          (table) =>
            `<option value="${table.tableId}">Стол №${table.tableNumber} · до ${table.capacity} гостей · ${escapeHtml(
              table.location
            )}</option>`
        )
        .join('');

    if (previous && tables.some((table) => String(table.tableId) === previous)) {
      orderTable.value = previous;
    }
  } catch (error) {
    orderTable.innerHTML = '<option value="">Не удалось загрузить столы</option>';
    showToast(
      error instanceof ApiRequestError ? error.message : 'Не удалось загрузить столы',
      'error'
    );
  }
}

async function loadWaiters(): Promise<void> {
  const previous = orderWaiter.value;

  try {
    const response = await getEmployees('официант');
    waiters = response.employees;

    if (waiters.length === 0) {
      orderWaiter.innerHTML = '<option value="">Нет доступных официантов</option>';
      return;
    }

    orderWaiter.innerHTML =
      '<option value="">Выберите официанта</option>' +
      waiters
        .map(
          (employee) =>
            `<option value="${employee.employeeId}">${escapeHtml(employee.fullName)}</option>`
        )
        .join('');

    if (previous && waiters.some((employee) => String(employee.employeeId) === previous)) {
      orderWaiter.value = previous;
    }
  } catch (error) {
    orderWaiter.innerHTML = '<option value="">Не удалось загрузить сотрудников</option>';
    showToast(
      error instanceof ApiRequestError
        ? error.message
        : 'Не удалось загрузить список официантов',
      'error'
    );
  }
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
        <p>Создайте первый заказ на вкладке «Новый заказ».</p>
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
  // Пустая дата означает «показать все брони».
  const date = bookingsDate.value || undefined;

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

async function loadDishes(): Promise<void> {
  dishesList.innerHTML =
    '<div class="empty-state compact"><p>Загружаем блюда...</p></div>';

  try {
    const response = await getDishes();

    if (response.dishes.length === 0) {
      dishesList.innerHTML = renderEmptyState(
        '🍣',
        'Блюд нет',
        'В меню пока не добавлено ни одного блюда.'
      );
      return;
    }

    dishesList.innerHTML = renderTable(
      ['Категория', 'Блюдо', 'Вес', 'Цена', 'Доступность'],
      response.dishes.map((dish: Dish) => [
        escapeHtml(dish.categoryName ?? '—'),
        `<strong>${escapeHtml(dish.name)}</strong>`,
        dish.weightGrams ? `${dish.weightGrams} г` : '—',
        formatPrice(dish.price),
        dish.isAvailable === false
          ? '<span class="status-badge status-cancelled">недоступно</span>'
          : '<span class="status-badge status-paid">доступно</span>',
      ])
    );
  } catch (error) {
    renderListError(dishesList, error, 'Не удалось загрузить блюда');
  }
}

async function changeOrderStatus(orderId: number, nextStatus: string): Promise<void> {
  try {
    await updateOrderStatus(orderId, nextStatus);
    showToast(`Статус заказа изменён на «${nextStatus}»`, 'success');
    await Promise.all([loadOrders(), loadFreeTables()]);
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
    await Promise.all([loadBookings(true), loadFreeTables()]);
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
    // Бронь может создать гость в другом окне: держим список актуальным
    // без ручного нажатия «Обновить».
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
  if (tab === 'dishes') {
    void loadDishes();
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

function setupCatalog(): void {
  catalog.addEventListener('click', (event) => {
    const button = closestButton(event.target, '[data-add-dish]');
    if (!button) {
      return;
    }

    const dishId = Number(button.dataset.addDish);
    if (Number.isInteger(dishId)) {
      addToCart(dishId);
    }
  });

  catalogSearch.addEventListener('input', () => {
    catalogQuery = catalogSearch.value.trim();
    renderCatalog();
  });
}

function setupCart(): void {
  cartItems.addEventListener('click', (event) => {
    const plus = closestButton(event.target, '[data-cart-plus]');
    if (plus) {
      changeCartQuantity(Number(plus.dataset.cartPlus), 1);
      return;
    }

    const minus = closestButton(event.target, '[data-cart-minus]');
    if (minus) {
      changeCartQuantity(Number(minus.dataset.cartMinus), -1);
      return;
    }

    const remove = closestButton(event.target, '[data-cart-remove]');
    if (remove) {
      cart.delete(Number(remove.dataset.cartRemove));
      renderCart();
    }
  });

  clearCartButton.addEventListener('click', () => {
    cart.clear();
    renderCart();
  });
}

function setupOrderForm(): void {
  submitOrderButton.addEventListener('click', () => {
    void submitOrder();
  });
}

async function submitOrder(): Promise<void> {
  hideFormError(orderError);

  const tableId = Number(orderTable.value);
  const employeeId = Number(orderWaiter.value);

  if (!tableId) {
    showFormError(orderError, 'Выберите свободный стол');
    return;
  }
  if (!employeeId) {
    showFormError(orderError, 'Выберите официанта');
    return;
  }
  if (cart.size === 0) {
    showFormError(orderError, 'Добавьте в заказ хотя бы одно блюдо');
    return;
  }

  submitOrderButton.disabled = true;
  submitOrderButton.textContent = 'Создаём заказ...';

  try {
    const response = await createOrder({
      tableId,
      employeeId,
      items: Array.from(cart.values()).map((line) => ({
        dishId: line.dish.dishId,
        quantity: line.quantity,
      })),
    });

    showToast(
      `Заказ №${response.order.orderId} создан на сумму ${formatPrice(
        response.order.total
      )}`,
      'success'
    );

    cart.clear();
    renderCart();
    await Promise.all([loadFreeTables(), loadOrders()]);
  } catch (error) {
    showFormError(
      orderError,
      error instanceof ApiRequestError ? error.message : 'Не удалось создать заказ'
    );
  } finally {
    submitOrderButton.disabled = false;
    submitOrderButton.textContent = 'Создать заказ';
  }
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
  clearBookingsDateButton.addEventListener('click', () => {
    // Сброс фильтра: новая бронь на другую дату не должна теряться.
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
  refreshDishesButton.addEventListener('click', () => void loadDishes());
}

function applyPreselectedDish(): void {
  const raw = sessionStorage.getItem('iris.preselectDish');
  if (!raw) {
    return;
  }

  sessionStorage.removeItem('iris.preselectDish');
  const dishId = Number(raw);

  if (Number.isInteger(dishId)) {
    addToCart(dishId);
  }
}

async function init(): Promise<void> {
  const user = await initShell('admin', true);
  if (!user) {
    return;
  }

  setupTabs();
  setupCatalog();
  setupCart();
  setupOrderForm();
  setupOrders();
  setupBookings();
  setupReferenceSections();

  // Возврат в окно панели тоже обновляет брони: гость мог создать новую,
  // пока администратор работал в другом окне или вкладке.
  window.addEventListener('focus', () => {
    if (activeTab === 'bookings') {
      void loadBookings(true);
    }
  });

  await Promise.all([loadMenu(), loadFreeTables(), loadWaiters()]);
  renderCart();
  applyPreselectedDish();
}

void init();
