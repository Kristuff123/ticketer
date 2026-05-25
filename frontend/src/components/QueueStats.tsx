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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="surface animate-pulse rounded-2xl p-5">
            <div className="mb-3 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700"></div>
            <div className="h-8 w-3/4 rounded bg-slate-200 dark:bg-slate-700"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <div className="surface rounded-2xl p-5">
        <p className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Wszystkie zgłoszenia</p>
        <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">{stats.totalTickets}</p>
      </div>
      <div className="surface rounded-2xl p-5">
        <p className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Otwarte</p>
        <p className="mt-2 text-3xl font-black text-blue-700 dark:text-blue-400">{stats.openTickets}</p>
      </div>
      <div className="surface rounded-2xl p-5">
        <p className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Zgodność z SLA</p>
        <p className="mt-2 text-3xl font-black text-emerald-700 dark:text-emerald-400">
          {stats.slaCompliance != null ? `${Math.round(stats.slaCompliance)}%` : '—'}
        </p>
      </div>
      <div className="surface rounded-2xl p-5">
        <p className="text-xs font-black uppercase text-slate-400 dark:text-slate-500">Śr. czas odpowiedzi</p>
        <p className="mt-2 text-3xl font-black text-teal-700 dark:text-teal-300">
          {stats.avgResponseTime != null
            ? `${Math.round(stats.avgResponseTime)} min`
            : '—'}
        </p>
      </div>
    </div>
  );
}
