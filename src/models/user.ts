import { UserRole } from './enums.js';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department: string;
  isActive: boolean;
  preferences: UserPreferences;
  createdAt: Date;
}

export interface UserPreferences {
  emailNotifications: boolean;
  dashboardNotifications: boolean;
  language: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  department: string;
}

export interface AdminCreateUserInput extends RegisterInput {
  role: UserRole;
}

export interface UserUpdateInput {
  name?: string;
  department?: string;
  role?: UserRole;
  isActive?: boolean;
}

export type AuthResult =
  | { success: true; token: string; user: User }
  | { success: false; error: string };
