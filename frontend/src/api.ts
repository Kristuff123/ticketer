const API_BASE = '/api';

let token: string | null = localStorage.getItem('token');

export function setToken(newToken: string | null) {
  token = newToken;
  if (newToken) {
    localStorage.setItem('token', newToken);
  } else {
    localStorage.removeItem('token');
  }
}

export function getToken(): string | null {
  return token;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Błąd serwera' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Auth
export function login(email: string, password: string) {
  return request<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// List tickets for current user
export async function listMyTickets(): Promise<Ticket[]> {
  const response = await request<any>('/tickets');
  if (Array.isArray(response)) return response;
  return response.tickets ?? [];
}

// Tickets
export function createTicket(data: {
  title: string;
  description: string;
  category: string;
  priority: string;
  location: string;
}) {
  return request<Ticket>('/tickets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getTicket(id: string) {
  return request<Ticket>(`/tickets/${id}`);
}

export function updateTicketStatus(id: string, status: string) {
  return request<Ticket>(`/tickets/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export function assignTicket(id: string, assigneeId: string) {
  return request<Ticket>(`/tickets/${id}/assign`, {
    method: 'PUT',
    body: JSON.stringify({ assigneeId }),
  });
}

export function addComment(id: string, content: string, isInternal: boolean = false) {
  return request<Comment>(`/tickets/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content, isInternal }),
  });
}

export function getTicketHistory(id: string) {
  return request<HistoryEntry[]>(`/tickets/${id}/history`);
}

// Queue
export async function getQueue(params: {
  priority?: string;
  category?: string;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}): Promise<QueueResponse> {
  const searchParams = new URLSearchParams();
  if (params.priority) searchParams.set('priority', params.priority);
  if (params.category) searchParams.set('category', params.category);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));

  const query = searchParams.toString();
  const response = await request<any>(`/queue${query ? `?${query}` : ''}`);

  // Backend returns { tickets, totalCount, page, pageSize, totalPages }
  // Frontend uses { tickets, total, page, pageSize, totalPages }
  return {
    tickets: response.tickets ?? [],
    total: response.totalCount ?? response.total ?? 0,
    page: response.page ?? 1,
    pageSize: response.pageSize ?? 20,
    totalPages: response.totalPages ?? 0,
  };
}

export async function getQueueStatistics(): Promise<QueueStatistics> {
  const stats = await request<any>('/queue/statistics');
  // Backend: { slaCompliancePercentage, averageTimeToFirstResponse }
  // Frontend wants: { totalTickets, openTickets, resolvedTickets, avgResponseTime, slaCompliance, ... }
  return {
    totalTickets: stats.totalTickets ?? 0,
    openTickets: stats.openTickets ?? 0,
    resolvedTickets: stats.resolvedTickets ?? 0,
    avgResponseTime:
      stats.averageTimeToFirstResponse != null
        ? Math.round(stats.averageTimeToFirstResponse / 60000) // ms -> minutes
        : stats.avgResponseTime ?? 0,
    slaCompliance: stats.slaCompliancePercentage ?? stats.slaCompliance ?? 0,
    byPriority: stats.byPriority ?? {},
    byStatus: stats.byStatus ?? {},
  };
}

// Notifications
export async function getNotifications(): Promise<Notification[]> {
  const response = await request<{ notifications?: Notification[] } | Notification[]>(
    '/notifications'
  );
  // Backend returns { notifications: [...], total, page, ... }
  // Normalize to array and map isRead -> read
  const list = Array.isArray(response) ? response : response.notifications ?? [];
  return list.map((n: any) => ({
    ...n,
    read: n.isRead ?? n.read ?? false,
  }));
}

export function markNotificationRead(id: string) {
  return request<void>(`/notifications/${id}/read`, {
    method: 'PUT',
  });
}

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'TECHNICIAN' | 'REPORTER';
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string;
  location?: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'NEW' | 'IN_PROGRESS' | 'WAITING_FOR_INFO' | 'RESOLVED' | 'CLOSED' | 'REOPENED';
  reporterId: string;
  reporterName?: string;
  assigneeId?: string;
  assigneeName?: string;
  comments?: Comment[];
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  authorName?: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export interface HistoryEntry {
  id: string;
  ticketId: string;
  userId: string;
  userName?: string;
  action: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
}

export interface QueueResponse {
  tickets: Ticket[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QueueStatistics {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  avgResponseTime: number;
  slaCompliance: number;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
}

export interface Notification {
  id: string;
  userId: string;
  ticketId: string;
  message: string;
  read: boolean;
  createdAt: string;
}
