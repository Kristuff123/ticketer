import { useEffect, useState } from 'react';
import { createUser, getUsers, updateUser, type User } from '../api';
import { useAuth } from '../context/AuthContext';

const roleLabel: Record<User['role'], string> = {
  ADMIN: 'Administrator',
  TECHNICIAN: 'Technik',
  REPORTER: 'Zgłaszający',
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    department: '',
    role: 'REPORTER' as User['role'],
  });

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      setUsers(await getUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać użytkowników');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await createUser(form);
      setForm({ name: '', email: '', password: '', department: '', role: 'REPORTER' });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się utworzyć użytkownika');
    }
  }

  async function handleUpdate(id: string, data: Partial<Pick<User, 'role' | 'isActive'>>) {
    setError('');
    try {
      await updateUser(id, data);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zaktualizować użytkownika');
    }
  }

  return (
    <div className="space-y-6">
      <section className="surface rounded-2xl p-5">
        <div className="mb-5">
          <h2 className="text-lg font-black text-slate-950 dark:text-white">Nowy użytkownik</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Utwórz konto zgłaszającego, technika albo administratora.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="field text-sm"
            placeholder="Imię i nazwisko"
            required
            minLength={2}
          />
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="field text-sm"
            placeholder="email@firma.pl"
            required
          />
          <input
            value={form.department}
            onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
            className="field text-sm"
            placeholder="Dział"
            required
            minLength={2}
          />
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            className="field text-sm"
            placeholder="Hasło"
            required
            minLength={8}
          />
          <div className="flex gap-2">
            <select
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as User['role'] }))}
              className="field text-sm"
            >
              <option value="REPORTER">Zgłaszający</option>
              <option value="TECHNICIAN">Technik</option>
              <option value="ADMIN">Administrator</option>
            </select>
            <button type="submit" className="primary-button shrink-0 px-4 py-2 text-sm">
              Dodaj
            </button>
          </div>
        </form>
      </section>

      <section className="surface overflow-hidden rounded-2xl">
        <div className="border-b border-slate-100 p-5 dark:border-slate-800">
          <h2 className="text-lg font-black text-slate-950 dark:text-white">Użytkownicy</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            Ładowanie...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/80">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase text-slate-400 dark:text-slate-500">
                    Użytkownik
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase text-slate-400 dark:text-slate-500">
                    Dział
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase text-slate-400 dark:text-slate-500">
                    Rola
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase text-slate-400 dark:text-slate-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((user) => {
                  const isSelf = user.id === currentUser?.id;
                  return (
                    <tr key={user.id}>
                      <td className="px-5 py-4">
                        <div className="text-sm font-bold text-slate-950 dark:text-white">{user.name}</div>
                        <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                          {user.email}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {user.department}
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleUpdate(user.id, { role: e.target.value as User['role'] })
                          }
                          disabled={isSelf}
                          className="field w-44 py-2 text-sm disabled:opacity-60"
                        >
                          <option value="REPORTER">Zgłaszający</option>
                          <option value="TECHNICIAN">Technik</option>
                          <option value="ADMIN">Administrator</option>
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleUpdate(user.id, { isActive: !user.isActive })}
                          disabled={isSelf}
                          className={`secondary-button px-3 py-2 text-sm disabled:opacity-60 ${
                            user.isActive ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {user.isActive ? 'Aktywny' : 'Nieaktywny'}
                        </button>
                        <span className="ml-3 text-xs font-semibold text-slate-400">
                          {roleLabel[user.role]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
