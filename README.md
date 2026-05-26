# IT Ticket Management

System zarządzania zgłoszeniami IT z prostym interfejsem dla zgłaszających i pełnym dashboardem dla administratorów.

## Stack

- **Backend**: Node.js 22 + Express 5 + TypeScript
- **Frontend**: React 19 + Vite + Tailwind CSS 4 + React Router
- **Auth**: JWT (15 min token expiration)
- **Storage**: in-memory (PostgreSQL i Redis przygotowane w `src/database/` i `src/cache/`, ale nie podłączone)

## Uruchomienie przez Docker (zalecane)

```bash
docker compose up -d --build
```

Po chwili:
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000

Zatrzymanie:
```bash
docker compose down
```

Logi:
```bash
docker compose logs -f
```

## Uruchomienie lokalnie (bez Dockera)

Backend (terminal 1):
```bash
npm install
npm run dev
```

Frontend (terminal 2):
```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173, backend: http://localhost:3000.

## Powiadomienia email przez Brevo

Backend wysyła e-maile dla powiadomień, jeśli użytkownik ma włączone `emailNotifications` i skonfigurujesz SMTP w `.env`.

1. Skopiuj `.env.example` do `.env`.
2. W panelu Brevo wygeneruj klucz SMTP dla transakcyjnej wysyłki email.
3. Ustaw:

```bash
EMAIL_TRANSPORT=brevo
EMAIL_FROM="IT Ticketer <twoj-nadawca@twojadomena.pl>"
BREVO_SMTP_LOGIN=twoj-login-smtp-z-brevo
BREVO_SMTP_KEY=twoj-klucz-smtp-z-brevo
```

Domyślna konfiguracja używa hosta `smtp-relay.brevo.com` i portu `587`.
Bez tych zmiennych aplikacja używa lokalnego transportu JSON, czyli nie wysyła realnych wiadomości.

## Konta testowe

| Rola | Email | Hasło |
|------|-------|-------|
| Administrator | admin@company.com | admin123 |
| Technik | technician@company.com | tech123 |
| Zgłaszający | reporter@company.com | reporter123 |

Reporter widzi tylko swoje zgłoszenia. Admin/Technik widzą pełny dashboard z kolejką, filtrami, statystykami SLA.

## Testy

```bash
npm test
```

177 testów (12 zestawów property-based + integracyjne + jednostkowe).

## Struktura

```
.
├── src/                    Backend
│   ├── services/           Logika biznesowa (TicketService, QueueService, ...)
│   ├── routes/             Express routes
│   ├── middleware/         Auth + permissions
│   ├── models/             Typy i enumy
│   ├── utils/              Walidacja, SLA, transitions, history
│   ├── database/           Schemat PostgreSQL + repozytoria (przygotowane)
│   ├── cache/              Redis client + queue cache (przygotowane)
│   └── jobs/               Eskalacja, kolejka zadań
├── frontend/               React app
│   ├── src/
│   │   ├── pages/          LoginPage, AdminDashboard, ReporterDashboard
│   │   ├── components/     TicketList, TicketDetail, QueueStats, ...
│   │   ├── context/        AuthContext
│   │   └── api.ts          Klient HTTP
│   └── nginx.conf          Nginx + proxy /api → backend
├── Dockerfile              Backend (multi-stage TypeScript → Node)
├── frontend/Dockerfile     Frontend (multi-stage Vite + Nginx)
└── docker-compose.yml      Orchestracja
```

## Zmienne środowiskowe

- `PORT` (domyślnie 3000) — port backendu
- `JWT_SECRET` — sekret JWT (zmień w produkcji)
- `NODE_ENV` — `production` w Dockerze, `development` lokalnie
- `EMAIL_TRANSPORT=brevo` — włącza wysyłkę przez Brevo SMTP
- `EMAIL_FROM` — zweryfikowany nadawca wiadomości
- `BREVO_SMTP_LOGIN` — login SMTP z Brevo
- `BREVO_SMTP_KEY` — klucz SMTP z Brevo, nie API key
- `BREVO_SMTP_HOST` / `BREVO_SMTP_PORT` — opcjonalnie, domyślnie `smtp-relay.brevo.com:587`

Skopiuj `.env.example` do `.env` dla lokalnych ustawień środowiska.
