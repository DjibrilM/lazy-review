import type http from 'http';
import { Server, Socket } from 'socket.io';
import { MainModule } from '../main.module.js';

export default class SocketModule {
  io: Server;
  mainModule: MainModule;
  connections: Map<string, Socket> = new Map();

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
    });
  }

  emitProjectCreationLog(log: any) {
    this.io.emit('project_creation_log', log);
  }

  emitModelProgress(progress: any) {
    this.io.emit('model_progress', progress);
  }
}
