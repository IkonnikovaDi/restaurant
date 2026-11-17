export type Role = 'admin' | 'guest';

export interface User {
  userId: number;
  login: string;
  role: Role;
  fullName: string;
  employeeId: number | null;
}

export interface Dish {
  dishId: number;
  name: string;
  price: number | string;
  weightGrams: number | null;
  description: string | null;
  isAvailable?: boolean;
  categoryId?: number;
  categoryName?: string;
}

export interface Category {
  categoryId: number;
  name: string;
  description: string | null;
  sortOrder: number;
  dishes?: Dish[];
  isActive?: boolean;
  dishesCount?: number;
}

export interface Table {
  tableId: number;
  tableNumber: number;
  capacity: number;
  location: string;
  status: string;
}

export interface Employee {
  employeeId: number;
  lastName: string;
  firstName: string;
  middleName: string | null;
  position: string;
  phone: string;
  isActive: boolean;
  fullName: string;
}

export interface OrderItem {
  dishId: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  orderId: number;
  createdAt: string;
  status: string;
  total: number;
  employeeId: number;
  employeeName: string;
  tableId: number;
  tableNumber: number;
  items: OrderItem[];
}

export interface Booking {
  bookingId: number;
  customerName: string;
  phone: string;
  bookingTime: string;
  guestsCount: number;
  tableId: number;
  tableNumber?: number;
  status: string;
  createdAt?: string;
}

export interface CartLine {
  dish: Dish;
  quantity: number;
}
