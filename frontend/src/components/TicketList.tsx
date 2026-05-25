import type { Ticket } from '../api';

interface TicketListProps {
  tickets: Ticket[];
  onSelect?: (ticket: Ticket) => void;
  selectedId?: string;
}

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

export default function TicketList({ tickets, onSelect, selectedId }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        Brak zgłoszeń do wyświetlenia
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Tytuł
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Priorytet
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Data
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              onClick={() => onSelect?.(ticket)}
              className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                selectedId === ticket.id ? 'bg-blue-50' : ''
              }`}
            >
              <td className="px-4 py-3">
                <div className="text-sm font-medium text-gray-900">{ticket.title}</div>
                <div className="text-xs text-gray-500">{ticket.category}</div>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    priorityBadge[ticket.priority] || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {priorityLabel[ticket.priority] || ticket.priority}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    statusBadge[ticket.status] || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {statusLabel[ticket.status] || ticket.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {new Date(ticket.createdAt).toLocaleDateString('pl-PL')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
