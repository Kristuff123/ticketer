import { useState } from 'react';
import { createTicket } from '../api';
import { STORE_LOCATIONS } from '../data/store-locations';

interface TicketFormProps {
  onCreated?: () => void;
}

const CATEGORIES = [
  { value: 'HARDWARE', label: 'Sprzęt' },
  { value: 'SOFTWARE', label: 'Oprogramowanie' },
  { value: 'NETWORK', label: 'Sieć' },
  { value: 'ACCESS', label: 'Dostęp' },
  { value: 'OTHER', label: 'Inne' },
];

const PRIORITIES = [
  { value: 'CRITICAL', label: 'Krytyczny', color: 'text-red-600' },
  { value: 'HIGH', label: 'Wysoki', color: 'text-orange-600' },
  { value: 'MEDIUM', label: 'Średni', color: 'text-yellow-600' },
  { value: 'LOW', label: 'Niski', color: 'text-green-600' },
];

export default function TicketForm({ onCreated }: TicketFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('SOFTWARE');
  const [priority, setPriority] = useState('MEDIUM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await createTicket({ title, description, category, priority, location });
      setSuccess('Zgłoszenie zostało utworzone pomyślnie!');
      setTitle('');
      setDescription('');
      setLocation('');
      setCategory('SOFTWARE');
      setPriority('MEDIUM');
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wystąpił błąd');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="surface rounded-2xl p-6">
      <div className="mb-5">
        <h2 className="text-xl font-black text-slate-950 dark:text-white">Nowe zgłoszenie</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Opisz problem i ustaw priorytet obsługi.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {success}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">Tytuł</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="field"
            placeholder="Krótki opis problemu"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">Lokalizacja</label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
            className="field"
          >
            <option value="">Wybierz sklep lub administrację</option>
            {STORE_LOCATIONS.map((store) => (
              <option key={store.code} value={store.code}>
                {store.code} — {store.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">Opis</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
            className="field min-h-32 resize-y"
            placeholder="Szczegółowy opis problemu..."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">Kategoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="field"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">Priorytet</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="field"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="primary-button w-full px-4 py-3 disabled:opacity-50"
        >
          {loading ? 'Tworzenie...' : 'Utwórz zgłoszenie'}
        </button>
      </div>
    </form>
  );
}
