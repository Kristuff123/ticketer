import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { getJwtSecret, getTokenExpiration } from "../config/env.js";
import { UserRepository } from "../database/repositories/user-repository.js";
import { PasswordRepository } from "../database/repositories/password-repository.js";
import { UserRole } from "../models/enums.js";
import {
  AdminCreateUserInput,
  AuthResult,
  Credentials,
  RegisterInput,
  User,
  UserPreferences,
  UserUpdateInput,
} from "../models/user.js";
import { validateEmail } from "../utils/validation.js";
import { IUserService } from "./interfaces/index.js";

const JWT_SECRET = getJwtSecret();
const TOKEN_EXPIRATION = getTokenExpiration();
const jwtSignOptions: SignOptions = {
  expiresIn: TOKEN_EXPIRATION as SignOptions["expiresIn"],
};

// TODO: seed demo users via migration or bootstrap (see follow-up)

// In-memory ticket store reference for permission checks
// This will be injected or replaced with a proper repository later
export interface TicketOwnershipInfo {
  reporterId: string;
  assigneeId?: string;
}

export type TicketLookupFn = (
  ticketId: string,
) => Promise<TicketOwnershipInfo | null>;

export class UserService implements IUserService {
  private userRepository: UserRepository;
  private passwordRepository: PasswordRepository;
  private ticketLookup: TicketLookupFn;

  constructor(
    userRepository: UserRepository,
    passwordRepository: PasswordRepository,
    ticketLookup?: TicketLookupFn,
  ) {
    this.userRepository = userRepository;
    this.passwordRepository = passwordRepository;
    this.ticketLookup = ticketLookup ?? (async () => null);
  }

  async getUser(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async getUserByRole(role: UserRole): Promise<User[]> {
    return this.userRepository.findByRole(role);
  }

  async listUsers(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  async getAssignableUsers(): Promise<User[]> {
    const [admins, technicians] = await Promise.all([
      this.userRepository.findByRole(UserRole.ADMIN),
      this.userRepository.findByRole(UserRole.TECHNICIAN),
    ]);
    return [...admins, ...technicians].sort((a, b) =>
      a.name.localeCompare(b.name, "pl"),
    );
  }

  async authenticateUser(credentials: Credentials): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(credentials.email);

    if (!user) {
      return { success: false, error: "Invalid email or password" };
    }

    if (!user.isActive) {
      return { success: false, error: "User account is inactive" };
    }

    const passwordValid = await this.passwordRepository.verifyPassword(
      user.id,
      credentials.password,
    );

    if (!passwordValid) {
      return { success: false, error: "Invalid email or password" };
    }

    const token = this.generateToken(user);
    return { success: true, token, user };
  }

  async registerUser(input: RegisterInput): Promise<AuthResult> {
    const validation = await this.validateUserInput(input);
    if (!validation.success) {
      return validation;
    }

    const user = await this.createStoredUser(input, UserRole.REPORTER);
    const token = this.generateToken(user);
    return { success: true, token, user };
  }

  async createUser(
    input: AdminCreateUserInput,
  ): Promise<
    { success: true; user: User } | { success: false; error: string }
  > {
    const validation = await this.validateUserInput(input);
    if (!validation.success) {
      return validation;
    }

    const role = input.role;
    if (!Object.values(UserRole).includes(role)) {
      return { success: false, error: "Invalid role" };
    }

    const user = await this.createStoredUser(input, role);
    return { success: true, user };
  }

  async updateUser(
    userId: string,
    input: UserUpdateInput,
  ): Promise<
    { success: true; user: User } | { success: false; error: string }
  > {
    const existing = await this.userRepository.findById(userId);
    if (!existing) {
      return { success: false, error: "User not found" };
    }

    const fields: Partial<{
      name: string;
      department: string;
      role: UserRole;
      isActive: boolean;
    }> = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 2 || name.length > 100) {
        return {
          success: false,
          error: "Name must be between 2 and 100 characters",
        };
      }
      fields.name = name;
    }

    if (input.department !== undefined) {
      const department = input.department.trim();
      if (department.length < 2 || department.length > 100) {
        return {
          success: false,
          error: "Department must be between 2 and 100 characters",
        };
      }
      fields.department = department;
    }

    if (input.role !== undefined) {
      if (!Object.values(UserRole).includes(input.role)) {
        return { success: false, error: "Invalid role" };
      }
      fields.role = input.role;
    }

    if (input.isActive !== undefined) {
      fields.isActive = input.isActive;
    }

    const updated = await this.userRepository.update(userId, fields);
    if (!updated) {
      return { success: false, error: "User not found" };
    }

    return { success: true, user: updated };
  }

  async hasPermission(
    userId: string,
    operation: string,
    ticketId?: string,
  ): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive) {
      return false;
    }

    // ADMIN: always has permission
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    // TECHNICIAN permissions
    if (user.role === UserRole.TECHNICIAN) {
      // Can view all tickets
      if (operation === "view") {
        return true;
      }

      // For operations on specific tickets, check assignment
      if (ticketId) {
        const ticket = await this.ticketLookup(ticketId);
        if (!ticket) {
          return false;
        }

        const isAssigned = ticket.assigneeId === userId;

        // Can change status and add comments (including internal) on assigned tickets
        if (
          operation === "change_status" ||
          operation === "add_comment" ||
          operation === "add_internal_comment"
        ) {
          return isAssigned;
        }
      }

      // Technicians cannot assign tickets
      if (operation === "assign") {
        return false;
      }

      return false;
    }

    // REPORTER permissions
    if (user.role === UserRole.REPORTER) {
      if (ticketId) {
        const ticket = await this.ticketLookup(ticketId);
        if (!ticket) {
          return false;
        }

        const isOwner = ticket.reporterId === userId;

        // Can view own tickets
        if (operation === "view") {
          return isOwner;
        }

        // Can close own tickets
        if (operation === "close") {
          return isOwner;
        }

        // Can add non-internal comments to own tickets
        if (operation === "add_comment") {
          return isOwner;
        }

        // Cannot add internal comments
        if (operation === "add_internal_comment") {
          return false;
        }
      }

      // Reporters cannot assign, change_status (except close via 'close' op), or add internal comments
      if (
        operation === "assign" ||
        operation === "change_status" ||
        operation === "add_internal_comment"
      ) {
        return false;
      }

      return false;
    }

    return false;
  }

  async updateUserPreferences(
    userId: string,
    prefs: Partial<UserPreferences>,
  ): Promise<User | null> {
    const existing = await this.userRepository.findById(userId);
    if (!existing) {
      return null;
    }

    const merged: UserPreferences = { ...existing.preferences, ...prefs };
    return this.userRepository.update(userId, { preferences: merged });
  }

  private async validateUserInput(
    input: RegisterInput,
  ): Promise<{ success: true } | { success: false; error: string }> {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const department = input.department.trim();
    const password = input.password;

    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return {
        success: false,
        error: emailValidation.errors.email || "Invalid email",
      };
    }

    if (name.length < 2 || name.length > 100) {
      return {
        success: false,
        error: "Name must be between 2 and 100 characters",
      };
    }

    if (department.length < 2 || department.length > 100) {
      return {
        success: false,
        error: "Department must be between 2 and 100 characters",
      };
    }

    if (password.length < 8 || password.length > 128) {
      return {
        success: false,
        error: "Password must be between 8 and 128 characters",
      };
    }

    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      return { success: false, error: "User with this email already exists" };
    }

    return { success: true };
  }

  private async createStoredUser(
    input: RegisterInput,
    role: UserRole,
  ): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const user = await this.userRepository.create({
      id: crypto.randomUUID(),
      email,
      name: input.name.trim(),
      role,
      department: input.department.trim(),
      isActive: true,
      preferences: {
        emailNotifications: true,
        dashboardNotifications: true,
        language: "pl",
      },
      createdAt: new Date(),
    });

    await this.passwordRepository.setPassword(user.id, input.password);
    return user;
  }

  generateToken(user: User): string {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID(),
    };

    return jwt.sign(payload, JWT_SECRET, jwtSignOptions);
  }

  validateToken(token: string): { valid: boolean; payload?: any } {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return { valid: true, payload };
    } catch {
      return { valid: false };
    }
  }

  refreshToken(token: string): string | null {
    const result = this.validateToken(token);
    if (!result.valid || !result.payload) {
      return null;
    }

    // Issue a new token with the same payload but a fresh jti and expiration.
    const { userId, email, role } = result.payload;
    const newPayload = { userId, email, role, jti: crypto.randomUUID() };

    return jwt.sign(newPayload, JWT_SECRET, jwtSignOptions);
  }
}

// Export a default instance backed by the shared connection pool.
export const userService = new UserService(
  new UserRepository(),
  new PasswordRepository(),
);
