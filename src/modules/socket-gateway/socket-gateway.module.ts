import type http from 'http';
import { Server, Socket } from 'socket.io';
import { MainModule } from '../main.module.js';

import crypto from 'crypto';

export default class SocketModule {
  io: Server;
  mainModule: MainModule;
  connections: Map<string, Socket> = new Map();
  private pendingConfirmations: Map<string, (approved: boolean) => void> = new Map();

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
      });

      socket.on('agent-confirmation-response', (data: { id: string; approved: boolean }) => {
        const resolve = this.pendingConfirmations.get(data.id);
        if (resolve) {
          resolve(data.approved);
          this.pendingConfirmations.delete(data.id);
        }
      });
    });
  }

  requestConfirmation(question: string): Promise<boolean> {
    const id = crypto.randomUUID();
    return new Promise<boolean>((resolve) => {
      this.pendingConfirmations.set(id, resolve);
      this.io.emit('agent-confirmation-request', { id, question });

      // Timeout after 15 minutes (defaults to false / deny)
      setTimeout(() => {
        const resolvePending = this.pendingConfirmations.get(id);
        if (resolvePending) {
          resolvePending(false);
          this.pendingConfirmations.delete(id);
        }
      }, 900000);
    });
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
