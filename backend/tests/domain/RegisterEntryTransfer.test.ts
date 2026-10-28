import { describe, it, expect } from 'vitest';
import { RegisterEntry } from '../../src/domain.entities/RegisterEntry.js';
import { Student } from '../../src/domain.entities/User.js';

describe('RegisterEntry Atomic Transfer State Transitions', () => {
  const studentA = new Student('s-1', 'Student A', 'studenta@iiita.ac.in', 'IIT2023001', '9876543210');
  const studentB = new Student('s-2', 'Student B', 'studentb@iiita.ac.in', 'IIT2023002', '9876543211');
  const studentC = new Student('s-3', 'Student C', 'studentc@iiita.ac.in', 'IIT2023003', '9876543212');

  it('should initialize with ISSUED status and null pendingTransferToId', () => {
    const entry = new RegisterEntry(
      'entry-1',
      'batch-101',
      studentA.getId(),
      studentA.getName(),
      studentA.getRollNo(),
      studentA.getMobileNo()!,
      'item-1',
      'TT Racket',
      'Table Tennis',
      new Date('2026-10-28T10:00:00Z'),
      null,
      'ISSUED',
      null
    );

    expect(entry.getStatus()).toBe('ISSUED');
    expect(entry.getPendingTransferToId()).toBeNull();
    expect(entry.getDepartureTime()).toBeNull();
  });

  it('should lock row for transfer setting ISSUED_TRANSFER_PENDING and pendingTransferToId', () => {
    const entry = new RegisterEntry(
      'entry-1',
      'batch-101',
      studentA.getId(),
      studentA.getName(),
      studentA.getRollNo(),
      studentA.getMobileNo()!,
      'item-1',
      'TT Racket',
      'Table Tennis',
      new Date('2026-10-28T10:00:00Z'),
      null,
      'ISSUED',
      null
    );

    studentA.initiateTransfer(entry, studentB);

    expect(entry.getStatus()).toBe('ISSUED_TRANSFER_PENDING');
    expect(entry.getPendingTransferToId()).toBe(studentB.getId());
  });

  it('should reject initiating transfer to self or from non-holder', () => {
    const entry = new RegisterEntry(
      'entry-1',
      'batch-101',
      studentA.getId(),
      studentA.getName(),
      studentA.getRollNo(),
      studentA.getMobileNo()!,
      'item-1',
      'TT Racket',
      'Table Tennis'
    );

    // Self transfer attempt
    expect(() => studentA.initiateTransfer(entry, studentA)).toThrowError(/Cannot transfer an item to yourself/);

    // Non-holder attempt
    expect(() => studentB.initiateTransfer(entry, studentC)).toThrowError(/Only the current holder can initiate/);
  });

  it('should allow holder to cancel transfer reverting to ISSUED and clearing pendingTransferToId', () => {
    const entry = new RegisterEntry(
      'entry-1',
      'batch-101',
      studentA.getId(),
      studentA.getName(),
      studentA.getRollNo(),
      studentA.getMobileNo()!,
      'item-1',
      'TT Racket',
      'Table Tennis'
    );

    studentA.initiateTransfer(entry, studentB);
    expect(entry.getStatus()).toBe('ISSUED_TRANSFER_PENDING');
    expect(entry.getPendingTransferToId()).toBe(studentB.getId());

    studentA.cancelTransfer(entry);
    expect(entry.getStatus()).toBe('ISSUED');
    expect(entry.getPendingTransferToId()).toBeNull();
  });

  it('should perform atomic row split on transfer acceptance: close original and create recipient row', () => {
    const entryA = new RegisterEntry(
      'entry-1',
      'batch-101',
      studentA.getId(),
      studentA.getName(),
      studentA.getRollNo(),
      studentA.getMobileNo()!,
      'item-1',
      'TT Racket',
      'Table Tennis',
      new Date('2026-10-28T10:00:00Z'),
      null,
      'ISSUED',
      null
    );

    studentA.initiateTransfer(entryA, studentB);

    const transferTime = new Date('2026-10-28T10:15:00Z');
    const entryB = studentB.acceptTransfer(entryA, transferTime, 'entry-2');

    // 1. Invariants on Original Holder Row (A)
    expect(entryA.getStatus()).toBe('RETURNED_VIA_TRANSFER');
    expect(entryA.getDepartureTime()).toEqual(transferTime);
    expect(entryA.getPendingTransferToId()).toBeNull();

    // 2. Invariants on Recipient Peer Row (B)
    expect(entryB.getId()).toBe('entry-2');
    expect(entryB.getBatchId()).toBe('batch-101'); // Shared batch ID maintained
    expect(entryB.getStudentId()).toBe(studentB.getId());
    expect(entryB.getStudentName()).toBe('Student B');
    expect(entryB.getRollNo()).toBe('IIT2023002');
    expect(entryB.getMobileNo()).toBe('9876543211');
    expect(entryB.getItemId()).toBe('item-1');
    expect(entryB.getItemName()).toBe('TT Racket');
    expect(entryB.getCategory()).toBe('Table Tennis');
    expect(entryB.getArrivalTime()).toEqual(transferTime);
    expect(entryB.getDepartureTime()).toBeNull();
    expect(entryB.getStatus()).toBe('ISSUED');
    expect(entryB.getPendingTransferToId()).toBeNull();
  });

  it('should reject transfer acceptance when recipient does not match pendingTransferToId', () => {
    const entry = new RegisterEntry(
      'entry-1',
      'batch-101',
      studentA.getId(),
      studentA.getName(),
      studentA.getRollNo(),
      studentA.getMobileNo()!,
      'item-1',
      'TT Racket',
      'Table Tennis'
    );

    studentA.initiateTransfer(entry, studentB); // assigned to Student B

    // Student C attempts to accept
    expect(() => studentC.acceptTransfer(entry)).toThrowError(/Transfer recipient mismatch/);
  });

  it('should reject transfer acceptance if recipient is on cooldown or defaulter', () => {
    const penalizedStudent = new Student(
      's-penalized',
      'Penalized Student',
      'penalized@iiita.ac.in',
      'IIT2023999',
      '9876543299',
      false,
      new Date('2026-10-28T18:00:00Z') // active cooldown
    );

    const entry = new RegisterEntry(
      'entry-1',
      'batch-101',
      studentA.getId(),
      studentA.getName(),
      studentA.getRollNo(),
      studentA.getMobileNo()!,
      'item-1',
      'TT Racket',
      'Table Tennis'
    );

    // Initiating transfer to penalized student should be blocked immediately
    expect(() => studentA.initiateTransfer(entry, penalizedStudent, new Date('2026-10-28T12:00:00Z'))).toThrowError(
      /Recipient is not eligible/
    );
  });
});
