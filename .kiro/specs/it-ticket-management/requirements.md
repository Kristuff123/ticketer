# Requirements Document

## Introduction

System zarządzania zgłoszeniami IT umożliwia pracownikom zgłaszanie problemów technicznych oraz zapewnia administratorom IT rozbudowany dashboard do zarządzania kolejką zgłoszeń. System obsługuje pełny cykl życia zgłoszenia: tworzenie, przypisanie, priorytetyzację, eskalację, rozwiązanie i zamknięcie. Automatyczne powiadomienia informują użytkowników o zmianach statusu.

## Glossary

- **Ticket_Service**: Komponent zarządzający cyklem życia zgłoszeń (tworzenie, aktualizacja, przypisywanie, zamykanie)
- **Queue_Service**: Komponent zarządzający kolejką zgłoszeń, sortowaniem, filtrowaniem i priorytetyzacją
- **Notification_Service**: Komponent wysyłający powiadomienia do użytkowników o zmianach w zgłoszeniach
- **User_Service**: Komponent zarządzający użytkownikami, rolami i uprawnieniami
- **Reporter**: Użytkownik zgłaszający problem techniczny (rola REPORTER)
- **Technician**: Technik IT obsługujący przypisane zgłoszenia (rola TECHNICIAN)
- **Administrator**: Administrator IT z pełnym dostępem do dashboardu i kolejki (rola ADMIN)
- **Ticket**: Zgłoszenie problemu technicznego zawierające tytuł, opis, kategorię, priorytet i status
- **SLA**: Service Level Agreement - umowa o poziomie usług definiująca maksymalny czas realizacji zgłoszenia

## Requirements

### Requirement 1: Tworzenie zgłoszenia

**User Story:** As a Reporter, I want to create a new IT ticket, so that I can report a technical problem and get it resolved.

#### Acceptance Criteria

1. WHEN a Reporter submits a ticket with a valid title, description, category, and priority, THEN THE Ticket_Service SHALL create a new ticket with status NEW, record the Reporter as the ticket owner, set the creation timestamp, and return a unique ticket identifier
2. WHEN a Reporter submits a ticket with an empty title or a title exceeding 200 characters, THEN THE Ticket_Service SHALL reject the submission and return a validation error indicating the title must be between 1 and 200 characters
3. WHEN a Reporter submits a ticket with an empty description or a description exceeding 5000 characters, THEN THE Ticket_Service SHALL reject the submission and return a validation error indicating the description must be between 1 and 5000 characters
4. WHEN a Reporter submits a ticket with a category not in (HARDWARE, SOFTWARE, NETWORK, ACCESS, OTHER) or a priority not in (LOW, MEDIUM, HIGH, CRITICAL), THEN THE Ticket_Service SHALL reject the submission and return a validation error indicating the invalid field and its allowed values
5. WHEN a ticket is successfully created, THEN THE Ticket_Service SHALL set the due date based on priority: CRITICAL = 4 hours, HIGH = 8 hours, MEDIUM = 24 hours, LOW = 72 hours from the creation timestamp
6. WHEN a ticket is successfully created, THEN THE Notification_Service SHALL send a notification to all users with the ADMIN role about the new ticket
7. IF a Reporter submits a ticket and the Reporter's user account does not exist or is inactive, THEN THE Ticket_Service SHALL reject the submission and return an error indicating the reporter is invalid

### Requirement 2: Zarządzanie statusem zgłoszenia

**User Story:** As an Administrator or Technician, I want to change the status of a ticket, so that I can track the progress of issue resolution.

#### Acceptance Criteria

1. WHEN a status change is requested, THEN THE Ticket_Service SHALL validate the transition against the allowed state machine transitions: NEW may transition to IN_PROGRESS or CLOSED; IN_PROGRESS may transition to WAITING_FOR_INFO, RESOLVED, or CLOSED; WAITING_FOR_INFO may transition to IN_PROGRESS or CLOSED; RESOLVED may transition to CLOSED or REOPENED; CLOSED may transition to REOPENED; REOPENED may transition to IN_PROGRESS or CLOSED
2. IF an invalid status transition is attempted (e.g., NEW to RESOLVED directly), THEN THE Ticket_Service SHALL reject the change and return the list of allowed transitions from the current status
3. IF a status change is requested for a ticket that does not exist, THEN THE Ticket_Service SHALL reject the request and return an error indicating the ticket was not found
4. WHEN a ticket status changes to RESOLVED, THEN THE Ticket_Service SHALL record the resolution timestamp
5. WHEN a ticket status changes from RESOLVED to REOPENED, THEN THE Ticket_Service SHALL clear the previously recorded resolution timestamp
6. WHEN a ticket status changes, THEN THE Ticket_Service SHALL add a history entry with the previous status, new status, user who made the change, and timestamp
7. WHEN a ticket status changes to RESOLVED, THEN THE Notification_Service SHALL notify the Reporter that the ticket has been resolved
8. WHEN a ticket status changes to any value other than RESOLVED, THEN THE Notification_Service SHALL notify the ticket Reporter and the assigned Technician (if any) about the status change

### Requirement 3: Przypisywanie zgłoszenia

**User Story:** As an Administrator, I want to assign a ticket to a Technician, so that the issue can be worked on by the appropriate person.

#### Acceptance Criteria

1. WHEN an Administrator assigns a ticket with status NEW, WAITING_FOR_INFO, or REOPENED to a user with role TECHNICIAN or ADMIN, THEN THE Ticket_Service SHALL update the ticket assignee and change the status to IN_PROGRESS
2. WHEN an Administrator assigns a ticket that already has status IN_PROGRESS to a different user with role TECHNICIAN or ADMIN, THEN THE Ticket_Service SHALL update the ticket assignee and keep the status as IN_PROGRESS
3. IF an assignment is attempted to a user that does not exist in the system, THEN THE Ticket_Service SHALL reject the assignment and return an error indicating the assignee was not found
4. IF an assignment is attempted to a user without TECHNICIAN or ADMIN role, THEN THE Ticket_Service SHALL reject the assignment and return a permission error
5. IF an assignment is attempted on a ticket with status CLOSED or RESOLVED, THEN THE Ticket_Service SHALL reject the assignment and return an error indicating that tickets in terminal statuses cannot be assigned
6. IF an assignment is attempted on a ticket that does not exist, THEN THE Ticket_Service SHALL return an error indicating the ticket was not found
7. WHEN a ticket is assigned, THEN THE Ticket_Service SHALL record the assignment in the ticket history with the previous assignee, new assignee, the Administrator who performed the action, and a timestamp
8. WHEN a ticket is assigned, THEN THE Notification_Service SHALL notify the assigned Technician about the new assignment
9. WHEN a ticket is reassigned from one Technician to another, THEN THE Notification_Service SHALL notify the previous assignee about the reassignment

### Requirement 4: Kolejka zgłoszeń

**User Story:** As an Administrator, I want to view and manage the ticket queue, so that I can prioritize and distribute work effectively.

#### Acceptance Criteria

1. WHEN an Administrator requests the pending ticket queue without sort parameters, THEN THE Queue_Service SHALL return tickets excluding those with status RESOLVED or CLOSED, ordered by priority descending (CRITICAL, HIGH, MEDIUM, LOW) and then by creation date ascending
2. WHEN filtering by multiple criteria (priority, category, or assignee), THEN THE Queue_Service SHALL return only tickets matching all specified filter criteria combined with AND logic
3. WHEN sorting by priority, THEN THE Queue_Service SHALL order tickets as CRITICAL, HIGH, MEDIUM, LOW (descending severity)
4. WHEN sorting by creation date or due date without an explicit sort direction, THEN THE Queue_Service SHALL default to ascending order; WHEN an explicit sort direction is provided, THE Queue_Service SHALL order tickets according to that direction
5. WHEN pagination parameters are provided, THEN THE Queue_Service SHALL return the requested page of results along with total count, current page number, and total pages, using a default page size of 20 and a maximum page size of 100
6. IF pagination parameters are invalid (page number less than 1 or page size less than 1 or page size exceeding 100), THEN THE Queue_Service SHALL reject the request and return a validation error
7. WHEN an Administrator requests queue statistics, THEN THE Queue_Service SHALL return the percentage of tickets resolved within their SLA due date and the average time from ticket creation to first status change to IN_PROGRESS, calculated over the last 30 days
8. IF no tickets match the specified filter criteria, THEN THE Queue_Service SHALL return an empty list with a total count of zero

### Requirement 5: Eskalacja zgłoszenia

**User Story:** As an Administrator, I want tickets to be escalated automatically when SLA is breached, so that critical issues are not overlooked.

#### Acceptance Criteria

1. WHEN a ticket with status other than RESOLVED or CLOSED has its due date passed, THEN THE Queue_Service SHALL escalate the ticket by increasing its priority by one level (LOW→MEDIUM, MEDIUM→HIGH, HIGH→CRITICAL)
2. WHEN a ticket with status other than RESOLVED or CLOSED has had no activity (status change, comment addition, or assignment change) for 48 hours, THEN THE Queue_Service SHALL escalate the ticket by increasing its priority by one level
3. WHEN a ticket with HIGH or CRITICAL priority has had no assignee for more than 1 hour and has status other than RESOLVED or CLOSED, THEN THE Queue_Service SHALL escalate the ticket by increasing its priority by one level
4. IF a ticket already has CRITICAL priority when an escalation condition is met, THEN THE Queue_Service SHALL not increase the priority but SHALL still record the escalation event in the ticket history and trigger administrator notification
5. WHEN a ticket is escalated, THEN THE Queue_Service SHALL record the escalation reason, previous priority, new priority, and timestamp in the ticket history
6. WHEN a ticket is escalated, THEN THE Notification_Service SHALL notify all Administrators about the escalation including the ticket identifier and the escalation reason

### Requirement 6: Komentarze w zgłoszeniu

**User Story:** As a user, I want to add comments to a ticket, so that I can communicate about the issue and document the resolution process.

#### Acceptance Criteria

1. WHEN a user adds a comment with non-empty content (max 2000 characters) to an existing ticket, THEN THE Ticket_Service SHALL save the comment with author, timestamp, and ticket reference
2. IF a user attempts to add a comment with empty content or content exceeding 2000 characters, THEN THE Ticket_Service SHALL reject the comment and return a validation error
3. IF a user attempts to add a comment to a ticket that does not exist, THEN THE Ticket_Service SHALL reject the request and return an error indicating the ticket was not found
4. WHEN a Technician or Administrator adds a comment marked as internal, THEN THE Ticket_Service SHALL store the comment as visible only to users with TECHNICIAN or ADMIN role
5. IF a Reporter attempts to create an internal comment, THEN THE Ticket_Service SHALL reject the request and return a permission error
6. WHEN a public comment is added to a ticket, THEN THE Notification_Service SHALL notify the ticket Reporter and the assigned Technician (if any) about the new comment
7. WHEN an internal comment is added to a ticket, THEN THE Notification_Service SHALL notify only users with TECHNICIAN or ADMIN role who are associated with the ticket

### Requirement 7: Powiadomienia

**User Story:** As a user, I want to receive notifications about changes to my tickets, so that I stay informed about the progress of my issues.

#### Acceptance Criteria

1. WHEN a notification is created, THEN THE Notification_Service SHALL deliver it via email and dashboard according to the user's preference settings (emailNotifications and dashboardNotifications flags)
2. WHEN a user requests their notifications, THEN THE Notification_Service SHALL return notifications for that user ordered by creation date descending (newest first), paginated with a default page size of 50 and a maximum page size of 100
3. WHEN a user marks a notification as read, THEN THE Notification_Service SHALL update the notification with a read timestamp set to the current time
4. IF a user attempts to mark a non-existent notification as read, or a notification belonging to another user, THEN THE Notification_Service SHALL reject the request and return an error indicating the notification was not found
5. WHILE a user is connected via WebSocket, THE Notification_Service SHALL deliver real-time notifications within 1 second from the moment the triggering event is persisted to the moment the WebSocket message is sent to the client
6. WHILE a user has email notifications disabled in preferences, THE Notification_Service SHALL deliver notifications only via the dashboard
7. IF email delivery fails for a notification, THEN THE Notification_Service SHALL retry delivery up to 3 times with exponential backoff and mark the notification with a delivery failure status after all retries are exhausted, while preserving the dashboard notification
8. IF a user has both email and dashboard notifications disabled in preferences, THEN THE Notification_Service SHALL still persist the notification and deliver it via WebSocket if the user is connected

### Requirement 8: Uprawnienia i kontrola dostępu

**User Story:** As a system administrator, I want role-based access control, so that users can only perform actions appropriate to their role.

#### Acceptance Criteria

1. THE User_Service SHALL enforce that a Reporter can only view and close tickets created by that Reporter, and can add non-internal comments to their own tickets
2. THE User_Service SHALL enforce that a Technician can view all tickets, change the status of only tickets assigned to them, and add comments (including internal) to tickets assigned to them
3. THE User_Service SHALL enforce that an Administrator can perform all operations on all tickets
4. IF a user without sufficient permissions attempts a restricted operation, THEN THE User_Service SHALL reject the request and return a permission denied error indicating the required role
5. THE User_Service SHALL authenticate users via SSO/LDAP integration with JWT tokens having a 15-minute expiration
6. IF a request is made with an expired or invalid JWT token, THEN THE User_Service SHALL reject the request and return an authentication error requiring re-authentication

### Requirement 9: Obliczanie terminu SLA

**User Story:** As an Administrator, I want SLA deadlines calculated automatically, so that I can track compliance and prioritize urgent tickets.

#### Acceptance Criteria

1. WHEN a ticket is created with CRITICAL priority, THEN THE Ticket_Service SHALL set the due date to 4 calendar hours (24/7) from creation time
2. WHEN a ticket is created with HIGH priority, THEN THE Ticket_Service SHALL set the due date to 8 calendar hours (24/7) from creation time
3. WHEN a ticket is created with MEDIUM priority, THEN THE Ticket_Service SHALL set the due date to 24 calendar hours (24/7) from creation time
4. WHEN a ticket is created with LOW priority, THEN THE Ticket_Service SHALL set the due date to 72 calendar hours (24/7) from creation time
5. THE Ticket_Service SHALL ensure that the due date is always later than the creation date
6. WHEN a ticket's priority is changed (e.g., via escalation), THEN THE Ticket_Service SHALL recalculate the due date based on the new priority using the original creation time

### Requirement 10: Historia zmian zgłoszenia

**User Story:** As an Administrator, I want a complete audit trail of all ticket changes, so that I can review the history of actions taken on any ticket.

#### Acceptance Criteria

1. WHEN a ticket's status, priority, assignee, or escalation level is changed, THEN THE Ticket_Service SHALL create a history entry containing the action type (STATUS_CHANGED, ASSIGNED, ESCALATED, or PRIORITY_CHANGED), the previous value, the new value, the user who made the change, and a timestamp
2. THE Ticket_Service SHALL ensure that all history entries have a non-null timestamp that is not in the future relative to the server clock
3. THE Ticket_Service SHALL ensure that all history entries have a non-null action type and a non-null user reference
4. THE Ticket_Service SHALL maintain history entries in chronological order sorted by timestamp ascending
5. WHEN an Administrator requests the history for an existing ticket, THEN THE Ticket_Service SHALL return all history entries for that ticket in chronological order
6. IF an Administrator requests the history for a non-existent ticket, THEN THE Ticket_Service SHALL return an error indicating the ticket was not found
7. WHEN a change is initiated by an automated process (e.g., escalation), THEN THE Ticket_Service SHALL record the system as the acting user in the history entry

### Requirement 11: Walidacja danych

**User Story:** As a system, I want to validate all input data, so that data integrity is maintained and invalid data is rejected early.

#### Acceptance Criteria

1. THE Ticket_Service SHALL validate that ticket title contains at least 1 non-whitespace character and does not exceed 200 characters in total length
2. THE Ticket_Service SHALL validate that ticket description contains at least 1 non-whitespace character and does not exceed 5000 characters in total length
3. THE Ticket_Service SHALL validate that ticket category is one of: HARDWARE, SOFTWARE, NETWORK, ACCESS, OTHER
4. THE Ticket_Service SHALL validate that ticket priority is one of: LOW, MEDIUM, HIGH, CRITICAL
5. THE User_Service SHALL validate that user email conforms to the pattern local-part@domain where local-part contains at least 1 character and domain contains at least one dot, and that the email is unique in the system using case-insensitive comparison
6. THE Ticket_Service SHALL validate that comment content contains at least 1 non-whitespace character and does not exceed 2000 characters in total length
7. IF any validation rule is violated, THEN THE respective service SHALL reject the request and return a validation error response indicating which field failed validation and the constraint that was violated
