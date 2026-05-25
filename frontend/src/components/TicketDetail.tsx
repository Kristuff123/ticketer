import { useState, useEffect } from 'react';
import {
  getTicket,
  updateTicketStatus,
  assignTicket,
  addComment,
  getTicketHistory,
  type Ticket,
  type HistoryEntry,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { STORE_LOCATIONS } from '../data/store-locations';

interface TicketDetailProps {
  ticketId: string;
  onUpdated?: () => void;
}

const statusBadge: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700 ring-blue-200',
  IN_PROGRESS: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  WAITING_FOR_INFO: 'bg-amber-50 text-amber-700 ring-amber-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CLOSED: 'bg-slate-100 text-slate-700 ring-slate-200',
  REOPENED: 'bg-red-50 text-red-700 ring-red-200',
};

const statusLabel: Record<string, string> = {
  NEW: 'Nowe',
  IN_PROGRESS: 'W trakcie',
  WAITING_FOR_INFO: 'Oczekuje na info',
  RESOLVED: 'Rozwiązane',
  CLOSED: 'Zamknięte',
  REOPENED: 'Ponownie otwarte',
};

const priorityBadge: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 ring-red-200',
  HIGH: 'bg-orange-50 text-orange-700 ring-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-700 ring-amber-200',
  LOW: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const priorityLabel: Record<string, string> = {
  CRITICAL: 'Krytyczny',
  HIGH: 'Wysoki',
  MEDIUM: 'Średni',
  LOW: 'Niski',
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  NEW: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_FOR_INFO', 'RESOLVED'],
  WAITING_FOR_INFO: ['IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS'],
};

function getLocationLabel(location?: string) {
  if (!location) return 'Nie podano';
  const store = STORE_LOCATIONS.find((item) => item.code === location);
  return store ? `${store.code} — ${store.name}` : location;
}

export default function TicketDetail({ ticketId, onUpdated }: TicketDetailProps) {
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentContent, setCommentContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');

  useEffect(() => {
    loadTicket();
    loadHistory();
  }, [ticketId]);

  async function loadTicket() {
    setLoading(true);
    try {
      const data = await getTicket(ticketId);
      setTicket(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const data = await getTicketHistory(ticketId);
      setHistory(data);
    } catch {
      // ignore
    }
  }

  async function handleStatusChange(newStatus: string) {
    try {
      await updateTicketStatus(ticketId, newStatus);
      await loadTicket();
      await loadHistory();
      onUpdated?.();
    } catch {
      // ignore
    }
  }

  async function handleAssign() {
    if (!assigneeId.trim()) return;
    try {
      await assignTicket(ticketId, assigneeId.trim());
      await loadTicket();
      await loadHistory();
      setAssigneeId('');
      onUpdated?.();
    } catch {
      // ignore
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentContent.trim()) return;
    try {
      await addComment(ticketId, commentContent.trim(), isInternal);
      setCommentContent('');
      setIsInternal(false);
      await loadTicket();
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="surface animate-pulse rounded-2xl p-6">
        <div className="mb-4 h-6 w-3/4 rounded bg-slate-200 dark:bg-slate-700"></div>
        <div className="mb-2 h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700"></div>
        <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-700"></div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="surface rounded-2xl p-6 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
        Nie znaleziono zgłoszenia
      </div>
    );
  }

  const allowedTransitions = STATUS_TRANSITIONS[ticket.status] || [];
  const isAdminOrTech = user?.role === 'ADMIN' || user?.role === 'TECHNICIAN';

  return (
    <div className="surface overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="border-b border-slate-100 p-6 dark:border-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-black text-slate-950 dark:text-white">{ticket.title}</h2>
            <p className="mt-1 break-all text-xs font-semibold text-slate-400 dark:text-slate-500">ID: {ticket.id}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <span
              className={`pill ring-1 ${
                priorityBadge[ticket.priority] || ''
              }`}
            >
              {priorityLabel[ticket.priority] || ticket.priority}
            </span>
            <span
              className={`pill ring-1 ${
                statusBadge[ticket.status] || ''
              }`}
            >
              {statusLabel[ticket.status] || ticket.status}
            </span>
          </div>
        </div>

        <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{ticket.description}</p>

        <div className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/70">
            <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">Zgłaszający</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">{ticket.reporterName || ticket.reporterId}</span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/70">
            <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">Przypisany</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">
              {ticket.assigneeName || ticket.assigneeId || 'Nieprzypisany'}
            </span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/70">
            <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">Kategoria</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">{ticket.category}</span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/70">
            <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">Lokalizacja</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">{getLocationLabel(ticket.location)}</span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/70">
            <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">Utworzono</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">
              {new Date(ticket.createdAt).toLocaleString('pl-PL')}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {isAdminOrTech && (
        <div className="space-y-3 border-b border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          {/* Status change */}
          {allowedTransitions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Zmień status:</span>
              {allowedTransitions.map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className="secondary-button px-3 py-1.5 text-xs"
                >
                  {statusLabel[status] || status}
                </button>
              ))}
            </div>
          )}

          {/* Assign */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Przypisz:</span>
            <input
              type="text"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              placeholder="ID użytkownika"
              className="field w-44 py-1.5 text-sm"
            />
            <button
              onClick={handleAssign}
              className="primary-button px-3 py-1.5 text-xs"
            >
              Przypisz
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-100 dark:border-slate-800">
        <div className="flex">
          <button
            onClick={() => setActiveTab('comments')}
            className={`border-b-2 px-5 py-3 text-sm font-black transition-colors ${
              activeTab === 'comments'
                ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Komentarze
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`border-b-2 px-5 py-3 text-sm font-black transition-colors ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Historia
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-h-96 overflow-y-auto p-4">
        {activeTab === 'comments' && (
          <div className="space-y-3">
            {ticket.comments && ticket.comments.length > 0 ? (
              ticket.comments.map((comment) => (
                <div
                  key={comment.id}
                  className={`p-3 rounded-lg ${
                    comment.isInternal
                      ? 'border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/35'
                      : 'border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {comment.authorName || comment.authorId}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {comment.isInternal && (
                        <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                          Wewnętrzny
                        </span>
                      )}
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {new Date(comment.createdAt).toLocaleString('pl-PL')}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">{comment.content}</p>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-sm font-medium text-slate-500 dark:text-slate-400">Brak komentarzy</p>
            )}

            {/* Add comment form */}
            <form onSubmit={handleAddComment} className="mt-4 space-y-2">
              <textarea
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder="Dodaj komentarz..."
                rows={3}
                className="field text-sm"
              />
              <div className="flex items-center justify-between">
                {isAdminOrTech && (
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Komentarz wewnętrzny
                  </label>
                )}
                <button
                  type="submit"
                  className="primary-button px-4 py-2 text-sm"
                >
                  Dodaj
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-2">
            {history.length > 0 ? (
              history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 border-b border-slate-100 p-3 text-sm last:border-0 dark:border-slate-800"
                >
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"></div>
                  <div className="flex-1">
                    <p className="text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{entry.userName || entry.userId}</span>{' '}
                      — {entry.action}
                      {entry.oldValue && entry.newValue && (
                        <span className="text-slate-500 dark:text-slate-400">
                          {' '}
                          ({entry.oldValue} → {entry.newValue})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {new Date(entry.createdAt).toLocaleString('pl-PL')}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-sm font-medium text-slate-500 dark:text-slate-400">Brak historii</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
