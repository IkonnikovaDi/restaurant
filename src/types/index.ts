import 'express-session';

export type UserRole = 'admin' | 'waiter' | 'guest';

export interface SessionUser {
  userId: number;
  login: string;
  role: UserRole;
  fullName: string;
  employeeId: number | null;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
  }
}

export type OrderStatus =
  | 'новый'
  | 'готовится'
  | 'подан'
  | 'оплачен'
  | 'закрыт'
  | 'отменён';

export type BookingStatus = 'новая' | 'подтверждена' | 'отменена' | 'выполнена';

export type TableStatus = 'свободен' | 'забронирован' | 'занят';

export interface OrderItemInput {
  dishId: number;
  quantity: number;
}

export interface OrderItemView {
  dishId: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderView {
  orderId: number;
  createdAt: string;
  status: OrderStatus;
  total: number;
  employeeId: number;
  employeeName: string;
  tableId: number;
  tableNumber: number;
  items: OrderItemView[];
}
