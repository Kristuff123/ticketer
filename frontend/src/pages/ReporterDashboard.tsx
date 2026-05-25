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
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
                <p>Wybierz zgłoszenie z listy poniżej, aby zobaczyć szczegóły</p>
              </div>
            )}
          </div>
        </div>

        {/* Tickets list */}
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Moje zgłoszenia</h2>
          {loading ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
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
