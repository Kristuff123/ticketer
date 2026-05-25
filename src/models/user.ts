import { UserRole } from './enums';

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

export type AuthResult =
  | { success: true; token: string; user: User }
  | { success: false; error: string };
