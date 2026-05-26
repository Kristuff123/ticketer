import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { NotificationService } from '../services/notification-service.js';

export function createNotificationRoutes(notificationService: NotificationService): Router {
  const router = Router();

  // GET /notifications — get user notifications
  router.get(
    '/',
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const user = req.user!;
      const { page, pageSize } = req.query;

      const pageNum = page ? parseInt(page as string, 10) : undefined;
      const pageSizeNum = pageSize ? parseInt(pageSize as string, 10) : undefined;

      const result = notificationService.getUserNotificationsList(
        user.userId,
        pageNum,
        pageSizeNum
      );

      res.status(200).json(result);
    }
  );

  // PUT /notifications/:notificationId/read — mark as read
  router.put(
    '/:notificationId/read',
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const user = req.user!;
      const notificationId = req.params.notificationId as string;

      const result = await notificationService.markAsRead(notificationId, user.userId);

      if (!result.success) {
        res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND', message: result.error });
        return;
      }

      res.status(200).json(result.notification);
    }
  );

  return router;
}
