import {
  ApiRequestError,
  getAnalyticsBookingsToday,
  getAnalyticsDishes,
  getAnalyticsDishPrice,
  getAnalyticsEmployees,
  getAnalyticsFreeTables,
  getAnalyticsOrders,
  getAnalyticsSupplies,
  getAnalyticsSupplyAmount,
  getAnalyticsTopDishes,
  getAnalyticsWaiterOrders,
  getDishes,
  getEmployees,
  getMenu,
  getSupplies,
} from './api.js';
import {
  defaultBookingDateTime,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatMonth,
  formatPrice,
  formatTime,
  parseRussianDate,
  parseRussianDateTime,
  parseRussianMonth,
  showToast,
  statusClass,
  todayInputDate,
  toRussianDateValue,
  toRussianDateTimeValue,
  toRussianMonthValue,
} from './common.js';
import {
  Category,
  Dish,
  Employee,
  Order,
  Supply,
  Table,
  TopDishAnalytics,
} from './types.js';

const EMPLOYEE_POSITIONS = [
  'директор',
  'администратор',
  'официант',
  'повар',
  'кладовщик',
  'бармен',
];

let initialized = false;
let categories: Category[] = [];
let dishes: Dish[] = [];
let waiters: Employee[] = [];
let supplies: Supply[] = [];

function inputValue(id: string): string {
  const element = document.getElementById(id) as
    | HTMLInputElement
    | HTMLSelectElement
    | null;

  return element?.value ?? '';
}

function requiredRussianDate(id: string): string | undefined {
  const raw = inputValue(id).trim();

  if (!raw) {
    return undefined;
  }

  const parsed = parseRussianDate(raw);

  if (!parsed) {
    throw new Error('Укажите дату в формате дд.мм.гггг');
  }

  return parsed;
}

function requiredRussianDateTime(id: string): string | undefined {
  const raw = inputValue(id).trim();

  if (!raw) {
    return undefined;
  }

  const parsed = parseRussianDateTime(raw);

  if (!parsed) {
    throw new Error('Укажите дату и время в формате дд.мм.гггг чч:мм');
  }

  return parsed;
}

function requiredRussianMonth(id: string): string | undefined {
  const raw = inputValue(id).trim();

  if (!raw) {
    return undefined;
  }

  const parsed = parseRussianMonth(raw);

  if (!parsed) {
    throw new Error('Укажите месяц в формате мм.гггг');
  }

  return parsed;
}

function monthStartInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function currentMonthInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function options(
  values: Array<{ value: string | number; label: string }>
): string {
  return values
    .map(
      (item) =>
        `<option value="${escapeHtml(String(item.value))}">${escapeHtml(
          item.label
        )}</option>`
    )
    .join('');
}

function renderStatusBadge(status: string): string {
  return `<span class="status-badge ${statusClass(status)}">${escapeHtml(
    status
  )}</span>`;
}

function renderTable(
  container: HTMLElement,
  headers: string[],
  rows: string[][],
  summary?: string
): void {
  const summaryHtml = summary
    ? `<p class="analytics-summary">${summary}</p>`
    : '';

  if (rows.length === 0) {
    container.innerHTML = `
      ${summaryHtml}
      <div class="empty-state compact">
        <p>По заданным параметрам данных нет.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    ${summaryHtml}
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (cells) =>
                `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderError(
  container: HTMLElement,
  error: unknown,
  fallback: string
): void {
  container.innerHTML = `
    <div class="empty-state compact">
      <p>${escapeHtml(
        error instanceof ApiRequestError ? error.message : fallback
      )}</p>
    </div>
  `;
}

function card(
  id: string,
  number: number,
  title: string,
  description: string,
  controls: string
): string {
  return `
    <article class="analytics-card">
      <div class="analytics-card-head">
        <span class="analytics-number">${number}</span>
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p class="muted">${escapeHtml(description)}</p>
        </div>
      </div>
      <div class="analytics-controls">${controls}</div>
      <button type="button" class="btn btn-primary btn-small" data-analytics-run="${id}">
        Выполнить запрос
      </button>
      <div class="analytics-result" data-analytics-result="${id}">
        <p class="muted analytics-placeholder">Нажмите «Выполнить запрос».</p>
      </div>
    </article>
  `;
}

function renderAnalyticsCards(): void {
  const grid = document.getElementById('analytics-grid');
  if (!grid) {
    return;
  }

  const supplierValues = Array.from(
    new Set(supplies.map((supply) => supply.supplier))
  )
    .sort((left, right) => left.localeCompare(right, 'ru'))
    .map((supplier) => ({ value: supplier, label: supplier }));

  grid.innerHTML = [
    card(
      'dishes',
      1,
      'Блюда заданной категории',
      'Список блюд выбранной категории с ценой, весом и доступностью.',
      `<label class="field analytics-field">
         <span>Категория</span>
         <select id="analytics-category">
           ${options(
             categories.map((category) => ({
               value: category.categoryId,
               label: category.name,
             }))
           )}
         </select>
       </label>`
    ),
    card(
      'dish-price',
      2,
      'Стоимость конкретного блюда',
      'Карточка блюда с актуальной ценой и описанием.',
      `<label class="field analytics-field">
         <span>Блюдо</span>
         <select id="analytics-dish">
           ${options(
             dishes.map((dish) => ({
               value: dish.dishId,
               label: `${dish.name} — ${formatPrice(dish.price)}`,
             }))
           )}
         </select>
       </label>`
    ),
    card(
      'bookings-today',
      3,
      'Брони на текущий день',
      'Все брони на сегодня с контактами клиентов и статусами.',
      '<p class="muted analytics-note">Параметры не нужны — используется текущая дата.</p>'
    ),
    card(
      'free-tables',
      4,
      'Свободные столы на время',
      'Столы, которые не заняты активным заказом и не забронированы на выбранное время.',
      `<label class="field analytics-field">
         <span>Дата и время</span>
         <input
           id="analytics-free-datetime"
           type="text"
           autocomplete="off"
           placeholder="дд.мм.гггг чч:мм"
           value="${toRussianDateTimeValue(defaultBookingDateTime())}"
         >
       </label>
       <label class="field analytics-field">
         <span>Гостей</span>
         <input id="analytics-free-guests" type="number" min="1" max="20" value="2">
       </label>`
    ),
    card(
      'waiter-orders',
      5,
      'Заказы официанта за смену',
      'Все заказы выбранного официанта за указанную дату.',
      `<label class="field analytics-field">
         <span>Официант</span>
         <select id="analytics-waiter">
           ${options(
             waiters.map((waiter) => ({
               value: waiter.employeeId,
               label: waiter.fullName,
             }))
           )}
         </select>
       </label>
       <label class="field analytics-field">
         <span>Дата смены</span>
         <input
           id="analytics-waiter-date"
           type="text"
           autocomplete="off"
           placeholder="дд.мм.гггг"
           value="${toRussianDateValue(todayInputDate())}"
         >
       </label>`
    ),
    card(
      'top-dishes',
      6,
      'Топ-5 популярных блюд за месяц',
      'Рейтинг блюд по проданным порциям и выручке за выбранный месяц.',
      `<label class="field analytics-field">
         <span>Месяц</span>
         <input
           id="analytics-month"
           type="text"
           autocomplete="off"
           placeholder="мм.гггг"
           value="${toRussianMonthValue(currentMonthInput())}"
         >
       </label>`
    ),
    card(
      'orders-history',
      7,
      'История заказов за дату',
      'Все заказы за выбранный день с составом и суммой.',
      `<label class="field analytics-field">
         <span>Дата</span>
         <input
           id="analytics-orders-date"
           type="text"
           autocomplete="off"
           placeholder="дд.мм.гггг"
           value="${toRussianDateValue(todayInputDate())}"
         >
       </label>`
    ),
    card(
      'supplies-period',
      8,
      'Поставки поставщика за период',
      'Накладные выбранного поставщика за указанный период.',
      `<label class="field analytics-field">
         <span>Поставщик</span>
         <select id="analytics-supplier">
           ${options(supplierValues)}
         </select>
       </label>
       <label class="field analytics-field">
         <span>С даты</span>
         <input
           id="analytics-supplies-from"
           type="text"
           autocomplete="off"
           placeholder="дд.мм.гггг"
           value="${toRussianDateValue(monthStartInput())}"
         >
       </label>
       <label class="field analytics-field">
         <span>По дату</span>
         <input
           id="analytics-supplies-to"
           type="text"
           autocomplete="off"
           placeholder="дд.мм.гггг"
           value="${toRussianDateValue(todayInputDate())}"
         >
       </label>`
    ),
    card(
      'supply-amount',
      9,
      'Сумма поставки по накладной',
      'Точная сумма и реквизиты поставки по номеру накладной.',
      `<label class="field analytics-field">
         <span>Накладная</span>
         <select id="analytics-invoice">
           ${options(
             supplies.map((supply) => ({
               value: supply.invoiceNumber,
               label: `${supply.invoiceNumber} · ${supply.supplier} · ${formatPrice(
                 supply.amount
               )}`,
             }))
           )}
         </select>
       </label>`
    ),
    card(
      'employees-position',
      10,
      'Сотрудники по должности',
      'Активные сотрудники выбранной должности с контактами.',
      `<label class="field analytics-field">
         <span>Должность</span>
         <select id="analytics-position">
           ${options(
             EMPLOYEE_POSITIONS.map((position) => ({
               value: position,
               label: position,
             }))
           )}
         </select>
       </label>`
    ),
  ].join('');

  setupAnalyticsActions();
}

async function runQuery(
  id: string,
  action: (result: HTMLElement) => Promise<void>
): Promise<void> {
  const result = document.querySelector<HTMLElement>(
    `[data-analytics-result="${id}"]`
  );
  const button = document.querySelector<HTMLButtonElement>(
    `[data-analytics-run="${id}"]`
  );

  if (!result || !button) {
    return;
  }

  button.disabled = true;
  result.innerHTML =
    '<div class="empty-state compact"><p>Выполняем запрос...</p></div>';

  try {
    await action(result);
  } catch (error) {
    renderError(result, error, 'Не удалось выполнить запрос');
  } finally {
    button.disabled = false;
  }
}

function setupAnalyticsActions(): void {
  document
    .querySelectorAll<HTMLButtonElement>('[data-analytics-run]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.analyticsRun;
        if (!id) {
          return;
        }

        switch (id) {
          case 'dishes':
            void runQuery(id, async (result) => {
              const categoryId = Number(inputValue('analytics-category'));
              if (!categoryId) {
                throw new Error('Выберите категорию');
              }

              const response = await getAnalyticsDishes(categoryId);
              renderTable(
                result,
                ['Блюдо', 'Категория', 'Вес', 'Цена', 'Доступность'],
                response.dishes.map((dish: Dish) => [
                  `<strong>${escapeHtml(dish.name)}</strong>`,
                  escapeHtml(dish.categoryName ?? '—'),
                  dish.weightGrams ? `${dish.weightGrams} г` : '—',
                  formatPrice(dish.price),
                  dish.isAvailable === false
                    ? '<span class="status-badge status-cancelled">недоступно</span>'
                    : '<span class="status-badge status-paid">доступно</span>',
                ])
              );
            });
            break;

          case 'dish-price':
            void runQuery(id, async (result) => {
              const dishId = Number(inputValue('analytics-dish'));
              if (!dishId) {
                throw new Error('Выберите блюдо');
              }

              const response = await getAnalyticsDishPrice(dishId);
              renderTable(
                result,
                ['Блюдо', 'Категория', 'Цена', 'Вес', 'Описание'],
                [
                  [
                    `<strong>${escapeHtml(response.dish.name)}</strong>`,
                    escapeHtml(response.dish.categoryName ?? '—'),
                    formatPrice(response.dish.price),
                    response.dish.weightGrams
                      ? `${response.dish.weightGrams} г`
                      : '—',
                    escapeHtml(response.dish.description ?? '—'),
                  ],
                ]
              );
            });
            break;

          case 'bookings-today':
            void runQuery(id, async (result) => {
              const response = await getAnalyticsBookingsToday();
              renderTable(
                result,
                ['№', 'Клиент', 'Телефон', 'Дата и время', 'Стол', 'Гостей', 'Статус'],
                response.bookings.map((booking) => [
                  `№${booking.bookingId}`,
                  `<strong>${escapeHtml(booking.customerName)}</strong>`,
                  escapeHtml(booking.phone),
                  `${formatDate(booking.bookingTime)} ${formatTime(
                    booking.bookingTime
                  )}`,
                  `№${booking.tableNumber ?? booking.tableId}`,
                  String(booking.guestsCount),
                  renderStatusBadge(booking.status),
                ])
              );
            });
            break;

          case 'free-tables':
            void runQuery(id, async (result) => {
              const parsedDateTime = requiredRussianDateTime(
                'analytics-free-datetime'
              );
              const guests = Number(inputValue('analytics-free-guests')) || undefined;
              const date = parsedDateTime ? new Date(parsedDateTime) : null;

              const response = await getAnalyticsFreeTables({
                datetime: date ? date.toISOString() : undefined,
                guests,
              });

              renderTable(
                result,
                ['Стол', 'Вместимость', 'Расположение', 'Статус'],
                response.tables.map((table: Table) => [
                  `<strong>№${table.tableNumber}</strong>`,
                  `${table.capacity} гостей`,
                  escapeHtml(table.location),
                  renderStatusBadge(table.status),
                ]),
                `Свободных столов: <strong>${response.tables.length}</strong>`
              );
            });
            break;

          case 'waiter-orders':
            void runQuery(id, async (result) => {
              const employeeId = Number(inputValue('analytics-waiter'));
              if (!employeeId) {
                throw new Error('Выберите официанта');
              }

              const response = await getAnalyticsWaiterOrders({
                employeeId,
                date: requiredRussianDate('analytics-waiter-date'),
              });

              renderTable(
                result,
                ['Заказ', 'Время', 'Стол', 'Статус', 'Сумма', 'Состав'],
                response.orders.map((order: Order) => [
                  `№${order.orderId}`,
                  formatTime(order.createdAt),
                  `№${order.tableNumber}`,
                  renderStatusBadge(order.status),
                  formatPrice(order.total),
                  order.items
                    .map(
                      (item) =>
                        `${escapeHtml(item.name)} × ${item.quantity}`
                    )
                    .join('<br>') || '—',
                ]),
                `Официант: <strong>${escapeHtml(
                  response.employee.fullName
                )}</strong> · дата: ${escapeHtml(formatDate(response.date))}`
              );
            });
            break;

          case 'top-dishes':
            void runQuery(id, async (result) => {
              const response = await getAnalyticsTopDishes(
                requiredRussianMonth('analytics-month')
              );

              renderTable(
                result,
                ['Место', 'Блюдо', 'Категория', 'Продано, порций', 'Выручка'],
                response.dishes.map((dish: TopDishAnalytics, index: number) => [
                  String(index + 1),
                  `<strong>${escapeHtml(dish.name)}</strong>`,
                  escapeHtml(dish.categoryName),
                  String(dish.quantitySold),
                  formatPrice(dish.revenue),
                ]),
                `Месяц: <strong>${escapeHtml(formatMonth(response.month))}</strong>`
              );
            });
            break;

          case 'orders-history':
            void runQuery(id, async (result) => {
              const response = await getAnalyticsOrders(
                requiredRussianDate('analytics-orders-date')
              );

              renderTable(
                result,
                ['Заказ', 'Дата и время', 'Официант', 'Стол', 'Статус', 'Сумма', 'Состав'],
                response.orders.map((order: Order) => [
                  `№${order.orderId}`,
                  formatDateTime(order.createdAt),
                  escapeHtml(order.employeeName),
                  `№${order.tableNumber}`,
                  renderStatusBadge(order.status),
                  formatPrice(order.total),
                  order.items
                    .map(
                      (item) =>
                        `${escapeHtml(item.name)} × ${item.quantity}`
                    )
                    .join('<br>') || '—',
                ]),
                `Дата: <strong>${escapeHtml(formatDate(response.date))}</strong> · заказов: ${
                  response.orders.length
                }`
              );
            });
            break;

          case 'supplies-period':
            void runQuery(id, async (result) => {
              const supplier = inputValue('analytics-supplier');
              if (!supplier) {
                throw new Error('Выберите поставщика');
              }

              const response = await getAnalyticsSupplies({
                supplier,
                from: requiredRussianDate('analytics-supplies-from'),
                to: requiredRussianDate('analytics-supplies-to'),
              });

              renderTable(
                result,
                ['Дата', 'Поставщик', 'Накладная', 'Сумма', 'Принял'],
                response.supplies.map((supply: Supply) => [
                  formatDate(supply.supplyDate),
                  `<strong>${escapeHtml(supply.supplier)}</strong>`,
                  escapeHtml(supply.invoiceNumber),
                  formatPrice(supply.amount),
                  escapeHtml(supply.employeeName),
                ]),
                `Период: ${escapeHtml(formatDate(response.from))} — ${escapeHtml(
                  formatDate(response.to)
                )}`
              );
            });
            break;

          case 'supply-amount':
            void runQuery(id, async (result) => {
              const invoice = inputValue('analytics-invoice');
              if (!invoice) {
                throw new Error('Выберите накладную');
              }

              const response = await getAnalyticsSupplyAmount(invoice);
              renderTable(
                result,
                ['Накладная', 'Дата', 'Поставщик', 'Сумма', 'Принял'],
                [
                  [
                    `<strong>${escapeHtml(
                      response.supply.invoiceNumber
                    )}</strong>`,
                    formatDate(response.supply.supplyDate),
                    escapeHtml(response.supply.supplier),
                    formatPrice(response.supply.amount),
                    escapeHtml(response.supply.employeeName),
                  ],
                ]
              );
            });
            break;

          case 'employees-position':
            void runQuery(id, async (result) => {
              const response = await getAnalyticsEmployees(
                inputValue('analytics-position') || undefined
              );

              renderTable(
                result,
                ['ФИО', 'Должность', 'Телефон'],
                response.employees.map((employee: Employee) => [
                  `<strong>${escapeHtml(employee.fullName)}</strong>`,
                  escapeHtml(employee.position),
                  escapeHtml(employee.phone),
                ]),
                `Найдено сотрудников: <strong>${response.employees.length}</strong>`
              );
            });
            break;

          default:
            break;
        }
      });
    });
}

export async function initAnalytics(): Promise<void> {
  if (initialized) {
    return;
  }

  const grid = document.getElementById('analytics-grid');
  if (!grid) {
    return;
  }

  initialized = true;
  grid.innerHTML =
    '<div class="empty-state compact"><p>Загружаем справочники...</p></div>';

  try {
    const [menuResponse, dishesResponse, waitersResponse, suppliesResponse] =
      await Promise.all([
        getMenu(),
        getDishes(),
        getEmployees('официант'),
        getSupplies(),
      ]);

    categories = menuResponse.categories;
    dishes = dishesResponse.dishes;
    waiters = waitersResponse.employees;
    supplies = suppliesResponse.supplies;

    renderAnalyticsCards();
  } catch (error) {
    initialized = false;
    grid.innerHTML = `
      <div class="empty-state compact">
        <p>${escapeHtml(
          error instanceof ApiRequestError
            ? error.message
            : 'Не удалось загрузить данные для аналитики'
        )}</p>
      </div>
    `;
    showToast('Не удалось загрузить данные для аналитики', 'error');
  }
}
