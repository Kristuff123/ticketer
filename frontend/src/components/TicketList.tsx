import type { Ticket } from '../api';

interface TicketListProps {
  tickets: Ticket[];
  onSelect?: (ticket: Ticket) => void;
  selectedId?: string;
}

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

export default function TicketList({ tickets, onSelect, selectedId }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <div className="surface rounded-2xl p-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
        Brak zgłoszeń do wyświetlenia
      </div>
    );
  }

  return (
    <div className="surface overflow-hidden rounded-2xl">
      <table className="w-full">
        <thead className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/80">
          <tr>
            <th className="px-5 py-4 text-left text-xs font-black uppercase text-slate-400 dark:text-slate-500">
              Tytuł
            </th>
            <th className="px-5 py-4 text-left text-xs font-black uppercase text-slate-400 dark:text-slate-500">
              Priorytet
            </th>
            <th className="px-5 py-4 text-left text-xs font-black uppercase text-slate-400 dark:text-slate-500">
              Status
            </th>
            <th className="px-5 py-4 text-left text-xs font-black uppercase text-slate-400 dark:text-slate-500">
              Data
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              onClick={() => onSelect?.(ticket)}
              className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70 ${
                selectedId === ticket.id ? 'bg-blue-50/80 dark:bg-blue-950/35' : ''
              }`}
            >
              <td className="px-5 py-4">
                <div className="text-sm font-bold text-slate-950 dark:text-white">{ticket.title}</div>
                <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{ticket.category}</div>
              </td>
              <td className="px-5 py-4">
                <span
                  className={`pill ring-1 ${
                    priorityBadge[ticket.priority] || 'bg-slate-100 text-slate-700 ring-slate-200'
                  }`}
                >
                  {priorityLabel[ticket.priority] || ticket.priority}
                </span>
              </td>
              <td className="px-5 py-4">
                <span
                  className={`pill ring-1 ${
                    statusBadge[ticket.status] || 'bg-slate-100 text-slate-700 ring-slate-200'
                  }`}
                >
                  {statusLabel[ticket.status] || ticket.status}
                </span>
              </td>
              <td className="px-5 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                {new Date(ticket.createdAt).toLocaleDateString('pl-PL')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
