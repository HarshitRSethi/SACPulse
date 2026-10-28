import { describe, it, expect } from 'vitest';
import { SACItem, SportsEquipment, RoomKey } from '../../src/domain.entities/SACItem.js';

describe('SACItem Polymorphism & Stock Allocation', () => {
  describe('SportsEquipment', () => {
    it('should correctly initialize with available, total, and damaged stock', () => {
      const equipment = new SportsEquipment('item-1', 'TT Racket', 'Table Tennis', 6, 6, 0);
      expect(equipment.getId()).toBe('item-1');
      expect(equipment.getName()).toBe('TT Racket');
      expect(equipment.getCategory()).toBe('Table Tennis');
      expect(equipment.getItemType()).toBe('EQUIPMENT');
      expect(equipment.getTotalQty()).toBe(6);
      expect(equipment.getAvailableQty()).toBe(6);
      expect(equipment.getDamagedQty()).toBe(0);
      expect(equipment.isAvailable()).toBe(true);
    });

    it('should allocate units decrementing availableQty', () => {
      const equipment = new SportsEquipment('item-1', 'TT Racket', 'Table Tennis', 6, 6, 0);
      equipment.allocateUnit(1);
      expect(equipment.getAvailableQty()).toBe(5);

      equipment.allocateUnit(2);
      expect(equipment.getAvailableQty()).toBe(3);
    });

    it('should throw an error when attempting to allocate more units than available stock', () => {
      const equipment = new SportsEquipment('item-1', 'TT Racket', 'Table Tennis', 2, 2, 0);
      expect(() => equipment.allocateUnit(3)).toThrowError(/Insufficient stock/);
    });

    it('should release units incrementing availableQty', () => {
      const equipment = new SportsEquipment('item-1', 'TT Racket', 'Table Tennis', 6, 4, 0);
      equipment.releaseUnit(1);
      expect(equipment.getAvailableQty()).toBe(5);

      equipment.releaseUnit(1);
      expect(equipment.getAvailableQty()).toBe(6);
    });

    it('should throw an error when releasing more units than functional stock (total - damaged)', () => {
      const equipment = new SportsEquipment('item-1', 'TT Racket', 'Table Tennis', 6, 5, 1);
      // Functional stock is 6 - 1 = 5. Currently available is 5.
      expect(() => equipment.releaseUnit(1)).toThrowError(/exceed functional stock/);
    });

    it('should record damage incrementing damagedQty without increasing availableQty', () => {
      const equipment = new SportsEquipment('item-1', 'TT Racket', 'Table Tennis', 6, 3, 0);
      equipment.recordDamage(1);
      expect(equipment.getDamagedQty()).toBe(1);
      expect(equipment.getAvailableQty()).toBe(3);
    });
  });

  describe('RoomKey', () => {
    it('should correctly initialize with single unit and null occupiedSince', () => {
      const roomKey = new RoomKey('room-1', 'Dance Room Key', 'Activity Rooms', 1, 1, null);
      expect(roomKey.getId()).toBe('room-1');
      expect(roomKey.getName()).toBe('Dance Room Key');
      expect(roomKey.getItemType()).toBe('ROOM_KEY');
      expect(roomKey.getTotalQty()).toBe(1);
      expect(roomKey.getAvailableQty()).toBe(1);
      expect(roomKey.getOccupiedSince()).toBeNull();
      expect(roomKey.isAvailable()).toBe(true);
    });

    it('should reject room keys with totalQty !== 1', () => {
      expect(() => new RoomKey('room-2', 'Music Room Key', 'Activity Rooms', 2, 2, null)).toThrowError(
        /totalQty must be 1/
      );
    });

    it('should allocate unit setting availableQty to 0 and occupiedSince to timestamp', () => {
      const roomKey = new RoomKey('room-1', 'Dance Room Key', 'Activity Rooms', 1, 1, null);
      const allocatedAt = new Date('2026-10-28T10:00:00Z');

      roomKey.allocateUnit(1, allocatedAt);
      expect(roomKey.getAvailableQty()).toBe(0);
      expect(roomKey.getOccupiedSince()).toEqual(allocatedAt);
      expect(roomKey.isAvailable()).toBe(false);
    });

    it('should throw error when allocating already occupied room key', () => {
      const allocatedAt = new Date('2026-10-28T10:00:00Z');
      const roomKey = new RoomKey('room-1', 'Dance Room Key', 'Activity Rooms', 1, 0, allocatedAt);

      expect(() => roomKey.allocateUnit(1)).toThrowError(/already occupied/);
    });

    it('should reject allocating more than 1 unit for room key', () => {
      const roomKey = new RoomKey('room-1', 'Dance Room Key', 'Activity Rooms', 1, 1, null);
      expect(() => roomKey.allocateUnit(2)).toThrowError(/only be allocated 1 unit/);
    });

    it('should release unit setting availableQty to 1 and occupiedSince to null', () => {
      const occupiedAt = new Date('2026-10-28T10:00:00Z');
      const roomKey = new RoomKey('room-1', 'Dance Room Key', 'Activity Rooms', 1, 0, occupiedAt);

      roomKey.releaseUnit(1);
      expect(roomKey.getAvailableQty()).toBe(1);
      expect(roomKey.getOccupiedSince()).toBeNull();
      expect(roomKey.isAvailable()).toBe(true);
    });
  });

  describe('Polymorphic SACItem Allocation & Release', () => {
    it('should polymorphically allocate and release units across heterogeneous item list', () => {
      const timestamp = new Date('2026-10-28T14:30:00Z');
      const items: SACItem[] = [
        new SportsEquipment('eq-1', 'Tennis Racket', 'Lawn Tennis', 4, 4, 0),
        new RoomKey('rk-1', 'Music Room Key', 'Activity Rooms', 1, 1, null)
      ];

      // Polymorphic allocateUnit()
      for (const item of items) {
        item.allocateUnit(1, timestamp);
      }

      // Verify polymorphic outcomes
      const equipment = items[0] as SportsEquipment;
      const roomKey = items[1] as RoomKey;

      expect(equipment.getAvailableQty()).toBe(3);
      expect(roomKey.getAvailableQty()).toBe(0);
      expect(roomKey.getOccupiedSince()).toEqual(timestamp);

      // Polymorphic releaseUnit()
      for (const item of items) {
        item.releaseUnit(1);
      }

      expect(equipment.getAvailableQty()).toBe(4);
      expect(roomKey.getAvailableQty()).toBe(1);
      expect(roomKey.getOccupiedSince()).toBeNull();
    });
  });
});
