import type { IssueRequest } from '../../domain/entities/IssueRequest.js';
import type { SACItem } from '../../domain/entities/SACItem.js';

export type EventCallback = (payload: any) => void;

export interface StudentNotificationPayload {
  studentId: string;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * RealtimeEventHub
 *
 * Implements the GoF Observer + Singleton Pattern to decouple domain & application
 * state mutations from WebSocket transport (`Socket.io`).
 */
export class RealtimeEventHub {
  private static instance: RealtimeEventHub | null = null;
  private readonly listeners: Map<string, Set<EventCallback>> = new Map();

  private constructor() {}

  public static getInstance(): RealtimeEventHub {
    if (!RealtimeEventHub.instance) {
      RealtimeEventHub.instance = new RealtimeEventHub();
    }
    return RealtimeEventHub.instance;
  }

  public static resetInstance(): void {
    RealtimeEventHub.instance = null;
  }

  public subscribe(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  public emit(event: string, payload: unknown): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;

    for (const listener of eventListeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`Error executing listener for event '${event}':`, err);
      }
    }
  }

  /**
   * Uses polymorphic `item.toRealtimePayload()` — zero `instanceof` branching.
   */
  public broadcastInventoryUpdate(item: SACItem): void {
    const payload = item.toRealtimePayload();
    this.emit('INVENTORY_UPDATED', payload);
    this.emit('inventory:updated', payload);
  }

  public notifyGuardQueue(
    request: IssueRequest,
    student?: { name: string; rollNo?: string | null; mobileNo?: string | null }
  ): void {
    const requestedItems = request.getRequestedItems();
    this.emit('GUARD_QUEUE_UPDATED', {
      requestId: request.getId(),
      studentId: request.getStudentId(),
      studentName: student?.name || 'Student',
      rollNo: student?.rollNo || null,
      mobileNo: student?.mobileNo || null,
      items: requestedItems,
      requestedItems,
      status: request.getStatus(),
      createdAt: request.getCreatedAt().toISOString(),
      expiresAt: request.getExpiresAt().toISOString()
    });
  }

  /**
   * Emits both targeted per-student channel (`STUDENT_NOTIFICATION:${studentId}`)
   * and unified `STUDENT_NOTIFICATION` event bridged by `server.ts` into Socket.io room `student:${studentId}`.
   */
  public notifyStudent(studentId: string, event: string, data: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const payload: StudentNotificationPayload = {
      studentId,
      event,
      data,
      timestamp
    };
    this.emit('STUDENT_NOTIFICATION', payload);
    this.emit(`STUDENT_NOTIFICATION:${studentId}`, { event, data, timestamp });
  }

  public notifyTransferState(
    entryId: string,
    fromStudentId: string,
    toStudentId: string | null,
    status: string
  ): void {
    this.emit('TRANSFER_STATE_CHANGED', {
      entryId,
      fromStudentId,
      toStudentId,
      status,
      timestamp: new Date().toISOString()
    });
  }
}

