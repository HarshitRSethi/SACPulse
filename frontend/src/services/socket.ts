import { io, Socket } from 'socket.io-client';

class SocketService {
  private static instance: SocketService;
  public socket: Socket | null = null;
  private isConnecting: boolean = false;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  public connect(url: string = window.location.origin): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    if (!this.socket && !this.isConnecting) {
      this.isConnecting = true;
      // Connect through Vite proxy or backend directly
      const socketUrl = window.location.port === '5173' ? 'http://localhost:5001' : url;
      this.socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });

      this.socket.on('connect', () => {
        this.isConnecting = false;
        console.log('⚡ Socket.io connected:', this.socket?.id);
      });

      this.socket.on('disconnect', () => {
        console.log('❌ Socket.io disconnected');
      });

      this.socket.on('connect_error', (err) => {
        this.isConnecting = false;
        console.warn('Socket connect error:', err.message);
      });
    }

    return this.socket!;
  }

  public joinStudent(studentId: string): void {
    if (this.socket) {
      this.socket.emit('join:student', studentId);
    }
  }

  public joinGuard(): void {
    if (this.socket) {
      this.socket.emit('join:guard');
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnecting = false;
    }
  }
}

export const socketService = SocketService.getInstance();
