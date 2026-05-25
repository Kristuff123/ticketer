# Implementation Plan: IT Ticket Management

## Overview

Implementation of a full IT ticket management system in TypeScript, covering ticket lifecycle (creation, assignment, status transitions, escalation, resolution), queue management with filtering/sorting/pagination, notification delivery (email, dashboard, WebSocket), role-based access control, and audit history. The system uses PostgreSQL for persistence, Redis for caching/job queues, and WebSocket for real-time notifications.

## Tasks

- [x] 1. Set up project structure and core types
  - [x] 1.1 Initialize TypeScript project with directory structure and dependencies
    - Create project with `src/` directory containing `services/`, `models/`, `utils/`, `tests/` folders
    - Install dependencies: express, pg, redis, socket.io, nodemailer, jsonwebtoken, fast-check (dev), vitest (dev)
    - Configure `tsconfig.json`, `package.json` scripts, and vitest config
    - _Requirements: N/A (infrastructure)_

  - [x] 1.2 Define enums, interfaces, and data model types
    - Create `src/models/enums.ts` with `TicketCategory`, `Priority`, `TicketStatus`, `UserRole`, `NotificationType`, `HistoryActionType`
    - Create `src/models/ticket.ts` with `Ticket`, `TicketCreateInput`, `TicketUpdateInput`, `TicketResult` interfaces
    - Create `src/models/user.ts` with `User`, `UserPreferences`, `Credentials`, `AuthResult` interfaces
    - Create `src/models/comment.ts` with `Comment`, `CommentInput`, `CommentResult` interfaces
    - Create `src/models/notification.ts` with `Notification`, `NotificationResult` interfaces
    - Create `src/models/history.ts` with `TicketHistoryEntry` interface
    - Create `src/models/queue.ts` with `QueueFilters`, `QueueStats`, `TicketListResult` interfaces
    - _Requirements: 1.1, 1.4, 2.1, 4.1, 11.3, 11.4_

  - [x] 1.3 Define service interfaces
    - Create `src/services/interfaces/ticket-service.interface.ts` with `ITicketService`
    - Create `src/services/interfaces/queue-service.interface.ts` with `IQueueService`
    - Create `src/services/interfaces/notification-service.interface.ts` with `INotificationService`
    - Create `src/services/interfaces/user-service.interface.ts` with `IUserService`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1_

- [x] 2. Implement validation utilities
  - [x] 2.1 Implement input validation functions
    - Create `src/utils/validation.ts` with `validateTicketInput()`, `validateCommentInput()`, `validateEmail()`
    - Title: 1-200 characters, non-whitespace-only
    - Description: 1-5000 characters, non-whitespace-only
    - Category: must be valid `TicketCategory` enum value
    - Priority: must be valid `Priority` enum value
    - Comment content: 1-2000 characters, non-whitespace-only
    - Email: local-part@domain format with at least one dot in domain, case-insensitive uniqueness
    - Return structured `ValidationResult` with field-specific error messages
    - _Requirements: 1.2, 1.3, 1.4, 6.2, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x]* 2.2 Write property test for input validation (Property 2)
    - **Property 2: Input Validation Correctness**
    - Generate random strings of varying lengths and verify acceptance/rejection boundaries
    - Test that valid enum values are accepted and invalid values are rejected
    - **Validates: Requirements 1.2, 1.3, 1.4, 11.1, 11.2, 11.3, 11.4, 11.6**

  - [x] 2.3 Implement SLA due date calculation
    - Create `src/utils/sla.ts` with `calculateDueDate(priority: Priority, createdAt: Date): Date`
    - CRITICAL = createdAt + 4 hours, HIGH = +8 hours, MEDIUM = +24 hours, LOW = +72 hours
    - Ensure due date is always strictly later than creation date
    - Implement `recalculateDueDate()` for priority changes using original creation time
    - _Requirements: 1.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x]* 2.4 Write property test for SLA calculation (Property 3)
    - **Property 3: SLA Due Date Calculation**
    - For any priority and creation timestamp, verify due date equals creation + SLA duration
    - Verify due date is always strictly later than creation date
    - **Validates: Requirements 1.5, 9.1, 9.2, 9.3, 9.4, 9.5**

- [x] 3. Implement status transition logic
  - [x] 3.1 Implement status transition state machine
    - Create `src/utils/status-transitions.ts` with `validateStatusTransition(from: TicketStatus, to: TicketStatus): boolean`
    - Implement `getAllowedTransitions(from: TicketStatus): TicketStatus[]`
    - Define transition map: NEW→[IN_PROGRESS, CLOSED], IN_PROGRESS→[WAITING_FOR_INFO, RESOLVED, CLOSED], WAITING_FOR_INFO→[IN_PROGRESS, CLOSED], RESOLVED→[CLOSED, REOPENED], CLOSED→[REOPENED], REOPENED→[IN_PROGRESS, CLOSED]
    - _Requirements: 2.1, 2.2_

  - [x]* 3.2 Write property test for status transitions (Property 1)
    - **Property 1: Valid Status Transitions**
    - Generate random sequences of status changes and verify each transition is validated correctly
    - Verify all invalid transitions are rejected
    - **Validates: Requirements 2.1, 2.2**

- [x] 4. Implement User Service and permissions
  - [x] 4.1 Implement User Service with RBAC
    - Create `src/services/user-service.ts` implementing `IUserService`
    - Implement `getUser()`, `getUserByRole()`, `authenticateUser()`, `hasPermission()`, `updateUserPreferences()`
    - Implement JWT token generation with 15-minute expiration
    - Implement JWT validation and token refresh logic
    - _Requirements: 8.5, 8.6_

  - [x] 4.2 Implement permission checking middleware
    - Create `src/middleware/auth.ts` with JWT verification middleware
    - Create `src/middleware/permissions.ts` with role-based permission checks
    - Reporter: view/close own tickets, add non-internal comments to own tickets
    - Technician: view all tickets, change status on assigned tickets, add comments (including internal) to assigned tickets
    - Administrator: all operations on all tickets
    - Return `PERMISSION_DENIED` error with required role info on unauthorized access
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x]* 4.3 Write property test for permission enforcement (Property 10)
    - **Property 10: Permission Enforcement**
    - Generate random user-ticket-operation combinations and verify RBAC rules
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Ticket Service
  - [x] 6.1 Implement ticket creation
    - Create `src/services/ticket-service.ts` implementing `ITicketService`
    - Implement `createTicket()`: validate input, verify reporter exists and is active, generate UUID, set status to NEW, calculate due date, persist to DB, trigger notification to admins, return ticket with unique ID
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 6.2 Implement status change logic
    - Implement `changeStatus()`: validate ticket exists, validate transition via state machine, check user permissions, update status, set `resolvedAt` on RESOLVED, clear `resolvedAt` on REOPENED, add history entry, trigger notifications (resolved → notify reporter; other → notify reporter + assignee)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 6.3 Implement ticket assignment
    - Implement `assignTicket()`: validate ticket exists, validate assignee exists with TECHNICIAN/ADMIN role, reject if ticket is CLOSED or RESOLVED, update assignee, set status to IN_PROGRESS, record history with previous/new assignee, notify new assignee, notify previous assignee on reassignment
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x]* 6.4 Write property test for assignment role enforcement (Property 4)
    - **Property 4: Assignment Role Enforcement**
    - Generate random assignment scenarios and verify role/status constraints
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 6.5 Implement comment management
    - Implement `addComment()`: validate ticket exists, validate content (1-2000 chars), check internal comment permissions (only TECHNICIAN/ADMIN), save comment, trigger notifications (public → reporter + assignee; internal → TECHNICIAN/ADMIN associated with ticket)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x]* 6.6 Write property test for internal comment visibility (Property 11)
    - **Property 11: Internal Comment Visibility**
    - Generate random comment scenarios and verify visibility rules
    - **Validates: Requirements 6.3, 6.4**

  - [x] 6.7 Implement ticket history tracking
    - Implement history entry creation on every status change, assignment, escalation, and priority change
    - Each entry: action type, previous value, new value, user (or "SYSTEM" for automated), timestamp
    - Ensure chronological ordering and non-null constraints
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x]* 6.8 Write property test for history audit trail (Property 5)
    - **Property 5: History Audit Trail Integrity**
    - Generate random sequences of ticket modifications and verify history entries
    - **Validates: Requirements 2.4, 3.4, 5.4, 10.1, 10.2, 10.3, 10.4**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Queue Service
  - [x] 8.1 Implement queue filtering and retrieval
    - Create `src/services/queue-service.ts` implementing `IQueueService`
    - Implement `getPendingTickets()`: exclude RESOLVED/CLOSED tickets, apply AND-logic filters (priority, category, assignee), default sort by priority DESC then createdAt ASC
    - Return empty list with total count zero when no matches
    - _Requirements: 4.1, 4.2, 4.8_

  - [x]* 8.2 Write property test for queue filtering (Property 6)
    - **Property 6: Queue Filtering Invariant**
    - Generate random ticket sets and filter criteria, verify all returned tickets match filters and none are RESOLVED/CLOSED
    - **Validates: Requirements 4.1, 4.2**

  - [x] 8.3 Implement queue sorting
    - Implement sorting by priority (CRITICAL > HIGH > MEDIUM > LOW), createdAt, and dueDate
    - Default sort direction: ascending for date fields, descending for priority
    - Support explicit sort direction parameter
    - _Requirements: 4.3, 4.4_

  - [x]* 8.4 Write property test for queue sorting (Property 7)
    - **Property 7: Queue Sorting Correctness**
    - Generate random ticket sets and verify sort order invariants
    - **Validates: Requirements 4.3, 4.4**

  - [x] 8.5 Implement pagination
    - Implement pagination with default page size 20, max 100
    - Return total count, current page, total pages
    - Reject invalid params (page < 1, pageSize < 1, pageSize > 100)
    - _Requirements: 4.5, 4.6_

  - [x]* 8.6 Write property test for pagination (Property 8)
    - **Property 8: Pagination Consistency**
    - Generate random page/pageSize/totalCount combinations and verify pagination math
    - **Validates: Requirements 4.5**

  - [x] 8.7 Implement queue statistics
    - Implement `getQueueStatistics()`: calculate SLA compliance percentage (tickets resolved within due date) and average time to first IN_PROGRESS status change, over last 30 days
    - _Requirements: 4.7_

  - [x] 8.8 Implement ticket escalation
    - Implement `escalateTicket()`: check escalation conditions (SLA breach, 48h inactivity, HIGH/CRITICAL unassigned >1h), increase priority by one level (LOW→MEDIUM→HIGH→CRITICAL), record escalation in history with reason, notify all admins
    - If already CRITICAL: don't increase priority but still record event and notify
    - Skip tickets with RESOLVED or CLOSED status
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x]* 8.9 Write property test for escalation triggers (Property 9)
    - **Property 9: Escalation Trigger Conditions**
    - Generate random ticket states and verify escalation conditions and priority changes
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 9. Implement Notification Service
  - [x] 9.1 Implement notification creation and delivery
    - Create `src/services/notification-service.ts` implementing `INotificationService`
    - Implement notification creation for all event types (TICKET_CREATED, TICKET_ASSIGNED, STATUS_CHANGED, COMMENT_ADDED, TICKET_RESOLVED, TICKET_ESCALATED)
    - Deliver via email and/or dashboard based on user preference flags
    - If both email and dashboard disabled, still persist and deliver via WebSocket if connected
    - _Requirements: 7.1, 7.6, 7.8_

  - [x] 9.2 Implement notification retrieval and read status
    - Implement `getUserNotifications()`: return notifications ordered by createdAt DESC, paginated (default 50, max 100)
    - Implement `markAsRead()`: set read timestamp, reject if notification doesn't exist or belongs to another user
    - _Requirements: 7.2, 7.3, 7.4_

  - [x]* 9.3 Write property test for notification ordering (Property 12)
    - **Property 12: Notification Ordering**
    - Generate random notification sets and verify ordering and read status behavior
    - **Validates: Requirements 7.2, 7.3**

  - [x] 9.4 Implement WebSocket real-time delivery
    - Set up Socket.io server for real-time notification delivery
    - Deliver notifications within 1 second of event persistence
    - Handle user connection/disconnection
    - _Requirements: 7.5_

  - [x] 9.5 Implement email delivery with retry logic
    - Implement email sending via nodemailer
    - Retry up to 3 times with exponential backoff on failure
    - Mark notification with delivery failure status after all retries exhausted
    - Preserve dashboard notification regardless of email failure
    - _Requirements: 7.7_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Wire components and integrate
  - [x] 11.1 Set up database schema and repository layer
    - Create `src/database/schema.sql` with tables: tickets, users, comments, notifications, ticket_history
    - Create `src/database/connection.ts` for PostgreSQL connection pool
    - Create repository classes for each entity with parameterized queries
    - Add indexes on status, priority, assigneeId, createdAt, dueDate
    - _Requirements: 1.1, 4.1_

  - [x] 11.2 Set up Redis cache and job queue
    - Create `src/cache/redis-client.ts` for Redis connection
    - Implement cache layer for queue results and statistics
    - Set up job queue for email delivery and escalation checks
    - _Requirements: 5.1, 7.7_

  - [x] 11.3 Create Express API routes and wire services
    - Create `src/routes/tickets.ts` with CRUD endpoints for tickets
    - Create `src/routes/queue.ts` with queue management endpoints
    - Create `src/routes/notifications.ts` with notification endpoints
    - Create `src/routes/auth.ts` with authentication endpoints
    - Wire all services together with dependency injection
    - Apply auth middleware and permission checks to all routes
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 6.1, 7.1, 8.1, 8.5_

  - [x] 11.4 Set up scheduled escalation job
    - Create `src/jobs/escalation-job.ts` that periodically checks all open tickets for escalation conditions
    - Run every 15 minutes to check SLA breaches, inactivity, and unassigned high-priority tickets
    - _Requirements: 5.1, 5.2, 5.3_

  - [x]* 11.5 Write integration tests for full ticket lifecycle
    - Test: create ticket → assign → add comment → resolve → close
    - Test: create ticket → escalation triggers → priority increase
    - Test: notification delivery for all event types
    - Test: permission enforcement across all roles
    - _Requirements: 1.1, 2.1, 3.1, 5.1, 6.1, 7.1, 8.1_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code examples use TypeScript as selected by the user
- The design uses fast-check for property-based testing and vitest as the test runner

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.3", "3.1", "4.1"] },
    { "id": 3, "tasks": ["2.2", "2.4", "3.2", "4.2"] },
    { "id": 4, "tasks": ["4.3", "6.1", "6.2", "6.3"] },
    { "id": 5, "tasks": ["6.4", "6.5", "6.7"] },
    { "id": 6, "tasks": ["6.6", "6.8", "8.1", "8.3", "8.5"] },
    { "id": 7, "tasks": ["8.2", "8.4", "8.6", "8.7", "8.8"] },
    { "id": 8, "tasks": ["8.9", "9.1", "9.2"] },
    { "id": 9, "tasks": ["9.3", "9.4", "9.5"] },
    { "id": 10, "tasks": ["11.1", "11.2"] },
    { "id": 11, "tasks": ["11.3", "11.4"] },
    { "id": 12, "tasks": ["11.5"] }
  ]
}
```
