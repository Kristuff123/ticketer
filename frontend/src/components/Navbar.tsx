import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getNotifications, markNotificationRead, type Notification } from '../api';

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
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-800">🎫 Ticketer</h1>
        {user && (
          <span className="text-sm text-gray-500">
            | {roleLabels[user.role] || user.role}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100"
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
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
              <div className="p-3 border-b border-gray-200">
                <h3 className="font-semibold text-gray-800">Powiadomienia</h3>
              </div>
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  Brak powiadomień
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                      !n.read ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => handleMarkRead(n.id)}
                  >
                    <p className="text-sm text-gray-700">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(n.createdAt).toLocaleString('pl-PL')}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* User info */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700">{user?.name || user?.email}</span>
          <button
            onClick={logout}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            Wyloguj
          </button>
        </div>
      </div>
    </nav>
  );
}
