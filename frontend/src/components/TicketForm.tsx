import { useState } from 'react';
import { createTicket } from '../api';

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
      await createTicket({ title, description, category, priority });
      setSuccess('Zgłoszenie zostało utworzone pomyślnie!');
      setTitle('');
      setDescription('');
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
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Nowe zgłoszenie</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          {success}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tytuł</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Krótki opis problemu"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Opis</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Szczegółowy opis problemu..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priorytet</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Tworzenie...' : 'Utwórz zgłoszenie'}
        </button>
      </div>
    </form>
  );
}
