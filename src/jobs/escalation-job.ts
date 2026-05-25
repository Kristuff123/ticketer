import { IQueueService } from '../services/interfaces/queue-service.interface';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Scheduled job that periodically checks all open tickets for escalation conditions.
 * Checks SLA breaches, inactivity (48h), and unassigned HIGH/CRITICAL tickets (>1h).
 * Requirements: 5.1, 5.2, 5.3
 */
export class EscalationJob {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private queueService: IQueueService;

  constructor(queueService: IQueueService) {
    this.queueService = queueService;
  }

  /**
   * Starts the periodic escalation check.
   * @param intervalMs - Interval between checks in milliseconds (default: 15 minutes)
   */
  start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
    if (this.intervalId !== null) {
      return; // Already running
    }

    this.intervalId = setInterval(() => {
      this.runCheck().catch((err) => {
        console.error('[EscalationJob] Periodic check failed:', err);
      });
    }, intervalMs);

    // Run an initial check immediately
    this.runCheck().catch((err) => {
      console.error('[EscalationJob] Initial check failed:', err);
    });
  }

  /**
   * Stops the periodic escalation check.
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Performs a single escalation check on all open tickets.
   * Retrieves all pending tickets and attempts escalation on each one.
   */
  async runCheck(): Promise<void> {
    try {
      // Fetch all open tickets using a large page size
      const result = await this.queueService.getPendingTickets({ pageSize: 100, page: 1 });
      const totalPages = result.totalPages;

      let escalatedCount = 0;
      let checkedCount = 0;

      // Process first page
      for (const ticket of result.tickets) {
        checkedCount++;
        try {
          const escalationResult = await this.queueService.escalateTicket(ticket.id);
          if (escalationResult.success) {
            escalatedCount++;
          }
        } catch (err) {
          console.error(`[EscalationJob] Error escalating ticket ${ticket.id}:`, err);
        }
      }

      // Process remaining pages if any
      for (let page = 2; page <= totalPages; page++) {
        try {
          const pageResult = await this.queueService.getPendingTickets({ pageSize: 100, page });
          for (const ticket of pageResult.tickets) {
            checkedCount++;
            try {
              const escalationResult = await this.queueService.escalateTicket(ticket.id);
              if (escalationResult.success) {
                escalatedCount++;
              }
            } catch (err) {
              console.error(`[EscalationJob] Error escalating ticket ${ticket.id}:`, err);
            }
          }
        } catch (err) {
          console.error(`[EscalationJob] Error fetching page ${page}:`, err);
        }
      }

      console.log(
        `[EscalationJob] Check complete: ${checkedCount} tickets checked, ${escalatedCount} escalated`
      );
    } catch (err) {
      console.error('[EscalationJob] Failed to fetch tickets for escalation check:', err);
    }
  }
}

/**
 * Factory function that creates and returns an EscalationJob instance.
 * @param queueService - The queue service instance to use for escalation checks
 */
export function createEscalationJob(queueService: IQueueService): EscalationJob {
  return new EscalationJob(queueService);
}
