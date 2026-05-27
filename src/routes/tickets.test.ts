// TODO(it-ticket-management/6.6): NotificationService.clearAll() was removed
// when the service was wired to NotificationRepository. The notification
// reset in beforeEach should be replaced with a repository-level reset (or
// dropped if the test no longer needs it); see spec task 6.6.
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app, ticketService } from "../index.js";
import { NotificationService } from "../services/notification-service.js";

let baseUrl: string;
let testServer: ReturnType<typeof app.listen>;

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });
  const body = (await response.json()) as T;
  return { status: response.status, body };
}

async function login(email: string, password: string): Promise<string> {
  const response = await request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return response.body.token;
}

describe("ticket routes", () => {
  beforeAll(() => {
    testServer = app.listen(0);
    const address = testServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    testServer.close();
  });

  beforeEach(() => {
    ticketService.getTicketStore().clear();
    NotificationService.clearAll();
  });

  it("filters internal comments from reporter ticket responses", async () => {
    const reporterToken = await login("reporter@company.com", "reporter123");
    const adminToken = await login("admin@company.com", "admin123");

    const created = await request<{ id: string }>("/tickets", {
      method: "POST",
      token: reporterToken,
      body: JSON.stringify({
        title: "Laptop problem",
        description: "Screen flickers after login",
        category: "HARDWARE",
        priority: "MEDIUM",
        location: "HQ",
      }),
    });

    expect(created.status).toBe(201);

    await request(`/tickets/${created.body.id}/comments`, {
      method: "POST",
      token: reporterToken,
      body: JSON.stringify({ content: "Public detail", isInternal: false }),
    });
    await request(`/tickets/${created.body.id}/comments`, {
      method: "POST",
      token: adminToken,
      body: JSON.stringify({ content: "Internal note", isInternal: true }),
    });

    const reporterView = await request<{
      comments: Array<{ content: string; isInternal: boolean }>;
    }>(`/tickets/${created.body.id}`, { token: reporterToken });
    const adminView = await request<{
      comments: Array<{ content: string; isInternal: boolean }>;
    }>(`/tickets/${created.body.id}`, { token: adminToken });

    expect(reporterView.body.comments).toEqual([
      expect.objectContaining({ content: "Public detail", isInternal: false }),
    ]);
    expect(adminView.body.comments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: "Public detail",
          isInternal: false,
        }),
        expect.objectContaining({ content: "Internal note", isInternal: true }),
      ]),
    );
  });

  it("registers a new reporter account", async () => {
    const email = `route-user-${Date.now()}@example.com`;

    const registered = await request<{
      token: string;
      user: { email: string; role: string };
    }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: "securePass123",
        name: "Route User",
        department: "Support",
      }),
    });

    expect(registered.status).toBe(201);
    expect(registered.body.token).toBeDefined();
    expect(registered.body.user.email).toBe(email);
    expect(registered.body.user.role).toBe("REPORTER");
  });
});
