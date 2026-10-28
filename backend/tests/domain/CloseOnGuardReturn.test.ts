import { describe, it, expect } from 'vitest';
import { RegisterEntry } from '../../src/domain.entities/RegisterEntry.js';
import { Student, Guard, Admin } from '../../src/domain.entities/User.js';
import { SportsEquipment, RoomKey } from '../../src/domain.entities/SACItem.js';

describe('closeOnGuardReturn: Wiping pendingTransferToId & Defaulter Enforcement', () => {
  const studentA = new Student('s-1', 'Student A', 'studenta@iiita.ac.in', 'IIT2023001', '9876543210');
  const studentB = new Student('s-2', 'Student B', 'studentb@iiita.ac.in', 'IIT2023002', '9876543211');
  const guard = new Guard('g-1', 'SAC Guard Ramesh', 'guard@iiita.ac.in', 'COUNTER_1');
  const admin = new Admin('a-1', 'SAC Admin Dr. Sharma', 'admin@iiita.ac.in');

  it('should wipe pendingTransferToId when guard returns item intact during pending transfer (Rule 9)', () => {
    const equipment = new SportsEquipment('item-1', 'Tennis Racket', 'Lawn Tennis', 4, 3, 0);
    const entry = new RegisterEntry(
      'entry-1',
      'batch-201',
      studentA.getId(),
      studentA.getName(),
      studentA.getRollNo(),
      studentA.getMobileNo()!,
      equipment.getId(),
      equipment.getName(),
      equipment.getCategory()
    );

    // Student A initiates transfer to Student B
    studentA.initiateTransfer(entry, studentB);
    expect(entry.getStatus()).toBe('ISSUED_TRANSFER_PENDING');
    expect(entry.getPendingTransferToId()).toBe(studentB.getId());

    // Before Student B accepts, Student A walks up to the Guard counter and hands the racket back
    const returnTime = new Date('2026-10-28T11:00:00Z');
    guard.markUnitReturned(entry, equipment, returnTime);

    // Rule 9 Invariants
    expect(entry.getStatus()).toBe('RETURNED');
    expect(entry.getPendingTransferToId()).toBeNull(); // WIPED!
    expect(entry.getDepartureTime()).toEqual(returnTime);
    expect(equipment.getAvailableQty()).toBe(4); // Incremented back

    // If Student B attempts to accept now, it is rejected immediately
    expect(() => studentB.acceptTransfer(entry)).toThrowError(/Transfer acceptance failed.*RETURNED/);
  });

  it('should wipe pendingTransferToId, mark status DAMAGED, and set isDefaulter on holder when returned damaged (Rule 7 & 9)', () => {
    const equipment = new SportsEquipment('item-1', 'TT Racket', 'Table Tennis', 6, 5, 0);
    const entry = new RegisterEntry(
      'entry-2',
      'batch-202',
      studentA.getId(),
      studentA.getName(),
      studentA.getRollNo(),
      studentA.getMobileNo()!,
      equipment.getId(),
      equipment.getName(),
      equipment.getCategory()
    );

    // Initiate transfer to Student B
    studentA.initiateTransfer(entry, studentB);
    expect(entry.getPendingTransferToId()).toBe(studentB.getId());

    // Student A returns item damaged
    const damagedTime = new Date('2026-10-28T11:30:00Z');
    guard.markUnitDamaged(entry, equipment, studentA, damagedTime);

    // Invariants:
    expect(entry.getStatus()).toBe('DAMAGED');
    expect(entry.getPendingTransferToId()).toBeNull(); // WIPED!
    expect(entry.getDepartureTime()).toEqual(damagedTime);

    // Equipment damaged qty incremented, available stock stays unchanged
    expect(equipment.getDamagedQty()).toBe(1);
    expect(equipment.getAvailableQty()).toBe(5);

    // Student A is locked as Defaulter
    expect(studentA.getIsDefaulter()).toBe(true);
    expect(studentA.canBorrowOrReceive().eligible).toBe(false);

    // Defaulter can be cleared only by Admin
    admin.clearDefaulter(studentA);
    expect(studentA.getIsDefaulter()).toBe(false);
    expect(studentA.canBorrowOrReceive().eligible).toBe(true);
  });

  it('should correctly release RoomKey on guard return and wipe pendingTransferToId if any', () => {
    const occupiedTime = new Date('2026-10-28T09:00:00Z');
    const roomKey = new RoomKey('rk-1', 'Dance Room Key', 'Activity Rooms', 1, 0, occupiedTime);
    const entry = new RegisterEntry(
      'entry-3',
      'batch-203',
      studentA.getId(),
      studentA.getName(),
      studentA.getRollNo(),
      studentA.getMobileNo()!,
      roomKey.getId(),
      roomKey.getName(),
      roomKey.getCategory()
    );

    studentA.initiateTransfer(entry, studentB);
    expect(entry.getPendingTransferToId()).toBe(studentB.getId());

    const returnTime = new Date('2026-10-28T10:00:00Z');
    guard.markUnitReturned(entry, roomKey, returnTime);

    expect(entry.getStatus()).toBe('RETURNED');
    expect(entry.getPendingTransferToId()).toBeNull();
    expect(roomKey.getAvailableQty()).toBe(1);
    expect(roomKey.getOccupiedSince()).toBeNull();
  });
});
