import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const demoAccounts = [
    { label: 'Admin', email: 'admin@company.com', password: 'admin123' },
    { label: 'Technik', email: 'technician@company.com', password: 'tech123' },
    { label: 'Zgłaszający', email: 'reporter@company.com', password: 'reporter123' },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ email, password, name, department });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wykonać operacji');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(email: string, password: string) {
    setMode('login');
    setEmail(email);
    setPassword(password);
    setError('');
  }

  return (
    <div className="min-h-screen overflow-hidden bg-slate-950 text-slate-100 dark:bg-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden flex-col justify-between p-10 lg:flex">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(37,99,235,0.45),transparent_42%),radial-gradient(circle_at_20%_20%,rgba(45,212,191,0.28),transparent_26rem)]" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-lg font-black text-blue-700 shadow-2xl shadow-blue-950/30">
                T
              </div>
              <div>
                <h1 className="text-xl font-black">Ticketer</h1>
                <p className="text-sm text-slate-300">Centrum zgłoszeń IT</p>
              </div>
            </div>
          </div>

          <div className="relative max-w-xl">
            <h2 className="text-5xl font-black leading-[1.02]">
              Zgłoszenia, priorytety i praca techników w jednym miejscu.
            </h2>
            <p className="mt-5 max-w-lg text-lg leading-8 text-slate-300">
              Szybki dostęp do kolejki, historii decyzji i komunikacji z użytkownikami bez
              przeładowanego panelu.
            </p>
          </div>

          <div className="relative grid max-w-2xl grid-cols-3 gap-3">
            {['SLA', 'Statusy', 'Komentarze'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-bold uppercase text-teal-200">{item}</p>
                <div className="mt-3 h-1.5 rounded-full bg-white/15">
                  <div className="h-1.5 w-2/3 rounded-full bg-teal-300" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 items-center justify-center bg-slate-50 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100 lg:rounded-l-[2rem]">
          <div className="w-full" style={{ maxWidth: 'min(28rem, calc(100vw - 2.5rem))' }}>
            <div className="surface rounded-3xl p-7 sm:p-8">
              <div className="mb-8">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-lg font-black text-white shadow-lg shadow-blue-700/20 lg:hidden">
                    T
                  </div>
                  <ThemeToggle compact />
                </div>
                <h1 className="text-3xl font-black text-slate-950 dark:text-white">
                  {mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {mode === 'login'
                    ? 'Wejdź do panelu obsługi zgłoszeń Ticketer.'
                    : 'Rejestracja tworzy konto zgłaszającego na obecnym etapie in-memory.'}
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'register' && (
                  <>
                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">
                        Imię i nazwisko
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        minLength={2}
                        maxLength={100}
                        className="field"
                        placeholder="Jan Kowalski"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">
                        Dział
                      </label>
                      <input
                        type="text"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        required
                        minLength={2}
                        maxLength={100}
                        className="field"
                        placeholder="Sprzedaż"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="field"
                    placeholder="twoj@email.com"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">
                    Hasło
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={mode === 'register' ? 8 : undefined}
                    className="field"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="primary-button w-full px-4 py-3 disabled:opacity-50"
                >
                  {loading
                    ? mode === 'login' ? 'Logowanie...' : 'Tworzenie konta...'
                    : mode === 'login' ? 'Zaloguj się' : 'Zarejestruj się'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setMode((current) => (current === 'login' ? 'register' : 'login'));
                  setError('');
                }}
                className="mt-4 w-full text-center text-sm font-bold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
              >
                {mode === 'login' ? 'Nie masz konta? Zarejestruj się' : 'Masz już konto? Zaloguj się'}
              </button>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="mb-3 text-xs font-black uppercase text-slate-400 dark:text-slate-500">
                  Wbudowane konta
                </p>
                <div className="grid gap-2">
                  {demoAccounts.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemo(account.email, account.password)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-900 dark:hover:bg-blue-950/40 dark:hover:text-blue-200"
                    >
                      <span className="font-black text-slate-800 dark:text-slate-100">{account.label}:</span>{' '}
                      {account.email} / {account.password}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
