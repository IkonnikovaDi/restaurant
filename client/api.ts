import {
  Booking,
  Category,
  Dish,
  Employee,
  Order,
  Supply,
  Table,
  TopDishAnalytics,
  User,
} from './types.js';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers:
      options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });

  const contentType = response.headers.get('content-type') ?? '';
  const data: unknown = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Ошибка запроса (${response.status})`;

    if (
      response.status === 401 &&
      !path.startsWith('/auth/me') &&
      !window.location.pathname.endsWith('/login.html')
    ) {
      window.location.href = '/login.html';
    }

    throw new ApiRequestError(response.status, message);
  }

  return data as T;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

export function login(loginValue: string, password: string): Promise<{ user: User }> {
  return request<{ user: User }>('/auth/login', {
    method: 'POST',
    body: { login: loginValue, password },
  });
}

export function logout(): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<{ user: User }> {
  return request<{ user: User }>('/auth/me');
}

export function getMenu(): Promise<{ categories: Category[] }> {
  return request<{ categories: Category[] }>('/menu');
}

export function getDishes(params: {
  categoryId?: number;
  search?: string;
} = {}): Promise<{ dishes: Dish[] }> {
  return request<{ dishes: Dish[] }>(
    `/dishes${buildQuery({ category_id: params.categoryId, search: params.search })}`
  );
}

export function getTables(params: {
  status?: string;
  guests?: number;
} = {}): Promise<{ tables: Table[] }> {
  return request<{ tables: Table[] }>(
    `/tables${buildQuery({ status: params.status, guests: params.guests })}`
  );
}

export function getFreeTables(params: {
  datetime?: string;
  guests?: number;
} = {}): Promise<{ tables: Table[] }> {
  return request<{ tables: Table[] }>(
    `/tables/free${buildQuery({ datetime: params.datetime, guests: params.guests })}`
  );
}

export function getEmployees(position?: string): Promise<{ employees: Employee[] }> {
  return request<{ employees: Employee[] }>(
    `/employees${buildQuery({ position })}`
  );
}

export function createOrder(payload: {
  tableId: number;
  employeeId: number;
  items: Array<{ dishId: number; quantity: number }>;
}): Promise<{ order: Order }> {
  return request<{ order: Order }>('/orders', {
    method: 'POST',
    body: payload,
  });
}

export function getOrders(params: {
  status?: string;
  date?: string;
} = {}): Promise<{ orders: Order[] }> {
  return request<{ orders: Order[] }>(
    `/orders${buildQuery({ status: params.status, date: params.date })}`
  );
}

export function updateOrderStatus(
  orderId: number,
  status: string
): Promise<{ order: Order }> {
  return request<{ order: Order }>(`/orders/${orderId}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export function createBooking(payload: {
  customerName: string;
  phone: string;
  bookingTime: string;
  guestsCount: number;
  tableId: number;
}): Promise<{ booking: Booking }> {
  return request<{ booking: Booking }>('/bookings', {
    method: 'POST',
    body: payload,
  });
}

export function getBookings(date?: string): Promise<{ bookings: Booking[] }> {
  return request<{ bookings: Booking[] }>(
    `/bookings${buildQuery({ date })}`
  );
}

export function getMyBookings(): Promise<{ bookings: Booking[] }> {
  return request<{ bookings: Booking[] }>('/bookings/my');
}

export function getSupplies(): Promise<{ supplies: Supply[] }> {
  return request<{ supplies: Supply[] }>('/supplies');
}

// ---------------------------------------------------------------------------
// Аналитические запросы
// ---------------------------------------------------------------------------

export function getAnalyticsDishes(
  categoryId: number
): Promise<{ dishes: Dish[] }> {
  return request<{ dishes: Dish[] }>(
    `/analytics/dishes${buildQuery({ categoryId })}`
  );
}

export function getAnalyticsDishPrice(dishId: number): Promise<{ dish: Dish }> {
  return request<{ dish: Dish }>(
    `/analytics/dish-price${buildQuery({ dishId })}`
  );
}

export function getAnalyticsBookingsToday(): Promise<{ bookings: Booking[] }> {
  return request<{ bookings: Booking[] }>('/analytics/bookings/today');
}

export function getAnalyticsFreeTables(params: {
  datetime?: string;
  guests?: number;
} = {}): Promise<{ datetime: string; guests: number | null; tables: Table[] }> {
  return request<{ datetime: string; guests: number | null; tables: Table[] }>(
    `/analytics/free-tables${buildQuery({
      datetime: params.datetime,
      guests: params.guests,
    })}`
  );
}

export function getAnalyticsWaiterOrders(params: {
  employeeId: number;
  date?: string;
}): Promise<{ employee: Employee; date: string; orders: Order[] }> {
  return request<{ employee: Employee; date: string; orders: Order[] }>(
    `/analytics/waiter-orders${buildQuery({
      employeeId: params.employeeId,
      date: params.date,
    })}`
  );
}

export function getAnalyticsTopDishes(
  month?: string
): Promise<{ month: string; dishes: TopDishAnalytics[] }> {
  return request<{ month: string; dishes: TopDishAnalytics[] }>(
    `/analytics/top-dishes${buildQuery({ month })}`
  );
}

export function getAnalyticsOrders(
  date?: string
): Promise<{ date: string; orders: Order[] }> {
  return request<{ date: string; orders: Order[] }>(
    `/analytics/orders${buildQuery({ date })}`
  );
}

export function getAnalyticsSupplies(params: {
  supplier: string;
  from?: string;
  to?: string;
}): Promise<{
  supplier: string;
  from: string;
  to: string;
  supplies: Supply[];
}> {
  return request<{
    supplier: string;
    from: string;
    to: string;
    supplies: Supply[];
  }>(
    `/analytics/supplies${buildQuery({
      supplier: params.supplier,
      from: params.from,
      to: params.to,
    })}`
  );
}

export function getAnalyticsSupplyAmount(
  invoice: string
): Promise<{ supply: Supply }> {
  return request<{ supply: Supply }>(
    `/analytics/supply-amount${buildQuery({ invoice })}`
  );
}

export function getAnalyticsEmployees(
  position?: string
): Promise<{ position: string | null; employees: Employee[] }> {
  return request<{ position: string | null; employees: Employee[] }>(
    `/analytics/employees${buildQuery({ position })}`
  );
}

export function updateBookingStatus(
  bookingId: number,
  status: string
): Promise<{ booking: Booking }> {
  return request<{ booking: Booking }>(`/bookings/${bookingId}/status`, {
    method: 'PATCH',
    body: { status },
  });
}
