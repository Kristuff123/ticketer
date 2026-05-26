import { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';
import TicketList from '../components/TicketList';
import TicketDetail from '../components/TicketDetail';
import QueueStats from '../components/QueueStats';
import UserManagement from '../components/UserManagement';
import { getQueue, type Ticket, type QueueResponse } from '../api';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [queueData, setQueueData] = useState<QueueResponse | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'queue' | 'users'>('queue');

  // Filters
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState<'' | 'priority' | 'createdAt' | 'updatedAt' | 'dueDate'>('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getQueue({
        priority: priority || undefined,
        category: category || undefined,
        sortBy: sortBy || undefined,
        page,
        pageSize,
      });
      setQueueData(data);
    } catch {
      setQueueData(null);
    } finally {
      setLoading(false);
    }
  }, [priority, category, sortBy, page]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  function handleFilterChange() {
    setPage(1);
  }

  return (
    <div className="app-shell">
      <Navbar />

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 md:px-6">
        {/* Sidebar */}
        <aside className="surface hidden h-fit w-72 shrink-0 rounded-2xl p-5 lg:block">
          <h2 className="mb-5 text-xs font-black uppercase text-slate-400 dark:text-slate-500">Filtry kolejki</h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">Priorytet</label>
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  handleFilterChange();
                }}
                className="field text-sm"
              >
                <option value="">Wszystkie</option>
                <option value="CRITICAL">Krytyczny</option>
                <option value="HIGH">Wysoki</option>
                <option value="MEDIUM">Średni</option>
                <option value="LOW">Niski</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">Kategoria</label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  handleFilterChange();
                }}
                className="field text-sm"
              >
                <option value="">Wszystkie</option>
                <option value="HARDWARE">Sprzęt</option>
                <option value="SOFTWARE">Oprogramowanie</option>
                <option value="NETWORK">Sieć</option>
                <option value="ACCESS">Dostęp</option>
                <option value="OTHER">Inne</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">Sortowanie</label>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as typeof sortBy);
                  handleFilterChange();
                }}
                className="field text-sm"
              >
                <option value="">Domyślne</option>
                <option value="priority">Priorytet</option>
                <option value="createdAt">Data utworzenia</option>
                <option value="updatedAt">Ostatnia aktualizacja</option>
              </select>
            </div>

            <button
              onClick={() => {
                setPriority('');
                setCategory('');
                setSortBy('');
                setPage(1);
              }}
              className="secondary-button w-full px-3 py-2.5 text-sm"
            >
              Wyczyść filtry
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-3xl font-black text-slate-950 dark:text-white">
                {activeView === 'queue' ? 'Kolejka obsługi' : 'Zarządzanie użytkownikami'}
              </h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {activeView === 'queue'
                  ? 'Priorytety, statusy i szczegóły zgłoszeń dla zespołu IT.'
                  : 'Role, dostęp i konta zespołu oraz zgłaszających.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {user?.role === 'ADMIN' && (
                <>
                  <button
                    onClick={() => setActiveView('queue')}
                    className={`secondary-button px-3 py-2 text-sm ${
                      activeView === 'queue' ? 'border-blue-300 text-blue-700 dark:text-blue-200' : ''
                    }`}
                  >
                    Kolejka
                  </button>
                  <button
                    onClick={() => setActiveView('users')}
                    className={`secondary-button px-3 py-2 text-sm ${
                      activeView === 'users' ? 'border-blue-300 text-blue-700 dark:text-blue-200' : ''
                    }`}
                  >
                    Użytkownicy
                  </button>
                </>
              )}
              {activeView === 'queue' && queueData && (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  {queueData.total} zgłoszeń w widoku
                </div>
              )}
            </div>
          </div>

          {activeView === 'users' ? (
            <UserManagement />
          ) : (
            <>

          {/* Stats */}
          <div className="mb-6">
            <QueueStats />
          </div>

          {/* Mobile filters */}
          <div className="mb-5 flex flex-wrap gap-2 lg:hidden">
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                handleFilterChange();
              }}
              className="field w-auto text-sm"
            >
              <option value="">Priorytet: Wszystkie</option>
              <option value="CRITICAL">Krytyczny</option>
              <option value="HIGH">Wysoki</option>
              <option value="MEDIUM">Średni</option>
              <option value="LOW">Niski</option>
            </select>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                handleFilterChange();
              }}
              className="field w-auto text-sm"
            >
              <option value="">Kategoria: Wszystkie</option>
              <option value="HARDWARE">Sprzęt</option>
              <option value="SOFTWARE">Oprogramowanie</option>
              <option value="NETWORK">Sieć</option>
              <option value="ACCESS">Dostęp</option>
              <option value="OTHER">Inne</option>
            </select>
          </div>

          {/* Content grid */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Ticket list */}
            <div className="xl:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-950 dark:text-white">
                  Kolejka zgłoszeń
                  {queueData && (
                    <span className="ml-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                      ({queueData.total} łącznie)
                    </span>
                  )}
                </h2>
              </div>

              {loading ? (
                <div className="surface rounded-2xl p-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
                  Ładowanie...
                </div>
              ) : queueData ? (
                <>
                  <TicketList
                    tickets={queueData.tickets}
                    onSelect={setSelectedTicket}
                    selectedId={selectedTicket?.id}
                  />

                  {/* Pagination */}
                  {queueData.totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="secondary-button px-3 py-2 text-sm disabled:opacity-50"
                      >
                        Poprzednia
                      </button>
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                        Strona {queueData.page} z {queueData.totalPages}
                      </span>
                      <button
                        onClick={() => setPage((p) => Math.min(queueData.totalPages, p + 1))}
                        disabled={page >= queueData.totalPages}
                        className="secondary-button px-3 py-2 text-sm disabled:opacity-50"
                      >
                        Następna
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="surface rounded-2xl p-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
                  Nie udało się załadować kolejki
                </div>
              )}
            </div>

            {/* Ticket detail */}
            <div className="xl:col-span-1">
              {selectedTicket ? (
                <TicketDetail
                  ticketId={selectedTicket.id}
                  onUpdated={loadQueue}
                />
              ) : (
                <div className="surface rounded-2xl p-8 text-center text-slate-400 dark:text-slate-500">
                  <svg
                    className="mx-auto mb-3 h-12 w-12 text-slate-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-sm font-medium">Wybierz zgłoszenie z listy, aby zobaczyć szczegóły</p>
                </div>
              )}
            </div>
          </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
