import { ApiRequestError, createBooking, getFreeTables, getMenu } from './api.js';
import {
  byId,
  categoryIcon,
  defaultBookingDateTime,
  escapeHtml,
  formatDateTime,
  formatPrice,
  hideFormError,
  initShell,
  showFormError,
  showToast,
} from './common.js';
import { Category, Dish } from './types.js';

const chipsContainer = byId<HTMLDivElement>('category-chips');
const sectionsContainer = byId<HTMLDivElement>('menu-sections');
const searchInput = byId<HTMLInputElement>('menu-search');
const openBookingButton = byId<HTMLButtonElement>('open-booking');
const bookingDialog = byId<HTMLDialogElement>('booking-dialog');
const bookingForm = byId<HTMLFormElement>('booking-form');
const bookingName = byId<HTMLInputElement>('booking-name');
const bookingPhone = byId<HTMLInputElement>('booking-phone');
const bookingDateTime = byId<HTMLInputElement>('booking-datetime');
const bookingGuests = byId<HTMLInputElement>('booking-guests');
const bookingTable = byId<HTMLSelectElement>('booking-table');
const bookingError = byId<HTMLDivElement>('booking-error');
const bookingSubmit = byId<HTMLButtonElement>('booking-submit');

let categories: Category[] = [];
let activeCategoryId: number | null = null;
let searchQuery = '';

function dishMatches(dish: Dish, query: string): boolean {
  if (!query) {
    return true;
  }

  return `${dish.name} ${dish.description ?? ''}`.toLowerCase().includes(query);
}

function renderCategoryChips(): void {
  const totalDishes = categories.reduce(
    (sum, category) => sum + (category.dishes?.length ?? 0),
    0
  );

  const chips = [
    { id: null as number | null, label: 'Все', count: totalDishes },
    ...categories.map((category) => ({
      id: category.categoryId,
      label: category.name,
      count: category.dishes?.length ?? 0,
    })),
  ];

  chipsContainer.innerHTML = chips
    .map(
      (chip) => `
        <button type="button"
                class="chip ${chip.id === activeCategoryId ? 'is-active' : ''}"
                data-category-id="${chip.id ?? ''}">
          ${escapeHtml(chip.label)}
          <span class="chip-count">${chip.count}</span>
        </button>
      `
    )
    .join('');

  chipsContainer
    .querySelectorAll<HTMLButtonElement>('[data-category-id]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const raw = button.dataset.categoryId ?? '';
        activeCategoryId = raw === '' ? null : Number(raw);
        renderCategoryChips();
        renderMenu();
      });
    });
}

function renderDishCard(dish: Dish, category: Category): string {
  const weight = dish.weightGrams ? `${dish.weightGrams} г` : '';

  return `
    <article class="dish-card">
      <div class="dish-media">
        <span class="dish-emoji">${categoryIcon(category.name)}</span>
        ${weight ? `<span class="dish-weight">${weight}</span>` : ''}
      </div>
      <div class="dish-body">
        <div class="dish-title-row">
          <h3>${escapeHtml(dish.name)}</h3>
          <span class="dish-price">${formatPrice(dish.price)}</span>
        </div>
        <p class="dish-description">${escapeHtml(
          dish.description ?? 'Описание скоро появится'
        )}</p>
        <div class="dish-footer">
          <span class="dish-category">${escapeHtml(category.name)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderMenu(): void {
  const query = searchQuery.toLowerCase();

  const filteredCategories = categories
    .filter(
      (category) =>
        activeCategoryId === null || category.categoryId === activeCategoryId
    )
    .map((category) => ({
      ...category,
      dishes: (category.dishes ?? []).filter((dish) => dishMatches(dish, query)),
    }))
    .filter((category) => (category.dishes?.length ?? 0) > 0);

  if (filteredCategories.length === 0) {
    sectionsContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🍽️</span>
        <h3>Ничего не найдено</h3>
        <p>Попробуйте изменить запрос или выбрать другую категорию.</p>
      </div>
    `;
    return;
  }

  sectionsContainer.innerHTML = filteredCategories
    .map(
      (category) => `
        <section class="menu-section">
          <div class="section-head">
            <h2><span class="section-icon">${categoryIcon(category.name)}</span>${escapeHtml(
              category.name
            )}</h2>
            <span class="muted">${category.dishes?.length ?? 0} поз.</span>
          </div>
          <div class="dish-grid">
            ${(category.dishes ?? [])
              .map((dish) => renderDishCard(dish, category))
              .join('')}
          </div>
        </section>
      `
    )
    .join('');
}

async function loadMenu(): Promise<void> {
  sectionsContainer.innerHTML =
    '<div class="empty-state"><p>Загружаем меню ресторана...</p></div>';

  try {
    const response = await getMenu();
    categories = response.categories;
    renderCategoryChips();
    renderMenu();
  } catch (error) {
    sectionsContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚠️</span>
        <h3>Не удалось загрузить меню</h3>
        <p>${escapeHtml(
          error instanceof ApiRequestError ? error.message : 'Проверьте подключение к серверу.'
        )}</p>
      </div>
    `;
  }
}

async function refreshBookingTables(): Promise<void> {
  const datetimeValue = bookingDateTime.value;
  const guestsCount = Number(bookingGuests.value);

  if (!datetimeValue || !Number.isInteger(guestsCount) || guestsCount < 1) {
    return;
  }

  const date = new Date(datetimeValue);
  if (Number.isNaN(date.getTime())) {
    return;
  }

  bookingTable.disabled = true;
  bookingTable.innerHTML = '<option value="">Загружаем свободные столы...</option>';

  try {
    const response = await getFreeTables({
      datetime: date.toISOString(),
      guests: guestsCount,
    });

    if (response.tables.length === 0) {
      bookingTable.innerHTML =
        '<option value="">На это время свободных столов нет</option>';
      return;
    }

    bookingTable.innerHTML =
      '<option value="">Выберите стол</option>' +
      response.tables
        .map(
          (table) =>
            `<option value="${table.tableId}">Стол №${table.tableNumber} · до ${table.capacity} гостей · ${escapeHtml(
              table.location
            )}</option>`
        )
        .join('');
  } catch (error) {
    bookingTable.innerHTML = '<option value="">Не удалось загрузить столы</option>';
    showToast(
      error instanceof ApiRequestError
        ? error.message
        : 'Не удалось загрузить список столов',
      'error'
    );
  } finally {
    bookingTable.disabled = false;
  }
}

function openBookingDialog(): void {
  hideFormError(bookingError);

  if (!bookingDateTime.value) {
    bookingDateTime.value = defaultBookingDateTime();
  }
  if (!bookingGuests.value) {
    bookingGuests.value = '2';
  }

  if (!bookingDialog.open) {
    bookingDialog.showModal();
  }

  void refreshBookingTables();
}

function setupBookingDialog(): void {
  bookingDateTime.value = defaultBookingDateTime();
  bookingGuests.value = '2';

  openBookingButton.addEventListener('click', openBookingDialog);

  bookingDialog.querySelectorAll<HTMLElement>('[data-close-dialog]').forEach((element) => {
    element.addEventListener('click', () => bookingDialog.close());
  });

  bookingDialog.addEventListener('click', (event) => {
    if (event.target === bookingDialog) {
      bookingDialog.close();
    }
  });

  bookingDateTime.addEventListener('change', () => void refreshBookingTables());
  bookingGuests.addEventListener('change', () => void refreshBookingTables());

  bookingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitBooking();
  });
}

async function submitBooking(): Promise<void> {
  hideFormError(bookingError);

  const customerName = bookingName.value.trim();
  const phone = bookingPhone.value.trim();
  const guestsCount = Number(bookingGuests.value);
  const tableId = Number(bookingTable.value);
  const date = new Date(bookingDateTime.value);

  if (!customerName || !phone) {
    showFormError(bookingError, 'Укажите ФИО и телефон');
    return;
  }
  if (!tableId) {
    showFormError(bookingError, 'Выберите стол');
    return;
  }
  if (!Number.isInteger(guestsCount) || guestsCount < 1) {
    showFormError(bookingError, 'Укажите количество гостей');
    return;
  }
  if (Number.isNaN(date.getTime())) {
    showFormError(bookingError, 'Укажите дату и время брони');
    return;
  }

  bookingSubmit.disabled = true;
  bookingSubmit.textContent = 'Бронируем...';

  try {
    const response = await createBooking({
      customerName,
      phone,
      bookingTime: date.toISOString(),
      guestsCount,
      tableId,
    });

    bookingDialog.close();
    bookingForm.reset();
    bookingDateTime.value = defaultBookingDateTime();
    bookingGuests.value = '2';

    showToast(
      `Стол №${response.booking.tableNumber ?? tableId} забронирован на ${formatDateTime(
        response.booking.bookingTime
      )}`,
      'success'
    );
  } catch (error) {
    showFormError(
      bookingError,
      error instanceof ApiRequestError
        ? error.message
        : 'Не удалось забронировать стол'
    );
  } finally {
    bookingSubmit.disabled = false;
    bookingSubmit.textContent = 'Забронировать';
  }
}

function setupSearch(): void {
  let timer: number | undefined;

  searchInput.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      searchQuery = searchInput.value.trim();
      renderMenu();
    }, 150);
  });
}

async function init(): Promise<void> {
  const user = await initShell('menu');
  if (!user) {
    return;
  }

  // Раздел меню предназначен гостю: у администратора блюда открываются в панели управления.
  if (user.role === 'admin') {
    window.location.href = '/order.html';
    return;
  }

  setupSearch();
  setupBookingDialog();

  await loadMenu();
}

void init();
