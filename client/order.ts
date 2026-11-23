import {
  ApiRequestError,
  createOrder,
  getEmployees,
  getFreeTables,
  getMenu,
} from './api.js';
import {
  byId,
  categoryIcon,
  escapeHtml,
  formatPrice,
  hideFormError,
  initShell,
  showFormError,
  showToast,
} from './common.js';
import { CartLine, Category, Dish, Employee, Table } from './types.js';

const catalog = byId<HTMLDivElement>('catalog');
const catalogSearch = byId<HTMLInputElement>('catalog-search');
const cartItems = byId<HTMLDivElement>('cart-items');
const cartTotal = byId<HTMLElement>('cart-total');
const clearCartButton = byId<HTMLButtonElement>('clear-cart');
const orderTable = byId<HTMLSelectElement>('order-table');
const orderWaiter = byId<HTMLSelectElement>('order-waiter');
const orderError = byId<HTMLDivElement>('order-error');
const submitOrderButton = byId<HTMLButtonElement>('submit-order');

let menu: Category[] = [];
let tables: Table[] = [];
let catalogQuery = '';

const cart = new Map<number, CartLine>();

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

  orderWaiter.innerHTML = '<option value="">Загружаем официантов...</option>';

  try {
    const response = await getEmployees('официант');
    const waiters: Employee[] = response.employees;

    if (waiters.length === 0) {
      orderWaiter.innerHTML = '<option value="">Нет доступных официантов</option>';
      return;
    }

    orderWaiter.innerHTML =
      '<option value="">Выберите официанта</option>' +
      waiters
        .map(
          (waiter) =>
            `<option value="${waiter.employeeId}">${escapeHtml(waiter.fullName)}</option>`
        )
        .join('');

    if (previous && waiters.some((waiter) => String(waiter.employeeId) === previous)) {
      orderWaiter.value = previous;
    }
  } catch (error) {
    orderWaiter.innerHTML = '<option value="">Не удалось загрузить официантов</option>';
    showToast(
      error instanceof ApiRequestError
        ? error.message
        : 'Не удалось загрузить официантов',
      'error'
    );
  }
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
    showFormError(orderError, 'Выберите официанта, который обслуживал стол');
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
    await loadFreeTables();
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
  const user = await initShell('order', ['waiter']);
  if (!user) {
    return;
  }

  setupCatalog();
  setupCart();
  setupOrderForm();

  await Promise.all([loadMenu(), loadFreeTables(), loadWaiters()]);
  renderCart();
  applyPreselectedDish();
}

void init();
