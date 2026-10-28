# SACPulse: Master OOP & SE Architecture Rules

## 1. Stack & Architecture Mandate
* **App:** SACPulse (College SAC Room & Equipment Digital Register + Live Status)
* **Mandate:** Strict Object-Oriented Programming (OOP) & Software Engineering (SE) layered architecture (`presentation`, `controllers`, `domain.services`, `domain.entities`, `infrastructure.persistence`). Use TypeScript classes, inheritance, polymorphism, and GoF patterns (Template Method, State, Strategy, Observer).
* **Backend:** TypeScript (Node.js + Express / NestJS) with class-based domain models, TypeORM/Prisma/pg, and Socket.io
* **Frontend:** React + Tailwind CSS + Lucide Icons + Socket.io-client
* **Database & Real-Time:** Serverless PostgreSQL (Supabase) with `SELECT ... FOR UPDATE` row locking + WebSockets (`Socket.io`)
* **Auth:** College Google OAuth 2.0 (`@iiita.ac.in`) + JWT Roles (`STUDENT`, `GUARD`, `ADMIN`)

## 2. Ten Core Domain Rules & State Invariants
1. **Google OAuth & 1-Time Mobile Setup:** Students log in via college Google account (Name & Roll No auto-extracted). On first login (`mobile_no IS NULL`), prompt once for 10-digit mobile number. Route by `role` (`STUDENT`, `GUARD`, `ADMIN`).
2. **Live Campus Status (Privacy-Safe):** All logged-in students (even Defaulters or on 5h cooldown) can view/search live stock (`available_qty / total_qty`) and room status. Occupied rooms (`ROOM_KEY`) show **`Occupied since [Time]`** only—never expose holder Name/Phone to other students.
3. **Bundle Issue, 2-Step Confirm & No Manual Cancel:** Students select 1+ items/quantities and tap **Issue**. A 2-step confirmation modal warns that requests expire in 2m and cannot be canceled. Once sent, **manual cancel is disabled** (prevents canceling at 1:55 to reset timer).
4. **Authoritative 2-Min Server TTL & Race Condition:** `expires_at = created_at + 120s` runs on the server clock. Stock is **not** locked during the 2m window: multiple students can request the last unit simultaneously; the guard approves whoever reaches the SAC counter first. Unfulfilled requests expire normally.
5. **Sliding 1-Hr Strike Rule (>3 Timeouts -> 5h Cooldown):** When an `IssueRequest` becomes `TIMED_OUT`, count that student's `TIMED_OUT` rows where `created_at >= NOW() - INTERVAL '1 hour'`. If `count > 3` (4th strike in 1h), set `users.penalty_until = NOW() + INTERVAL '5 hours'`. While `NOW() < penalty_until`, block issuing and accepting transfers.
6. **1-Row-Per-Unit Digital Register (`batch_id`):** Approving a bundle (e.g., `2x TT Racket + 1x TT Ball`) inserts **1 row per physical unit** (3 rows) in `register_logs` sharing one `batch_id`. Guard UI groups by `batch_id` with **Return All (Intact)** plus per-unit **Returned** and **Damaged** buttons.
7. **Guard-Only Return & Damaged Defaulter Lock:** Students have no return button; only the Guard processes returns.
   * **Returned (Intact):** `status='RETURNED'`, `departure_time=NOW()`, `pending_transfer_to_id=NULL`, `available_qty += 1` (or `occupied_since=NULL` for `ROOM_KEY`).
   * **Damaged:** `status='DAMAGED'`, `departure_time=NOW()`, `pending_transfer_to_id=NULL`, `damaged_qty += 1` (`available_qty` unchanged), and `users.is_defaulter=TRUE` on holder. Defaulters cannot issue or receive transfers until Admin clicks **Clear Defaulter**.
8. **Peer-to-Peer Transfer & Atomic Row Split:** Holder `A` (`status='ISSUED'`) can tap **Initiate Transfer** and select Student `B` (by Roll No/Name). Verify `B` is eligible (`!B.is_defaulter && (B.penalty_until == null || B.penalty_until <= NOW())`). Set `A`'s row to `status='ISSUED_TRANSFER_PENDING'`, `pending_transfer_to_id=B.id`. No 5m timer; `A` can tap **Cancel Transfer** (`status='ISSUED'`, `pending_transfer_to_id=NULL`).
   * When `B` taps **Accept Transfer**, run an **atomic DB transaction**:
     1. Lock `A`'s row `FOR UPDATE`, verify `status == 'ISSUED_TRANSFER_PENDING'` & `pending_transfer_to_id == B.id` & `B` eligible.
     2. Close `A`'s row: `status='RETURNED_VIA_TRANSFER'`, `departure_time=NOW()`, `pending_transfer_to_id=NULL`.
     3. Insert new `register_logs` row for `B` (`student_id=B.id`, `student_name=B.name`, `roll_no=B.roll_no`, `mobile_no=B.mobile_no`, `arrival_time=NOW()`, `status='ISSUED'`).
     4. Broadcast via WebSockets so Guard UI immediately swaps holder Name, Roll No & Phone to `B`.
9. **State-Linked Transfer Kill on Guard Return:** If `A` initiates a transfer to `B` and then returns the item to the Guard before `B` accepts, Guard clicking **Returned** or **Damaged** sets `pending_transfer_to_id=NULL` and `status='RETURNED'|'DAMAGED'`, removing `B`'s prompt and rejecting any late accept click with `409 Conflict`.
10. **Guard Contact Visibility:** Guard UI always shows active holder Name, Roll No, and clickable Mobile No (`tel:`). No automated 10 PM cutoff.

## 3. PostgreSQL Schema (4 Tables)
```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(120) UNIQUE NOT NULL,
  roll_no VARCHAR(30) UNIQUE,
  name VARCHAR(100) NOT NULL,
  mobile_no VARCHAR(15),
  role VARCHAR(16) NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT','GUARD','ADMIN')),
  is_defaulter BOOLEAN NOT NULL DEFAULT FALSE,
  penalty_until TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sac_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(60) NOT NULL,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('EQUIPMENT','ROOM_KEY')),
  total_qty INTEGER NOT NULL CHECK (total_qty >= 0),
  available_qty INTEGER NOT NULL CHECK (available_qty >= 0),
  damaged_qty INTEGER NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
  occupied_since TIMESTAMPTZ NULL
);

CREATE TABLE issue_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_items JSONB NOT NULL, -- [{"item_id":"uuid","name":"TT Racket","qty":2}]
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','TIMED_OUT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL, -- created_at + INTERVAL '2 minutes'
  approved_by_id UUID NULL REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_req_strikes ON issue_requests (student_id, status, created_at);

CREATE TABLE register_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  student_id UUID NOT NULL REFERENCES users(id),
  student_name VARCHAR(100) NOT NULL,
  roll_no VARCHAR(30) NOT NULL,
  mobile_no VARCHAR(15) NOT NULL,
  item_id UUID NOT NULL REFERENCES sac_items(id),
  item_name VARCHAR(100) NOT NULL,
  category VARCHAR(60) NOT NULL,
  arrival_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  departure_time TIMESTAMPTZ NULL,
  status VARCHAR(28) NOT NULL DEFAULT 'ISSUED' CHECK (
    status IN ('ISSUED','ISSUED_TRANSFER_PENDING','RETURNED','RETURNED_VIA_TRANSFER','DAMAGED')
  ),
  pending_transfer_to_id UUID NULL REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_reg_active ON register_logs (status, batch_id);
CREATE INDEX idx_reg_transfer ON register_logs (pending_transfer_to_id, status);
```

## 4. OOP Class Hierarchy & Design Patterns
* **`abstract class User`** (`id, name, email, role`; abstract `getDashboardRoute()`):
  * **`Student extends User`** (`rollNo, mobileNo, isDefaulter, penaltyUntil`; methods: `canBorrowOrReceive(now)`, `createIssueRequest(items)`, `initiateTransfer(entry, peer)`, `cancelTransfer(entry)`, `acceptTransfer(entry)`).
  * **`Guard extends User`** (`deskId`; methods: `approveRequest(req)`, `markUnitReturned(entry)`, `markBatchReturned(batchId)`, `markUnitDamaged(entry)`).
  * **`Admin extends User`** (methods: `clearDefaulter(student)`, `resetCooldown(student)`, `upsertSACItem(item)`, `updateUserRole(user, role)`).
* **`abstract class SACItem`** (Template Method Pattern: `id, name, category, totalQty, availableQty`; abstract `allocateUnit(qty)`, `releaseUnit(qty)`):
  * **`SportsEquipment extends SACItem`** (`damagedQty`; `allocateUnit` decrements `availableQty`; `releaseUnit` increments `availableQty`; `recordDamage` increments `damagedQty`).
  * **`RoomKey extends SACItem`** (`occupiedSince`; `allocateUnit` sets `availableQty=0, occupiedSince=NOW()`; `releaseUnit` sets `availableQty=1, occupiedSince=NULL`).
* **`IssueRequest`** (`id, studentId, requestedItems, status, createdAt, expiresAt`; `isExpired(now)`, `markApproved()`, `markTimedOut()`).
* **`RegisterEntry`** (State Pattern: `id, batchId, studentId, itemId, arrivalTime, departureTime, status, pendingTransferToId`; `lockForTransfer(peerId)`, `cancelTransfer()`, `completeAtomicTransfer(peer)`, `closeOnGuardReturn(isDamaged)` which always sets `pendingTransferToId=null`).
* **`PenaltyAndEligibilityPolicy`** (Strategy Pattern: `REQUEST_TTL_SEC=120, MAX_STRIKES_1HR=3, COOLDOWN_HRS=5`; `assertEligible(student, now)`, `evaluateTimeoutPenalty(student, strikesLast1Hr, now)`).
* **`RealtimeEventHub`** (Observer/Singleton: `broadcastInventoryUpdate()`, `notifyGuardQueue()`, `notifyStudent()`).

## 5. REST API & UI Dashboards
* **Auth & Inventory:** `POST /api/auth/google`, `PATCH /api/auth/onboarding-mobile`, `GET /api/inventory`
* **Student Issue & Transfer:** `POST /api/issue-requests`, `POST /api/transfers/:entryId/initiate`, `POST /api/transfers/:entryId/cancel`, `POST /api/transfers/:entryId/respond`
* **Guard Counter:** `POST /api/guard/requests/:id/approve`, `POST /api/guard/returns/:entryId/intact`, `POST /api/guard/returns/batch/:batchId/intact`, `POST /api/guard/returns/:entryId/damaged`
* **Admin Console:** `GET /api/admin/register-logs` (with CSV export), `POST /api/admin/users/:id/clear-defaulter`, `POST /api/admin/users/:id/reset-cooldown`, `POST /api/admin/inventory`
* **UI Views:**
  1. **Student UI:** Red Defaulter / Orange Cooldown / Blue Incoming Transfer banners; live 2:00 progress bar (no cancel); held items with `Initiate/Cancel Transfer`; live room (`Occupied since [Time]`) & equipment cards + 2-Step Confirm modal.
  2. **Guard UI:** Live 2:00 Incoming Queue (`Accept Request`) + Searchable Active Register grouped by `batch_id` (Name, Roll No, clickable `tel:` Mobile, `Return All`, per-unit `Returned` & `Damaged`).
  3. **Admin UI:** Master Register table + CSV export, Defaulter/Cooldown unblocker, Inventory & Role manager.