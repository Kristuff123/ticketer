import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { TicketService } from '../services/ticket-service.js';
import { TicketStatus } from '../models/enums.js';

export function createTicketRoutes(ticketService: TicketService): Router {
  const router = Router();

  // GET /tickets — list current user's tickets (or all for admin/tech)
  router.get(
    '/',
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const user = req.user!;
      const result = await ticketService.getTicketsByUser(user.userId);
      res.status(200).json(result);
    }
  );

  // POST /tickets — create ticket
  router.post(
    '/',
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const user = req.user!;
      const { title, description, category, priority, location } = req.body;

      const result = await ticketService.createTicket({
        title,
        description,
        category,
        priority,
        location,
        reporterId: user.userId,
      });

      if (!result.success) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: result.error });
        return;
      }

      res.status(201).json(result.ticket);
    }
  );

  // GET /tickets/:ticketId — get ticket
  router.get(
    '/:ticketId',
    requirePermission('view'),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const ticketId = req.params.ticketId as string;

      const result = await ticketService.getTicket(ticketId);

      if (!result.success) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND', message: result.error });
        return;
      }

      res.status(200).json(result.ticket);
    }
  );

  // PUT /tickets/:ticketId/status — change status
  router.put(
    '/:ticketId/status',
    requirePermission('change_status'),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const user = req.user!;
      const ticketId = req.params.ticketId as string;
      const { status } = req.body;

      if (!status || !Object.values(TicketStatus).includes(status)) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid status value' });
        return;
      }

      const result = await ticketService.changeStatus(ticketId, status as TicketStatus, user.userId);

      if (!result.success) {
        res.status(400).json({ error: 'INVALID_STATUS_TRANSITION', message: result.error });
        return;
      }

      res.status(200).json(result.ticket);
    }
  );

  // PUT /tickets/:ticketId/assign — assign ticket
  router.put(
    '/:ticketId/assign',
    requirePermission('assign'),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const user = req.user!;
      const ticketId = req.params.ticketId as string;
      const { assigneeId } = req.body;

      if (!assigneeId) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'assigneeId is required' });
        return;
      }

      const result = await ticketService.assignTicket(ticketId, assigneeId, user.userId);

      if (!result.success) {
        res.status(400).json({ error: 'ASSIGNMENT_ERROR', message: result.error });
        return;
      }

      res.status(200).json(result.ticket);
    }
  );

  // POST /tickets/:ticketId/comments — add comment
  router.post(
    '/:ticketId/comments',
    requirePermission('add_comment'),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const user = req.user!;
      const ticketId = req.params.ticketId as string;
      const { content, isInternal } = req.body;

      const result = await ticketService.addComment(
        ticketId,
        { ticketId, authorId: user.userId, content, isInternal: isInternal ?? false },
        user.userId
      );

      if (!result.success) {
        res.status(400).json({ error: 'COMMENT_ERROR', message: result.error });
        return;
      }

      res.status(201).json(result.comment);
    }
  );

  // GET /tickets/:ticketId/history — get history
  router.get(
    '/:ticketId/history',
    requirePermission('view'),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const ticketId = req.params.ticketId as string;

      // Verify ticket exists first
      const ticketResult = await ticketService.getTicket(ticketId);
      if (!ticketResult.success) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND', message: ticketResult.error });
        return;
      }

      const history = await ticketService.getTicketHistory(ticketId);
      res.status(200).json(history);
    }
  );

  return router;
}
