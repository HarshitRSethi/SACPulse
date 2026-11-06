import { io, Socket } from 'socket.io-client';
import { authStorage } from './api';

/**
 * Singleton wrapper around the Socket.io client.
 *
 * Authentication contract with the backend:
 * - The client authenticates the handshake with `auth: { token }` (the stored JWT).
 * - The server verifies the JWT and joins rooms itself (STUDENT -> `student:<id>`,
 *   GUARD/ADMIN -> `guard:counter`). Clients no longer emit `join:*` events.
 * - Without a token the connection is anonymous and only receives public events
 *   such as `inventory:updated`.
 *
 * A single `Socket` instance is kept for the lifetime of the page so listeners
 * registered by dashboards survive token changes; when the session changes the
 * socket is disconnected, its `auth` payload is replaced and it reconnects.
 */
class SocketService {
  private static instance: SocketService;
  private client: Socket | null = null;
  private currentToken: string | null = null;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  /** The underlying socket (null until `connect` has been called once). */
  public get socket(): Socket | null {
    return this.client;
  }

  /** Token the socket is currently authenticated with (null = anonymous). */
  public get token(): string | null {
    return this.currentToken;
  }

  private resolveUrl(url?: string): string {
    if (url) return url;
    const configured = (
      (import.meta.env.VITE_SOCKET_URL as string | undefined) ||
      (import.meta.env.VITE_API_URL as string | undefined)
    )?.trim();
    if (configured) {
      return configured.replace(/\/+$/, '').replace(/\/api$/, '');
    }
    return window.location.port === '5173' ? 'http://localhost:5001' : window.location.origin;
  }

  /**
   * Connect (or reconnect) using the given JWT. Defaults to the token persisted
   * by the API service. If the socket is already connected with the same token
   * this is a no-op; if the token differs the socket is disconnected and
   * reconnected so the server re-evaluates the handshake and room membership.
   */
  public connect(token: string | null = authStorage.getToken(), url?: string): Socket {
    const normalizedToken = token || null;

    if (!this.client) {
      this.currentToken = normalizedToken;
      this.client = io(this.resolveUrl(url), {
        auth: normalizedToken ? { token: normalizedToken } : {},
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });
      return this.client;
    }

    if (normalizedToken !== this.currentToken) {
      this.currentToken = normalizedToken;
      this.client.disconnect();
      this.client.auth = normalizedToken ? { token: normalizedToken } : {};
      this.client.connect();
    } else if (!this.client.connected && !this.client.active) {
      this.client.connect();
    }

    return this.client;
  }

  /** Re-authenticate the socket with the current session token. */
  public reconnectWithToken(token: string | null): Socket {
    return this.connect(token);
  }

  public disconnect(): void {
    if (this.client) {
      this.client.disconnect();
    }
  }
}

export const socketService = SocketService.getInstance();
