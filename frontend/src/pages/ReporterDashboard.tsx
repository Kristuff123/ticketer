import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import TicketForm from '../components/TicketForm';
import TicketList from '../components/TicketList';
import TicketDetail from '../components/TicketDetail';
import { listMyTickets, type Ticket } from '../api';

export default function ReporterDashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTickets();
  }, []);

  async function loadTickets() {
    try {
      const data = await listMyTickets();
      setTickets(data);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-6">
          <h1 className="text-3xl font-black text-slate-950 dark:text-white">Moje centrum zgłoszeń</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Utwórz nowe zgłoszenie i śledź odpowiedzi zespołu IT.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Create ticket */}
          <div>
            <TicketForm onCreated={loadTickets} />
          </div>

          {/* Right: Ticket detail or placeholder */}
          <div>
            {selectedTicket ? (
              <TicketDetail
                ticketId={selectedTicket.id}
                onUpdated={loadTickets}
              />
            ) : (
              <div className="surface rounded-2xl p-8 text-center text-slate-400 dark:text-slate-500">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.7}
                      d="M8 10h8M8 14h5m7-2a8 8 0 11-16 0 8 8 0 0116 0z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium">
                  Wybierz zgłoszenie z listy poniżej, aby zobaczyć szczegóły
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Tickets list */}
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-black text-slate-950 dark:text-white">Moje zgłoszenia</h2>
          {loading ? (
            <div className="surface rounded-2xl p-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
              Ładowanie...
            </div>
          ) : (
            <TicketList
              tickets={tickets}
              onSelect={setSelectedTicket}
              selectedId={selectedTicket?.id}
            />
          )}
        </div>
      </main>
    </div>
  );
}
