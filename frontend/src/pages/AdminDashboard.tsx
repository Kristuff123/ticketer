import { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';
import TicketList from '../components/TicketList';
import TicketDetail from '../components/TicketDetail';
import QueueStats from '../components/QueueStats';
import { getQueue, type Ticket, type QueueResponse } from '../api';

export default function AdminDashboard() {
  const [queueData, setQueueData] = useState<QueueResponse | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState('');
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
    <div className="min-h-screen bg-gray-100">
      <Navbar />

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-[calc(100vh-57px)] bg-gray-900 text-white p-4 hidden lg:block">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4">Filtry</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Priorytet</label>
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  handleFilterChange();
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Wszystkie</option>
                <option value="CRITICAL">Krytyczny</option>
                <option value="HIGH">Wysoki</option>
                <option value="MEDIUM">Średni</option>
                <option value="LOW">Niski</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Kategoria</label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  handleFilterChange();
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-xs text-gray-400 mb-1">Sortowanie</label>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  handleFilterChange();
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500"
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
              className="w-full px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Wyczyść filtry
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">
          {/* Stats */}
          <div className="mb-6">
            <QueueStats />
          </div>

          {/* Mobile filters */}
          <div className="lg:hidden mb-4 flex gap-2 flex-wrap">
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                handleFilterChange();
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Ticket list */}
            <div className="xl:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-800">
                  Kolejka zgłoszeń
                  {queueData && (
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      ({queueData.total} łącznie)
                    </span>
                  )}
                </h2>
              </div>

              {loading ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
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
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ← Poprzednia
                      </button>
                      <span className="text-sm text-gray-600">
                        Strona {queueData.page} z {queueData.totalPages}
                      </span>
                      <button
                        onClick={() => setPage((p) => Math.min(queueData.totalPages, p + 1))}
                        disabled={page >= queueData.totalPages}
                        className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Następna →
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
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
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
                  <svg
                    className="w-12 h-12 mx-auto mb-3 text-gray-300"
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
                  <p>Wybierz zgłoszenie z listy, aby zobaczyć szczegóły</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
