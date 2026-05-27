# Implementation Plan: IT Ticket Management — Persistent Data Layer

## Overview

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Each prompt builds on previous prompts and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus only on tasks that involve writing, modifying, or testing code.

This plan migrates the application from in-memory storage to a fully persistent PostgreSQL + Redis data layer. Work proceeds bottom-up: configuration → migrations → repositories → service wiring → caching → token blacklist → health endpoint → integration. All implementation is in TypeScript, using `node-pg-migrate` for schema versioning, `bcrypt` for password hashing, and `fast-check` (already a dev dependency) for property-based tests.

## Tasks

- [-] 1. Environment configuration and connection pool
  - [x] 1.1 Add database and Redis configuration helpers to `src/config/env.ts`
    - Add `getDatabaseUrl()` returning `DATABASE_URL` if set, otherwise `null`
    - Add `getRedisUrl()` returning `REDIS_URL` if set, otherwise composed from `REDIS_HOST`/`REDIS_PORT`
    - Add `getPgPoolMax()` reading `PG_POOL_MAX`, validating integer in 1–100, defaulting to 10 on invalid input
    - Add `isPgSslEnabled()` returning true when `PGSSL=true` or `DATABASE_SSL=true`
    - Add `assertPersistenceConfig()` that throws on `NODE_ENV=production` when neither `DATABASE_URL` nor `PGHOST` is set
    - _Requirements: 1.9, 1.10, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 1.2 Update `src/database/connection.ts` to use new config helpers and SIGTERM drain
    - Read `PG_POOL_MAX` via `getPgPoolMax()` and apply it to `Pool({ max })`
    - Read SSL flag via `isPgSslEnabled()`
    - Use `getDatabaseUrl()` with fallback to individual `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` env vars
    - Register a `SIGTERM` handler that calls `pool.end()` with a 30-second drain timeout
    - Export `pingDatabase()` helper that runs `SELECT 1` for health checks
    - _Requirements: 9.7, 9.8, 13.1, 13.2, 13.3_

  - [ ]\* 1.3 Write property tests for environment configuration in `src/config/env.test.ts`
    - **Property 3: Connection configuration precedence** — for any combination of `DATABASE_URL` / `REDIS_URL` and individual variables, the full URL takes precedence when set
    - **Property 4: Pool max size validation** — `PG_POOL_MAX` is honored only when it is an integer in 1–100; otherwise default 10 is used
    - **Validates: Requirements 1.9, 13.1, 13.2, 13.4**

  - [x] 1.4 Update `.env.example` with all required PostgreSQL and Redis variables
    - Add or update entries for: `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSL`, `DATABASE_SSL`, `PG_POOL_MAX`, `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`
    - Each entry must include a one-line comment describing purpose and a non-empty example value
    - _Requirements: 13.6_

- [-] 2. Database migration system
  - [x] 2.1 Create initial schema migration `migrations/0001_initial-schema.js`
    - Use `node-pg-migrate` JavaScript migration format with an `up` function
    - Recreate every table currently in `src/database/schema.sql` (`users`, `tickets`, `comments`, `notifications`, `ticket_history`) using `CREATE TABLE IF NOT EXISTS`
    - Recreate every index currently in `schema.sql` using `CREATE INDEX IF NOT EXISTS`
    - Add the new `user_passwords` table with columns `user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`, `password_hash VARCHAR(255) NOT NULL`, `updated_at TIMESTAMP NOT NULL DEFAULT NOW()`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [x] 2.2 Create migration runner module `src/database/migrate.ts`
    - Export `runMigrations()` that resolves connection config via `getDatabaseUrl()` / individual env vars
    - Apply pending migrations in ascending timestamp order using `node-pg-migrate`
    - Enforce a 10-second connection timeout; on timeout, log error and `process.exit(1)`
    - On migration failure, log the migration name and SQL error, then `process.exit(1)`
    - On success, log `"Applied N migration(s); schema version: <last-file>"`
    - Export `runMigrationsScript()` for the `npm run migrate` entry point
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.11_

  - [x] 2.3 Update `package.json` with new dependencies and scripts
    - Install runtime dependencies: `node-pg-migrate`, `bcrypt`
    - Install dev dependencies: `@types/bcrypt`
    - Add script `"migrate": "node --import tsx src/database/migrate.ts"` (or equivalent invoking `runMigrationsScript`)
    - _Requirements: 1.1, 1.8, 5.1_

  - [x] 2.4 Wire `runMigrations()` into application startup in `src/index.ts`
    - Call `await runMigrations()` before `app.listen(PORT, ...)` so the HTTP server only starts after migrations succeed
    - Ensure the production guard from `assertPersistenceConfig()` runs first
    - _Requirements: 1.2, 13.5_

  - [x] 2.5 Remove `src/database/schema.sql` from the repository
    - Delete the file so the migration system is the sole source of truth for schema
    - _Requirements: 2.5_

  - [ ]\* 2.6 Write property tests for migration runner in `src/database/__tests__/migrate.test.ts`
    - **Property 1: Migration ordering** — for any set of migration files with distinct timestamps, runner applies them in strictly ascending timestamp order
    - **Property 2: Migration idempotence** — re-running the runner against a database with all migrations already recorded does not re-execute any migration
    - **Validates: Requirements 1.2, 1.7**

  - [ ]\* 2.7 Write unit tests for migration runner error handling in `src/database/__tests__/migrate.test.ts`
    - Connection failure → log error + exit(1)
    - Migration SQL failure → log migration name + error + exit(1)
    - Connection attempt > 10 seconds → log timeout + exit(1)
    - `npm run migrate` script invokes `runMigrationsScript`
    - _Requirements: 1.4, 1.5, 1.8, 1.11_

- [ ] 3. Checkpoint - Migration system verified
  - Ensure all tests pass, ask the user if questions arise.

- [-] 4. Repository implementation
  - [x] 4.1 Expand `TicketRepository` in `src/database/repositories/ticket-repository.ts`
    - Add UUID format validation in `findById` that throws `ValidationError` before executing any query when the input is not a valid UUID
    - Ensure `update` always sets `updated_at = NOW()` and supports the full updatable field map (`title`, `description`, `category`, `priority`, `status`, `assigneeId`, `resolvedAt`, `dueDate`, `location`)
    - Ensure `update` returns the existing record when given an empty field object (no-op UPDATE)
    - Ensure `findByFilters` orders by `created_at` ascending and returns `[]` when no rows match
    - Ensure `create` accepts `status` and uses parameterized queries; let FK violations propagate as referential integrity errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]\* 4.2 Write property tests for `TicketRepository` in `src/database/repositories/__tests__/ticket-repository.test.ts`
    - **Property 5: Ticket create/findById round-trip** — create then findById returns the persisted ticket with empty comments/history
    - **Property 6: Ticket update preserves unmodified fields** — update changes exactly the specified fields and refreshes `updated_at`
    - **Property 7: Ticket filter correctness** — every result satisfies all filter criteria, ordered by `created_at` ASC
    - **Property 8: Invalid UUID rejected without DB query** — non-UUID input throws before any query runs
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.7**

  - [x] 4.3 Expand `UserRepository` in `src/database/repositories/user-repository.ts`
    - Add `create(user)` inserting into `users` and returning the persisted `User`; let unique-email violations propagate
    - Add `update(id, fields)` with empty-object guard returning the existing record without executing UPDATE
    - Ensure `update` returns `null` when the user ID does not exist
    - Ensure `findByEmail` performs a case-insensitive lookup
    - Ensure `findByRole` filters on `is_active = true` and matching role
    - Use parameterized queries for all SQL
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [ ]\* 4.4 Write property tests for `UserRepository` in `src/database/repositories/__tests__/user-repository.test.ts`
    - **Property 9: User create/findById round-trip** — create then findById returns the persisted user with all fields equal
    - **Property 10: Case-insensitive email lookup** — findByEmail returns the same user across any casing variant of the stored email
    - **Property 11: findByRole returns only active users with matching role** — every result has `is_active = true` and matching role
    - **Property 12: User update preserves unmodified fields** — update changes exactly the specified fields
    - **Validates: Requirements 4.1, 4.3, 4.4, 4.5, 4.6**

  - [x] 4.5 Create `PasswordRepository` at `src/database/repositories/password-repository.ts`
    - Implement `setPassword(userId, plaintext)` that validates `plaintext.length >= 8` (throws `ValidationError` if shorter, before any hashing or DB call), hashes with bcrypt cost factor 12, and upserts into `user_passwords` with `updated_at = NOW()`
    - Implement `verifyPassword(userId, plaintext)` that returns `false` when no row exists for `userId` and otherwise compares plaintext against the stored hash via `bcrypt.compare`
    - Never log or return the plaintext or the hash
    - Let FK violations from `setPassword` propagate
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]\* 4.6 Write property tests for `PasswordRepository` in `src/database/repositories/__tests__/password-repository.test.ts`
    - **Property 13: Password set/verify round-trip** — setPassword then verifyPassword with the same plaintext returns true; any different string returns false
    - **Property 14: Short password rejected before hashing** — for any plaintext of length 0–7, setPassword throws and no hash or DB call occurs
    - **Validates: Requirements 5.1, 5.2, 5.5**

  - [x] 4.7 Create `CommentRepository` at `src/database/repositories/comment-repository.ts`
    - Implement `create(comment)` inserting into `comments` and returning the persisted `Comment`; let FK violations propagate
    - Implement `findByTicketId(ticketId, includeInternal?)` returning all comments for the ticket ordered by `created_at` ascending
    - When `includeInternal === false`, exclude rows where `is_internal = true`; when omitted or `true`, include all
    - Use parameterized queries
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]\* 4.8 Write property tests for `CommentRepository` in `src/database/repositories/__tests__/comment-repository.test.ts`
    - **Property 15: Comment create/findByTicketId round-trip with ordering** — create then findByTicketId includes the new comment; results ordered by `created_at` ASC
    - **Property 16: Internal comment filtering** — findByTicketId with `includeInternal=false` returns no internal comments
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 4.9 Create `NotificationRepository` at `src/database/repositories/notification-repository.ts`
    - Implement `create(notification)` inserting into `notifications` and returning the persisted `Notification`; propagate DB errors without partial inserts
    - Implement `findByUserId(userId, page?, pageSize?)` with defaults `page=1`, `pageSize=50` (clamped 1–100), returning `{ notifications, total, page, pageSize, totalPages }` ordered by `created_at` DESC
    - On DB error in `findByUserId`, return an empty result with `error` field instead of throwing
    - Implement `markAsRead(notificationId, userId)` that updates `is_read=true` and `read_at=NOW()` only when the notification belongs to the user; returns the updated row or `null`
    - Use parameterized queries
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]\* 4.10 Write property tests for `NotificationRepository` in `src/database/repositories/__tests__/notification-repository.test.ts`
    - **Property 17: Notification create/findByUserId round-trip with pagination ordering** — create then findByUserId includes the entry; results ordered by `created_at` DESC; pagination metadata consistent
    - **Property 18: markAsRead sets read state** — for a notification owned by the user, markAsRead returns the updated notification with `is_read=true` and a non-null `read_at`
    - **Validates: Requirements 7.1, 7.3, 7.5**

  - [x] 4.11 Create `TicketHistoryRepository` at `src/database/repositories/ticket-history-repository.ts`
    - Implement `append(entry)` inserting into `ticket_history` and returning the persisted entry; throw on FK violation; throw other DB errors so callers can handle them
    - Implement `findByTicketId(ticketId)` returning entries ordered by `timestamp` ascending; empty array when none
    - Use parameterized queries
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]\* 4.12 Write property test for `TicketHistoryRepository` in `src/database/repositories/__tests__/ticket-history-repository.test.ts`
    - **Property 19: History append/findByTicketId round-trip with ordering** — append then findByTicketId includes the entry; results ordered by `timestamp` ASC
    - **Validates: Requirements 8.1, 8.4**

- [ ] 5. Checkpoint - Repository layer verified
  - Ensure all tests pass, ask the user if questions arise.

- [-] 6. Service layer wiring
  - [x] 6.1 Wire `TicketService` in `src/services/ticket-service.ts` to use repositories
    - Replace the in-memory `Map` with constructor-injected `TicketRepository`, `CommentRepository`, `TicketHistoryRepository`
    - Route all reads/writes through repositories (`create`, `findById`, `update`, `findByFilters`)
    - In `getTicket`, call `CommentRepository.findByTicketId` and `TicketHistoryRepository.findByTicketId` to populate `comments` and `history`; if either fails, return `{ success: false, error }` without a partially populated ticket
    - Append `TicketHistoryRepository.append` calls on every status, assignment, priority, or category change
    - Remove the `getTicketStore()` accessor that exposes the in-memory map
    - _Requirements: 9.1, 9.5, 9.6_

  - [ ]\* 6.2 Write property test for `TicketService.getTicket` in `src/services/__tests__/ticket-service.test.ts`
    - **Property 20: getTicket populates comments and history** — for any ticket with associated comments and history, getTicket returns a ticket with both arrays fully populated from the repositories
    - **Validates: Requirements 9.5**

  - [x] 6.3 Wire `UserService` in `src/services/user-service.ts` to use repositories and add `jti` claim
    - Replace the in-memory `Map` with constructor-injected `UserRepository` and `PasswordRepository`
    - Route `findByEmail`, `findById`, `findByRole`, `create`, `update` through `UserRepository`
    - Use `PasswordRepository.setPassword` and `PasswordRepository.verifyPassword` for credential operations
    - Update `generateToken` to add a `jti` claim (UUID v4 via `crypto.randomUUID()`) to every issued JWT
    - Update `validateToken` to expose `jti` on the returned payload
    - _Requirements: 9.2, 11.8_

  - [ ]\* 6.4 Write unit tests for `UserService` wiring in `src/services/__tests__/user-service.test.ts`
    - Login uses `PasswordRepository.verifyPassword` for credential check
    - Duplicate-email registration surfaces `UserRepository.create` constraint error
    - Tokens issued by `generateToken` contain a UUID v4 `jti` claim
    - _Requirements: 9.2, 11.8_

  - [x] 6.5 Wire `QueueService` in `src/services/queue-service.ts` to use `TicketRepository`
    - Replace `setTickets`/array-based state with constructor-injected `TicketRepository`
    - Implement `getPendingTickets(filters)` by calling `TicketRepository.findByFilters({ excludeStatuses: [RESOLVED, CLOSED], ...filters })`
    - Remove the per-request `setTickets(...)` middleware in `index.ts` (handled in task 9.1)
    - _Requirements: 9.3_

  - [x] 6.6 Wire `NotificationService` in `src/services/notification-service.ts` to use `NotificationRepository`
    - Replace the in-memory `Map` with constructor-injected `NotificationRepository`
    - Route `createNotification`, `getNotifications` (paginated), and `markAsRead` through the repository
    - Preserve existing fan-out (email + WebSocket) behavior; treat repo errors per the Requirement 7.4 contract
    - _Requirements: 9.4_

- [-] 7. Redis caching layer
  - [x] 7.1 Implement deterministic cache key derivation in `src/cache/queue-cache.ts`
    - Add `deriveQueueCacheKey(filters: QueueFilters): string` that produces an identical key for deeply equal filter objects (including pagination fields) and a different key for any field difference
    - Use a stable serialization (sorted keys) followed by a SHA-256 hash to bound key length
    - Export the function alongside existing `getCachedQueueResults` / `setCachedQueueResults` / `invalidateQueueCache`
    - _Requirements: 10.6_

  - [x] 7.2 Integrate queue cache into `QueueService.getPendingTickets`
    - Before querying PostgreSQL, call `getCachedQueueResults(deriveQueueCacheKey(filters))`; on hit, return the cached value
    - On cache miss, query `TicketRepository.findByFilters`, then call `setCachedQueueResults(key, result, 30)` and return it
    - On Redis error, log a warning and fall back to PostgreSQL; if the PostgreSQL fallback also fails, return `{ tickets: [], total: 0, page, pageSize, totalPages: 1 }` without throwing
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

  - [x] 7.3 Invalidate queue cache on ticket mutations in `src/services/ticket-service.ts`
    - Call `invalidateQueueCache()` after every successful ticket creation
    - Call `invalidateQueueCache()` after any update that changes `status`, `assigneeId`, `priority`, or `category`
    - Wrap invalidation in try/catch and log warnings on Redis errors so mutations are not blocked
    - _Requirements: 10.4_

  - [ ]\* 7.4 Write property tests for queue cache in `src/services/__tests__/queue-service.test.ts`
    - **Property 21: Queue cache-first lookup** — when a cached result exists for a key, getPendingTickets returns it without querying PostgreSQL; on miss, it queries, stores with TTL 30s, and returns
    - **Property 22: Cache invalidation on ticket mutation** — after a status/assignee/priority/category change or a new ticket, all existing queue cache entries are invalidated
    - **Property 23: Deterministic cache key** — deeply equal filters produce identical keys; differing filters produce different keys
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.6**

- [-] 8. JWT token blacklist and logout
  - [x] 8.1 Create token blacklist module at `src/cache/token-blacklist.ts`
    - Implement `blacklistToken(jti: string, ttlSeconds: number): Promise<void>` that writes key `blacklist:{jti}` with `EX ttlSeconds`; if `ttlSeconds <= 0`, skip the write
    - Implement `isBlacklisted(jti: string): Promise<boolean>` that returns `true` when the key exists
    - On Redis errors, swallow the error, log a warning, and return `false` from `isBlacklisted` (graceful degradation)
    - _Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x] 8.2 Update `authenticate` middleware in `src/middleware/auth.ts` to check the blacklist
    - After validating signature and expiry, extract the `jti` claim and call `isBlacklisted(jti)`
    - If `isBlacklisted` returns `true`, respond with HTTP 401 `AUTHENTICATION_REQUIRED`
    - If the blacklist check throws, log a warning and allow the request to proceed
    - _Requirements: 11.2, 11.5_

  - [x] 8.3 Add `POST /auth/logout` route in `src/routes/auth.ts`
    - Validate the Bearer token using `userService.validateToken`
    - Compute `ttl = exp - Math.floor(Date.now() / 1000)`; if `ttl > 0`, call `blacklistToken(jti, ttl)`
    - Return HTTP 200 in all cases (including expired tokens and Redis unavailability)
    - _Requirements: 11.1, 11.4, 11.7_

  - [ ]\* 8.4 Write property tests for token blacklist in `src/cache/__tests__/token-blacklist.test.ts`
    - **Property 24: Logout stores JTI with correct TTL and key format** — for any valid non-expired token, logout writes `blacklist:{jti}` with `ttl = exp - floor(Date.now()/1000)` and returns HTTP 200
    - **Property 25: Blacklisted token rejected** — for any token whose JTI has been blacklisted, the authenticate middleware rejects with HTTP 401
    - **Property 26: JWT includes jti claim** — every token from `generateToken` has a UUID v4 `jti` claim
    - **Validates: Requirements 11.1, 11.2, 11.6, 11.8**

- [-] 9. Health endpoint and application integration
  - [x] 9.1 Rewire `src/index.ts` to inject pool-backed repositories and extend `/health`
    - Instantiate all repositories with the shared `pg.Pool`
    - Construct services via constructor injection (`new TicketService(ticketRepo, commentRepo, historyRepo, notificationService, userService)`, `new UserService(userRepo, passwordRepo)`, `new QueueService(ticketRepo)`, `new NotificationService(notificationRepo, ...)`)
    - Remove the `userService['ticketLookup']` patch and the per-request `queueService.setTickets` middleware
    - Replace the existing `/health` handler with parallel `pingDatabase()` + Redis `PING` checks, each wrapped in `Promise.race` with a 2-second timeout
    - Respond with `{ status, db, cache, uptimeSeconds, timestamp }`; HTTP 200 only when both `db` and `cache` are `"ok"`, otherwise HTTP 503
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [ ]\* 9.2 Write property test for the health endpoint in `src/routes/__tests__/health.test.ts`
    - **Property 27: Health response fields and HTTP status** — for any combination of DB/Redis availability, the response contains both `db` and `cache` fields with values `"ok"` or `"error"`; HTTP 200 iff both are `"ok"`, otherwise HTTP 503
    - **Validates: Requirements 12.1, 12.2, 12.5, 12.6**

  - [ ]\* 9.3 Write integration tests for end-to-end persistence flow in `src/__tests__/integration.test.ts`
    - Migration applies cleanly against a fresh test database, including `user_passwords`
    - Full ticket lifecycle (create → comment → assign → resolve) persists across a simulated restart
    - Logout + subsequent request returns HTTP 401 from the blacklist
    - Queue cache hit avoids the repository (instrumented via spy)
    - SIGTERM drains the pool within 30 seconds
    - _Requirements: 2.4, 9.1, 9.4, 9.8, 10.1, 11.2_

- [ ] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. They cover property-based tests, unit tests, and integration tests.
- Each task references the specific requirements clauses it implements for full traceability.
- Property-based tests (using `fast-check`, already a dev dependency) cover all 27 correctness properties from the design.
- Repository property tests use a real test PostgreSQL database with per-test transaction rollback. Pure-logic tests (cache key derivation, env config, JWT claims) run entirely in-memory.
- Checkpoints (tasks 3, 5, 10) ensure incremental validation between major phases.
- The `node-pg-migrate` and `bcrypt` packages are added in task 2.3 before any code that depends on them runs.
- `src/database/schema.sql` is deleted in task 2.5 once migration 0001 is in place; from then on, the migration system is the sole source of truth for the schema.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4", "2.1", "2.3", "7.1", "8.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "8.4"] },
    {
      "id": 2,
      "tasks": [
        "2.4",
        "2.5",
        "2.6",
        "2.7",
        "4.1",
        "4.3",
        "4.5",
        "4.7",
        "4.9",
        "4.11"
      ]
    },
    { "id": 3, "tasks": ["4.2", "4.4", "4.6", "4.8", "4.10", "4.12"] },
    { "id": 4, "tasks": ["6.1", "6.3", "6.5", "6.6", "8.3"] },
    { "id": 5, "tasks": ["6.2", "6.4", "7.2", "7.3", "8.2"] },
    { "id": 6, "tasks": ["7.4", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3"] }
  ]
}
```
