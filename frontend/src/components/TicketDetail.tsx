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

interface TicketDetailProps {
  ticketId: string;
  onUpdated?: () => void;
}

const statusBadge: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-purple-100 text-purple-800',
  WAITING_FOR_INFO: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-800',
  REOPENED: 'bg-red-100 text-red-800',
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
  CRITICAL: 'bg-red-100 text-red-800',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-green-100 text-green-800',
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
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-full"></div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        Nie znaleziono zgłoszenia
      </div>
    );
  }

  const allowedTransitions = STATUS_TRANSITIONS[ticket.status] || [];
  const isAdminOrTech = user?.role === 'ADMIN' || user?.role === 'TECHNICIAN';

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{ticket.title}</h2>
            <p className="text-sm text-gray-500 mt-1">ID: {ticket.id}</p>
          </div>
          <div className="flex gap-2">
            <span
              className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
                priorityBadge[ticket.priority] || ''
              }`}
            >
              {priorityLabel[ticket.priority] || ticket.priority}
            </span>
            <span
              className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
                statusBadge[ticket.status] || ''
              }`}
            >
              {statusLabel[ticket.status] || ticket.status}
            </span>
          </div>
        </div>

        <p className="mt-4 text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Zgłaszający:</span>{' '}
            <span className="text-gray-800">{ticket.reporterName || ticket.reporterId}</span>
          </div>
          <div>
            <span className="text-gray-500">Przypisany:</span>{' '}
            <span className="text-gray-800">
              {ticket.assigneeName || ticket.assigneeId || 'Nieprzypisany'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Kategoria:</span>{' '}
            <span className="text-gray-800">{ticket.category}</span>
          </div>
          <div>
            <span className="text-gray-500">Utworzono:</span>{' '}
            <span className="text-gray-800">
              {new Date(ticket.createdAt).toLocaleString('pl-PL')}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {isAdminOrTech && (
        <div className="p-4 bg-gray-50 border-b border-gray-200 space-y-3">
          {/* Status change */}
          {allowedTransitions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600">Zmień status:</span>
              {allowedTransitions.map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className="px-3 py-1 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {statusLabel[status] || status}
                </button>
              ))}
            </div>
          )}

          {/* Assign */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Przypisz:</span>
            <input
              type="text"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              placeholder="ID użytkownika"
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleAssign}
              className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Przypisz
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('comments')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'comments'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Komentarze
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Historia
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-4 max-h-80 overflow-y-auto">
        {activeTab === 'comments' && (
          <div className="space-y-3">
            {ticket.comments && ticket.comments.length > 0 ? (
              ticket.comments.map((comment) => (
                <div
                  key={comment.id}
                  className={`p-3 rounded-lg ${
                    comment.isInternal
                      ? 'bg-yellow-50 border border-yellow-200'
                      : 'bg-gray-50 border border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800">
                      {comment.authorName || comment.authorId}
                    </span>
                    <div className="flex items-center gap-2">
                      {comment.isInternal && (
                        <span className="text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">
                          Wewnętrzny
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(comment.createdAt).toLocaleString('pl-PL')}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700">{comment.content}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Brak komentarzy</p>
            )}

            {/* Add comment form */}
            <form onSubmit={handleAddComment} className="mt-4 space-y-2">
              <textarea
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder="Dodaj komentarz..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="flex items-center justify-between">
                {isAdminOrTech && (
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Komentarz wewnętrzny
                  </label>
                )}
                <button
                  type="submit"
                  className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
                  className="flex items-start gap-3 p-2 text-sm border-b border-gray-100 last:border-0"
                >
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-400 shrink-0"></div>
                  <div className="flex-1">
                    <p className="text-gray-700">
                      <span className="font-medium">{entry.userName || entry.userId}</span>{' '}
                      — {entry.action}
                      {entry.oldValue && entry.newValue && (
                        <span className="text-gray-500">
                          {' '}
                          ({entry.oldValue} → {entry.newValue})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(entry.createdAt).toLocaleString('pl-PL')}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Brak historii</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
