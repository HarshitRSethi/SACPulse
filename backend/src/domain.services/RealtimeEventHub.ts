import { RoomKey, type SACItem } from '../domain.entities/SACItem.js';
import type { IssueRequest } from '../domain.entities/IssueRequest.js';

export type EventCallback = (payload: any) => void;

/**
 * RealtimeEventHub
 * Implements the Observer & Singleton Pattern to decouple domain events
 * from presentation/transport mechanisms (Socket.io / Server-Sent Events).
 */
export class RealtimeEventHub {
  private static instance: null | RealtimeEventHub = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();

  private constructor() {}

  public static getInstance(): RealtimeEventHub {
    if (!RealtimeEventHub.instance) {
      RealtimeEventHub.instance = new RealtimeEventHub();
    }
    return RealtimeEventHub.instance;
  }

  /**
   * Resets singleton instance (useful for test isolation).
   */
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

  public emit(event: string, payload: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          listener(payload);
        } catch (err) {
          console.error(`Error executing listener for event '${event}':`, err);
        }
      }
    }
  }

  public broadcastInventoryUpdate(item: SACItem): void {
    const payload = {
      itemId: item.getId(),
      name: item.getName(),
      category: item.getCategory(),
      itemType: item.getItemType(),
      totalQty: item.getTotalQty(),
      availableQty: item.getAvailableQty(),
      occupiedSince: item instanceof RoomKey ? item.getOccupiedSince()?.toISOString() || null : null,
      timestamp: new Date().toISOString()
    };
    this.emit('INVENTORY_UPDATED', payload);
    this.emit('inventory:updated', payload);
  }

  public notifyGuardQueue(
    request: IssueRequest,
    student?: { name: string; rollNo?: string | null; mobileNo?: string | null }
  ): void {
    this.emit('GUARD_QUEUE_UPDATED', {
      requestId: request.getId(),
      studentId: request.getStudentId(),
      studentName: student?.name || 'Student',
      rollNo: student?.rollNo || null,
      mobileNo: student?.mobileNo || null,
      items: request.getRequestedItems(),
      requestedItems: request.getRequestedItems(),
      status: request.getStatus(),
      createdAt: request.getCreatedAt().toISOString(),
      expiresAt: request.getExpiresAt().toISOString()
    });
  }

  public notifyStudent(studentId: string, event: string, data: any): void {
    this.emit(`STUDENT_NOTIFICATION:${studentId}`, {
      event,
      data,
      timestamp: new Date().toISOString()
    });
  }

  public notifyTransferState(entryId: string, fromStudentId: string, toStudentId: string | null, status: string): void {
    this.emit('TRANSFER_STATE_CHANGED', {
      entryId,
      fromStudentId,
      toStudentId,
      status,
      timestamp: new Date().toISOString()
    });
  }
}
