import http from 'node:http';
import { Server, Socket } from 'socket.io';
import { Notification } from '../models/notification';
import { userService } from './user-service';

/**
 * WebSocketService manages Socket.io connections for real-time notification delivery.
 * Delivers notifications within 1 second of event persistence.
 * Requirements: 7.5
 */
export class WebSocketService {
  private io: Server | null = null;
  private connectedUsers: Map<string, Socket> = new Map();

  /**
   * Initialize the Socket.io server attached to an existing HTTP server.
   */
  initialize(server: http.Server): void {
    this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle a new WebSocket connection.
   * Authenticates the user via JWT token provided in the handshake auth object.
   * On success, maps the userId to the socket for targeted notification delivery.
   */
  handleConnection(socket: Socket): void {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      socket.emit('error', { message: 'Authentication required' });
      socket.disconnect(true);
      return;
    }

    const result = userService.validateToken(token);

    if (!result.valid || !result.payload) {
      socket.emit('error', { message: 'Invalid or expired token' });
      socket.disconnect(true);
      return;
    }

    const userId: string = result.payload.userId;

    // Store the connection mapping
    this.connectedUsers.set(userId, socket);

    // Set up disconnect handler
    socket.on('disconnect', () => {
      this.handleDisconnection(socket, userId);
    });

    socket.emit('authenticated', { userId });
  }

  /**
   * Handle user disconnection. Removes the user from the connected users map.
   */
  handleDisconnection(socket: Socket, userId: string): void {
    // Only remove if this socket is still the one mapped for this user
    // (handles the case where a user reconnects before the old socket disconnects)
    const currentSocket = this.connectedUsers.get(userId);
    if (currentSocket === socket) {
      this.connectedUsers.delete(userId);
    }
  }

  /**
   * Send a notification to a connected user via WebSocket.
   * If the user is connected, emits a 'notification' event with the notification data.
   * Target: deliver within 1 second of event persistence.
   */
  sendNotification(userId: string, notification: Notification): void {
    const socket = this.connectedUsers.get(userId);
    if (socket) {
      socket.emit('notification', notification);
    }
  }

  /**
   * Check if a user currently has an active WebSocket connection.
   */
  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * Get the Socket.io server instance (for testing or advanced usage).
   */
  getServer(): Server | null {
    return this.io;
  }

  /**
   * Get the number of currently connected users.
   */
  getConnectedUserCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Disconnect all users and close the server (for cleanup/testing).
   */
  close(): void {
    this.connectedUsers.clear();
    if (this.io) {
      this.io.close();
      this.io = null;
    }
  }
}

// Export a default singleton instance
export const webSocketService = new WebSocketService();
