import { useState, useEffect } from 'react';
import { getQueueStatistics, type QueueStatistics } from '../api';

export default function QueueStats() {
  const [stats, setStats] = useState<QueueStatistics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const data = await getQueueStatistics();
      setStats(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm text-gray-500">Wszystkie zgłoszenia</p>
        <p className="text-2xl font-bold text-gray-800">{stats.totalTickets}</p>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm text-gray-500">Otwarte</p>
        <p className="text-2xl font-bold text-blue-600">{stats.openTickets}</p>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm text-gray-500">Zgodność z SLA</p>
        <p className="text-2xl font-bold text-green-600">
          {stats.slaCompliance != null ? `${Math.round(stats.slaCompliance)}%` : '—'}
        </p>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm text-gray-500">Śr. czas odpowiedzi</p>
        <p className="text-2xl font-bold text-purple-600">
          {stats.avgResponseTime != null
            ? `${Math.round(stats.avgResponseTime)} min`
            : '—'}
        </p>
      </div>
    </div>
  );
}
