import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getNotifications, markNotificationRead, type Notification } from '../api';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadNotifications() {
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch {
      // ignore
    }
  }

  async function handleMarkRead(id: string) {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch {
      // ignore
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const roleLabels: Record<string, string> = {
    ADMIN: 'Administrator',
    TECHNICIAN: 'Technik',
    REPORTER: 'Zgłaszający',
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/88 md:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white dark:bg-blue-600">
          T
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-black text-slate-950 dark:text-white">Ticketer</h1>
        {user && (
            <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
              {roleLabels[user.role] || user.role}
            </p>
        )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Powiadomienia"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[0.68rem] font-black text-white ring-2 ring-white">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 z-50 mt-3 max-h-96 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/12 dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-100 p-4 dark:border-slate-800">
                <h3 className="font-black text-slate-900 dark:text-white">Powiadomienia</h3>
              </div>
              {notifications.length === 0 ? (
                <div className="p-5 text-center text-sm text-slate-500 dark:text-slate-400">
                  Brak powiadomień
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`cursor-pointer border-b border-slate-100 p-4 transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                      !n.read ? 'bg-blue-50/80 dark:bg-blue-950/40' : ''
                    }`}
                    onClick={() => handleMarkRead(n.id)}
                  >
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{n.message}</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      {new Date(n.createdAt).toLocaleString('pl-PL')}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* User info */}
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <span className="hidden max-w-48 truncate text-sm font-semibold text-slate-700 dark:text-slate-200 sm:inline">
            {user?.name || user?.email}
          </span>
          <button
            onClick={logout}
            className="secondary-button px-3 py-2 text-sm"
          >
            Wyloguj
          </button>
        </div>
      </div>
      </div>
    </nav>
  );
}
