# Requirements Document

## Introduction

This feature replaces the current in-memory storage layer of the IT Ticket Management System with a fully persistent, production-ready data layer. The scope covers three interconnected areas:

1. **Database migration system** — versioned, forward-only SQL migrations managed by `node-pg-migrate`, replacing the static `schema.sql` file. Migrations run automatically on app startup.
2. **PostgreSQL repository implementation** — the scaffolded repositories (`TicketRepository`, `UserRepository`) and the missing repositories (`CommentRepository`, `NotificationRepository`, `TicketHistoryRepository`, `PasswordRepository`) are fully implemented so all services persist data to PostgreSQL instead of in-memory maps.
3. **Redis caching layer** — the existing queue cache and a new JWT token blacklist are wired into the running application, with graceful degradation when Redis is unavailable.

The existing service interfaces (`ITicketService`, `IUserService`, `IQueueService`, `INotificationService`) and all route handlers remain unchanged. The health endpoint is extended to report database and Redis connectivity.

---

## Glossary

- **Migration_Runner**: The component responsible for discovering, ordering, and applying pending database migrations at startup using `node-pg-migrate`.
- **Migration_File**: A versioned SQL file following the `node-pg-migrate` naming convention (e.g., `1735000000000_initial-schema.js`), containing only forward (`up`) SQL.
- **Migration_Table**: The `pgmigrations` table created and managed by `node-pg-migrate` to track which migrations have been applied.
- **TicketRepository**: The data-access object responsible for all CRUD operations on the `tickets` table.
- **UserRepository**: The data-access object responsible for all CRUD operations on the `users` table, including password hash storage and lookup.
- **CommentRepository**: The data-access object responsible for creating and listing records in the `comments` table.
- **NotificationRepository**: The data-access object responsible for creating, listing, and marking records in the `notifications` table.
- **TicketHistoryRepository**: The data-access object responsible for appending and listing records in the `ticket_history` table.
- **PasswordRepository**: The data-access object responsible for storing and verifying bcrypt-hashed passwords in the `user_passwords` table.
- **Connection_Pool**: The `pg.Pool` instance that manages a bounded set of reusable PostgreSQL connections.
- **Queue_Cache**: The Redis-backed cache layer for queue query results, keyed by filter hash with a configurable TTL.
- **Token_Blacklist**: The Redis-backed store of invalidated JWT token IDs (JTI claims), used to enforce logout before token expiry.
- **Cache_Miss_Fallback**: The behaviour where the application queries PostgreSQL directly when Redis is unavailable or returns no cached value.
- **Health_Endpoint**: The `GET /health` route that reports the operational status of the application, database, and cache.

---

## Requirements

### Requirement 1: Database Migration System

**User Story:** As a DevOps engineer, I want a versioned migration system, so that database schema changes are tracked, reproducible, and applied automatically on every deployment without manual intervention.

#### Acceptance Criteria

1. THE Migration_Runner SHALL use `node-pg-migrate` to manage all schema changes.
2. WHEN the application starts and the database connection is established, THE Migration_Runner SHALL apply all pending Migration_Files in ascending timestamp order before the HTTP server begins accepting requests. WHEN there are no pending migrations, THE Migration_Runner SHALL allow the HTTP server to start immediately.
3. WHEN all pending migrations have been applied successfully, THE Migration_Runner SHALL log the number of migrations applied and the name of the last applied Migration_File as the final schema version.
4. IF the database connection cannot be established before migrations run, THEN THE Migration_Runner SHALL log the connection error and terminate the process with a non-zero exit code.
5. IF a Migration_File fails to apply, THEN THE Migration_Runner SHALL log the migration name and the SQL error, and terminate the process with a non-zero exit code to prevent the server from running against a broken schema.
6. THE Migration_Runner SHALL create and maintain the Migration_Table (`pgmigrations`) to record which migrations have been applied.
7. WHEN a migration has already been recorded in the Migration_Table, THE Migration_Runner SHALL skip that migration without re-executing it (idempotent application).
8. THE Migration_Runner SHALL support execution via an `npm run migrate` script in addition to automatic startup execution.
9. THE Migration_Runner SHALL read the database connection string from the `DATABASE_URL` environment variable, falling back to `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` individual variables.
10. WHEN `NODE_ENV` is `production` and `DATABASE_URL` is not set, THE Migration_Runner SHALL log a warning before attempting the fallback connection.
11. IF the database connection attempt exceeds 10 seconds, THEN THE Migration_Runner SHALL log a timeout error and terminate the process with a non-zero exit code.

### Requirement 2: Initial Schema Migration

**User Story:** As a developer, I want the existing `schema.sql` converted into the first versioned migration, so that the migration system owns the complete schema history from the beginning.

#### Acceptance Criteria

1. THE Migration_Runner SHALL include a Migration_File numbered `0001` that creates all tables defined in the current `schema.sql`: `users`, `tickets`, `comments`, `notifications`, and `ticket_history`.
2. THE Migration_File `0001` SHALL create all indexes defined in the current `schema.sql`.
3. THE Migration_File `0001` SHALL add a `user_passwords` table with columns: `user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`, `password_hash VARCHAR(255) NOT NULL`, `updated_at TIMESTAMP NOT NULL DEFAULT NOW()`.
4. WHEN Migration_File `0001` has been applied, the resulting database schema SHALL contain the same tables, columns, constraints, and indexes as those defined in `schema.sql`, plus the `user_passwords` table.
5. WHEN Migration_File `0001` has been applied, `schema.sql` SHALL be removed from the repository so that it is no longer the source of truth for the database schema.
6. THE Migration_File `0001` SHALL use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` so that it is safe to run against a database that was previously initialised from `schema.sql`.

### Requirement 3: TicketRepository Implementation

**User Story:** As a backend developer, I want the TicketRepository to persist and retrieve tickets from PostgreSQL, so that ticket data survives application restarts.

#### Acceptance Criteria

1. WHEN `TicketRepository.create` is called with an object containing a UUID `id`, a UUID `reporterId` that exists in the `users` table, a non-empty `title`, a non-empty `description`, a valid `TicketPriority` value, a valid `TicketCategory` value, a valid `TicketStatus` value, and an optional UUID `assigneeId`, THE TicketRepository SHALL insert one row into the `tickets` table and return the persisted `Ticket` object with `comments` set to `[]` and `history` set to `[]`.
2. WHEN `TicketRepository.findById` is called with a well-formed UUID that exists in the `tickets` table, THE TicketRepository SHALL return the corresponding `Ticket` object with `comments` set to `[]` and `history` set to `[]`.
3. WHEN `TicketRepository.update` is called with a ticket ID and a partial object containing one or more of the updatable fields (`title`, `description`, `status`, `priority`, `category`, `assigneeId`, `resolvedAt`, `closedAt`), THE TicketRepository SHALL update only the specified columns, set `updated_at` to the current timestamp, and return the updated `Ticket` object.
4. WHEN `TicketRepository.findByFilters` is called with a `TicketFilters` object containing one or more of the filterable fields (`status`, `priority`, `category`, `assigneeId`, `reporterId`), THE TicketRepository SHALL return only tickets matching all specified criteria ordered by `created_at` ascending. WHEN no tickets match the criteria, THE TicketRepository SHALL return an empty array.
5. THE TicketRepository SHALL use parameterised queries for all SQL statements to prevent SQL injection.
6. WHEN `TicketRepository.findById` is called with a well-formed UUID that does not exist in the `tickets` table, THE TicketRepository SHALL return `null`.
7. IF `TicketRepository.findById` is called with a string that is not a well-formed UUID, THEN THE TicketRepository SHALL throw an error indicating invalid ID format without executing a database query.
8. IF `TicketRepository.create` is called with a `reporterId` that does not exist in the `users` table, THEN THE TicketRepository SHALL throw an error indicating a referential integrity violation without inserting a row.

### Requirement 4: UserRepository Implementation

**User Story:** As a backend developer, I want the UserRepository to persist and retrieve users from PostgreSQL, so that user accounts and preferences survive application restarts.

#### Acceptance Criteria

1. WHEN `UserRepository.create` is called with valid user data, THE UserRepository SHALL insert a row into the `users` table and return the persisted `User` object.
2. IF `UserRepository.create` is called with an email address that already exists in the `users` table, THEN THE UserRepository SHALL throw an error indicating a duplicate email constraint violation without inserting a row.
3. WHEN `UserRepository.findByEmail` is called with an email address, THE UserRepository SHALL perform a case-insensitive lookup and return the matching `User` object, or `null` if no match exists.
4. WHEN `UserRepository.findById` is called with a user ID, THE UserRepository SHALL return the corresponding `User` object if found, or `null` if no user with that ID exists.
5. WHEN `UserRepository.findByRole` is called with a `UserRole` value, THE UserRepository SHALL return all users where `is_active = true` and `role` matches the specified value.
6. WHEN `UserRepository.update` is called with a user ID and a non-empty partial object of updatable fields, THE UserRepository SHALL update only the specified columns and return the updated `User` object.
7. IF `UserRepository.update` is called with a user ID that does not exist in the `users` table, THEN THE UserRepository SHALL return `null` without modifying any row.
8. IF `UserRepository.update` is called with an empty update object (no fields to change), THEN THE UserRepository SHALL return the existing `User` object without executing an UPDATE statement.
9. THE UserRepository SHALL use parameterised queries for all SQL statements to prevent SQL injection.

### Requirement 5: PasswordRepository Implementation

**User Story:** As a security engineer, I want passwords stored as bcrypt hashes in a dedicated table, so that plaintext passwords are never persisted and credential storage is isolated from user profile data.

#### Acceptance Criteria

1. WHEN `PasswordRepository.setPassword` is called with a user ID and a plaintext password of at least 8 characters, THE PasswordRepository SHALL hash the password using bcrypt with a cost factor of at least 12 and upsert the hash into the `user_passwords` table, updating `updated_at` to the current timestamp.
2. WHEN `PasswordRepository.verifyPassword` is called with a user ID and a plaintext password, and a hash exists for that user, THE PasswordRepository SHALL compare the plaintext against the stored hash using bcrypt and return `true` if they match, `false` otherwise.
3. WHEN `PasswordRepository.verifyPassword` is called with a user ID that has no entry in the `user_passwords` table, THE PasswordRepository SHALL return `false` without throwing an exception.
4. THE PasswordRepository SHALL never include the plaintext password or the bcrypt hash in any log output, error message, or return value other than the boolean result of `verifyPassword`.
5. IF `PasswordRepository.setPassword` is called with a plaintext password shorter than 8 characters, THEN THE PasswordRepository SHALL throw a validation error without executing any database query or hashing operation.
6. IF `PasswordRepository.setPassword` is called with a `userId` that does not exist in the `users` table, THEN THE PasswordRepository SHALL propagate the referential integrity error from the database without storing anything.

### Requirement 6: CommentRepository Implementation

**User Story:** As a backend developer, I want the CommentRepository to persist and retrieve ticket comments from PostgreSQL, so that comment history is durable.

#### Acceptance Criteria

1. WHEN `CommentRepository.create` is called with an object containing a UUID `id`, a UUID `ticketId` that exists in the `tickets` table, a UUID `authorId` that exists in the `users` table, and a non-empty `content` string, THE CommentRepository SHALL insert one row into the `comments` table and return the persisted `Comment` object.
2. WHEN `CommentRepository.findByTicketId` is called with a ticket ID, THE CommentRepository SHALL return all comments for that ticket ordered by `created_at` ascending. WHEN no comments exist for that ticket, THE CommentRepository SHALL return an empty array.
3. WHEN `CommentRepository.findByTicketId` is called with `includeInternal` set to `false`, THE CommentRepository SHALL exclude rows where `is_internal` is `true`. WHEN `includeInternal` is `true` or omitted, THE CommentRepository SHALL return all comments regardless of `is_internal`.
4. THE CommentRepository SHALL use parameterised queries for all SQL statements to prevent SQL injection.
5. IF `CommentRepository.create` is called with a `ticketId` or `authorId` that does not exist in the respective table, THEN THE CommentRepository SHALL propagate the referential integrity error from the database without inserting a row.

### Requirement 7: NotificationRepository Implementation

**User Story:** As a backend developer, I want the NotificationRepository to persist and retrieve notifications from PostgreSQL, so that users receive their notifications after reconnecting.

#### Acceptance Criteria

1. WHEN `NotificationRepository.create` is called with a notification object containing a UUID `id`, a UUID `userId`, a valid `NotificationType` value, a `title` of 1–255 characters, a non-empty `message`, and an optional UUID `ticketId`, THE NotificationRepository SHALL insert one row into the `notifications` table and return the persisted `Notification` object with all fields populated from the database.
2. IF `NotificationRepository.create` encounters a database error, THEN THE NotificationRepository SHALL propagate the error to the caller without inserting a partial row.
3. WHEN `NotificationRepository.findByUserId` is called with a UUID `userId`, a `page` value of at least 1 (defaulting to 1 if omitted), and a `pageSize` between 1 and 100 inclusive (defaulting to 50 if omitted), THE NotificationRepository SHALL return a result object containing the matching `notifications` array ordered by `created_at` descending, the `total` count of all notifications for that user, the effective `page`, the effective `pageSize`, and the `totalPages` count.
4. IF `NotificationRepository.findByUserId` encounters a database error, THEN THE NotificationRepository SHALL return a result object with an empty `notifications` array, `total: 0`, `totalPages: 1`, the requested `page` and `pageSize` values, and an `error` field describing the failure, without throwing an unhandled exception.
5. WHEN `NotificationRepository.markAsRead` is called with a `notificationId` and a `userId` where the notification exists and belongs to the specified user, THE NotificationRepository SHALL update `is_read` to `true` and set `read_at` to the current database server timestamp, and return the updated `Notification` object.
6. IF `NotificationRepository.markAsRead` is called with a `notificationId` that does not exist or does not belong to the specified `userId`, THEN THE NotificationRepository SHALL return `null` without modifying any row.
7. THE NotificationRepository SHALL use parameterised queries for all SQL statements to prevent SQL injection.

### Requirement 8: TicketHistoryRepository Implementation

**User Story:** As a backend developer, I want the TicketHistoryRepository to append and retrieve audit history entries from PostgreSQL, so that the full change log for every ticket is durable.

#### Acceptance Criteria

1. WHEN `TicketHistoryRepository.append` is called with an object containing a UUID `id`, a UUID `ticketId` that exists in the `tickets` table, a non-empty `action` string, optional `previousValue` and `newValue` strings, a UUID `userId`, and a `timestamp` value, THE TicketHistoryRepository SHALL insert one row into the `ticket_history` table and return the persisted `TicketHistoryEntry` object with all fields populated from the database.
2. IF `TicketHistoryRepository.append` encounters a database error other than a referential integrity violation, THEN THE TicketHistoryRepository SHALL throw the exception so the caller can handle the failure.
3. IF `TicketHistoryRepository.append` is called with a `ticketId` that does not exist in the `tickets` table, THEN THE TicketHistoryRepository SHALL throw an error indicating a referential integrity violation without inserting a row.
4. WHEN `TicketHistoryRepository.findByTicketId` is called with a ticket ID, THE TicketHistoryRepository SHALL return all history entries for that ticket ordered by `timestamp` ascending. WHEN no entries exist for that ticket, THE TicketHistoryRepository SHALL return an empty array.
5. THE TicketHistoryRepository SHALL use parameterised queries for all SQL statements to prevent SQL injection.

### Requirement 9: Service Layer — Repository Integration

**User Story:** As a backend developer, I want all services to use the repository layer instead of in-memory maps, so that the application is stateless between restarts and horizontally scalable.

#### Acceptance Criteria

1. WHILE the application is running, THE TicketService SHALL call `TicketRepository.create`, `TicketRepository.findById`, `TicketRepository.update`, and `TicketRepository.findByFilters` for all ticket data access operations instead of reading from or writing to an in-memory `Map`.
2. WHILE the application is running, THE UserService SHALL call `UserRepository.create`, `UserRepository.findByEmail`, `UserRepository.findById`, `UserRepository.update`, and `PasswordRepository.setPassword` / `PasswordRepository.verifyPassword` for all user and authentication operations instead of reading from or writing to an in-memory `Map`.
3. WHILE the application is running, THE QueueService SHALL call `TicketRepository.findByFilters` to retrieve pending tickets instead of receiving a ticket array via `setTickets`.
4. WHILE the application is running, THE NotificationService SHALL call `NotificationRepository.create`, `NotificationRepository.findByUserId`, and `NotificationRepository.markAsRead` for all notification persistence operations instead of reading from or writing to an in-memory `Map`.
5. WHEN `TicketService.getTicket` is called with a ticket ID, THE TicketService SHALL call `CommentRepository.findByTicketId` and `TicketHistoryRepository.findByTicketId` to populate the ticket's `comments` and `history` arrays before returning the result.
6. IF either `CommentRepository.findByTicketId` or `TicketHistoryRepository.findByTicketId` fails when called from `TicketService.getTicket`, THEN THE TicketService SHALL return a failure result to the caller without returning a partially populated ticket.
7. THE Connection_Pool SHALL be configured with a maximum of 10 connections by default, overridable via the `PG_POOL_MAX` environment variable.
8. WHEN the application receives a `SIGTERM` signal, THE Connection_Pool SHALL begin draining active connections and complete the drain within 30 seconds before the process exits.

### Requirement 10: Redis Queue Cache Integration

**User Story:** As a backend developer, I want the queue service to cache query results in Redis, so that repeated identical queue requests do not hit PostgreSQL on every call.

#### Acceptance Criteria

1. WHEN `QueueService.getPendingTickets` is called with a set of filters, THE Queue_Cache SHALL be checked for a cached result before querying PostgreSQL.
2. WHEN a cache hit occurs, THE QueueService SHALL return the cached result without querying PostgreSQL.
3. WHEN a cache miss occurs, THE QueueService SHALL query PostgreSQL, store the result in the Queue_Cache with a TTL of 30 seconds, and return the result.
4. WHEN a ticket is created, updated with a change to `status`, `assigneeId`, `priority`, or `category`, THE Queue_Cache SHALL invalidate all cached queue entries so subsequent requests reflect the latest data.
5. IF Redis is unavailable, THEN THE QueueService SHALL fall back to querying PostgreSQL directly and log a warning-level entry, without returning an error to the caller. IF the PostgreSQL fallback also fails, THEN THE QueueService SHALL return a `TicketListResult` with an empty `tickets` array and zero counts without throwing an unhandled exception.
6. THE Queue_Cache key SHALL be derived from a deterministic hash of all fields in the `QueueFilters` object, including pagination fields, to ensure cache correctness across different call sites.

### Requirement 11: Redis Token Blacklist

**User Story:** As a security engineer, I want invalidated JWT tokens to be tracked in Redis, so that logged-out tokens cannot be reused before their natural expiry.

#### Acceptance Criteria

1. WHEN a user sends a `POST /auth/logout` request with a valid Bearer token, THE Token_Blacklist SHALL store the token's JTI claim with a TTL equal to `exp − current Unix time` in whole seconds, and the endpoint SHALL return HTTP 200.
2. WHEN the `authenticate` middleware validates a token, THE Token_Blacklist SHALL be checked and, if the JTI is present, THE authenticate middleware SHALL reject the request with HTTP 401.
3. WHEN a token's TTL expires in Redis, THE Token_Blacklist SHALL automatically remove the entry without manual cleanup.
4. IF Redis is unavailable during a logout request, THEN THE Token_Blacklist SHALL log a warning-level entry indicating Redis unavailability and return HTTP 200 to the client, accepting the reduced security guarantee.
5. IF Redis is unavailable during token validation, THEN THE authenticate middleware SHALL allow the request to proceed and log a warning-level entry indicating the blacklist check was skipped, accepting the reduced security guarantee.
6. THE Token_Blacklist key format SHALL be `blacklist:{jti}` to namespace entries and avoid collisions with Queue_Cache keys.
7. IF the token presented at `POST /auth/logout` has already expired (current time ≥ `exp`), THEN THE Token_Blacklist SHALL skip the Redis write and return HTTP 200 without storing an entry with a zero or negative TTL.
8. THE JWT `generateToken` function SHALL include a `jti` claim (UUID v4) in every issued token so that the Token_Blacklist has a stable, unique identifier to store.

### Requirement 12: Health Endpoint Extension

**User Story:** As a DevOps engineer, I want the health endpoint to report the status of PostgreSQL and Redis, so that infrastructure monitoring can detect connectivity issues without inspecting application logs.

#### Acceptance Criteria

1. WHEN `GET /health` is called, THE Health_Endpoint SHALL return a JSON response containing a `db` field with value `"ok"` or `"error"` reflecting the current PostgreSQL connectivity.
2. WHEN `GET /health` is called, THE Health_Endpoint SHALL return a JSON response containing a `cache` field with value `"ok"` or `"error"` reflecting the current Redis connectivity.
3. WHEN `GET /health` is called and PostgreSQL is reachable, THE Health_Endpoint SHALL verify connectivity by executing a lightweight read-only probe query against the database.
4. WHEN `GET /health` is called and Redis is reachable, THE Health_Endpoint SHALL verify connectivity by sending a probe command to the Redis server and confirming a successful response.
5. WHEN either PostgreSQL or Redis is unreachable, THE Health_Endpoint SHALL return HTTP 503 instead of HTTP 200, while still reporting individual `db` and `cache` status fields in the response body.
6. WHEN both PostgreSQL and Redis are reachable, THE Health_Endpoint SHALL return HTTP 200.
7. THE Health_Endpoint SHALL allow each connectivity check at most 2 seconds of wall-clock time to complete.
8. IF either connectivity check exceeds 2 seconds, THEN THE Health_Endpoint SHALL set the corresponding `db` or `cache` field to `"error"` and return HTTP 503.

### Requirement 13: Environment Configuration

**User Story:** As a DevOps engineer, I want all database and cache connection parameters to be configurable via environment variables, so that the same Docker image can be deployed to any environment without rebuilding.

#### Acceptance Criteria

1. WHEN the application starts, THE Connection_Pool SHALL read its configuration from `DATABASE_URL` if set; otherwise it SHALL read from `PGHOST` (default `localhost`), `PGPORT` (default `5432`), `PGDATABASE` (default `app_db`), `PGUSER`, and `PGPASSWORD`. IF both `DATABASE_URL` and individual variables are set, `DATABASE_URL` SHALL take precedence.
2. THE Connection_Pool SHALL read the maximum pool size from `PG_POOL_MAX`, defaulting to `10`. IF `PG_POOL_MAX` is set to a value outside the range 1–100 or is not a valid integer, THE Connection_Pool SHALL fall back to the default of `10`.
3. IF `PGSSL` is set to `true` or `DATABASE_SSL` is set to `true`, THEN THE Connection_Pool SHALL enable SSL for all database connections. IF neither variable is set, SSL SHALL be disabled by default.
4. WHEN the application starts, THE Token_Blacklist and Queue_Cache SHALL read the Redis connection from `REDIS_URL` if set; otherwise they SHALL read from `REDIS_HOST` (default `localhost`) and `REDIS_PORT` (default `6379`). IF both `REDIS_URL` and individual variables are set, `REDIS_URL` SHALL take precedence.
5. WHEN `NODE_ENV` is `production` and neither `DATABASE_URL` nor `PGHOST` is set, THE Migration_Runner SHALL write an error message to stderr and terminate the process with a non-zero exit code without attempting migration execution.
6. THE `.env.example` file SHALL contain an entry for each of the following variables: `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSL`, `DATABASE_SSL`, `PG_POOL_MAX`, `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`. Each entry SHALL include a one-line comment describing the variable's purpose and a non-empty example value.
