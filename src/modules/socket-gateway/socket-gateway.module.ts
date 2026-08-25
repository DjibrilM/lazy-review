import type http from 'http';
import { Server, Socket } from 'socket.io';
import { MainModule } from '../main.module.js';

import crypto from 'crypto';
import type { AgentConfirmationRequest } from '../ai-agent/tool-types.js';

type PendingConfirmation = {
  socketId: string;
  sessionId: string;
  resolve: (approved: boolean) => void;
};

export default class SocketModule {
  io: Server;
  mainModule: MainModule;
  connections: Map<string, Socket> = new Map();
  private pendingConfirmations: Map<string, PendingConfirmation> = new Map();

  constructor(server: http.Server, mainModule: MainModule) {
    this.mainModule = mainModule;
    this.io = new Server(server, {
      cors: {
        origin: '*',
      },
    });

    this.io.on('connection', (socket) => {
      console.log('a user connected');
      this.connections.set(socket.id, socket);

      socket.on('disconnect', () => {
        console.log('user disconnected');
        this.connections.delete(socket.id);

        // Reject any pending confirmations owned by this socket.
        for (const [id, pending] of this.pendingConfirmations) {
          if (pending.socketId === socket.id) {
            pending.resolve(false);
            this.pendingConfirmations.delete(id);
          }
        }
      });

      socket.on('agent-confirmation-response', (data: { id: string; approved: boolean }) => {
        const pending = this.pendingConfirmations.get(data.id);

        if (!pending) return;

        // Only the socket that initiated the confirmation may respond.
        if (pending.socketId !== socket.id) {
          console.warn('Rejected confirmation response from wrong socket');
          return;
        }

        pending.resolve(data.approved);
        this.pendingConfirmations.delete(data.id);
      });
    });
  }

  /**
   * Request a structured confirmation from a specific socket. The confirmation
   * is bound to the initiating socket so no other connected client can respond.
   */
  requestConfirmation(socketId: string, confirmation: AgentConfirmationRequest): Promise<boolean> {
    const id = crypto.randomUUID();

    return new Promise<boolean>((resolve) => {
      this.pendingConfirmations.set(id, {
        resolve,
        socketId,
        sessionId: confirmation.sessionId,
      });

      this.io.to(socketId).emit('agent-confirmation-request', {
        id,
        ...confirmation,
      });

      // Timeout after 15 minutes (defaults to false / deny)
      setTimeout(() => {
        const pending = this.pendingConfirmations.get(id);

        if (!pending) return;

        pending.resolve(false);
        this.pendingConfirmations.delete(id);
      }, 900000);
    });
  }

  /**
   * Request a tool confirmation from a specific socket and wait for the user's
   * reply. The tool handler uses this to gate mutation actions (e.g. posting a
   * PR comment) behind explicit user approval. Returns true if approved, false
   * if rejected or timed out.
   */
  requestToolConfirmation(
    socketId: string,
    confirmation: AgentConfirmationRequest,
  ): Promise<boolean> {
    return this.requestConfirmation(socketId, confirmation);
  }

  emitProjectCreationLog(log: any) {
    this.io.emit('project_creation_log', log);
  }

  emitModelProgress(progress: any) {
    this.io.emit('model_progress', progress);
  }

  emitIndexingProgress(progress: any) {
    this.io.emit('indexing_progress', progress);
  }

  emitReviewProgress(progress: any) {
    this.io.emit('review_progress', progress);
  }
}
