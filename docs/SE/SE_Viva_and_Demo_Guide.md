# SACPulse — Software Engineering (SE) Viva & Live Demo Guide

This guide prepares all **3 group members** specifically for the **Software Engineering (SE)** presentation and viva voce evaluation.

---

## 1. Three-Member SE Lifecycle & Subsystem Split

| Member | SE SDLC & Subsystem Ownership | Report Sections & Diagrams Owned | Code & Test Files Owned |
| :--- | :--- | :--- | :--- |
| **Member 1** | **System Architecture, Counter Workflows & Structural UML Modelling** | Sec 1 (Problem & Scope), Sec 4.2/4.4 (UML Class & State), Sec 5 (5-Layer Architecture & ADRs) | `GuardCounterService.ts`, `CheckoutBatch.ts`, `SACItem.ts`, `frontend/src/components/guard/*`, `facultyRoomOverride.test.ts` |
| **Member 2** | **Requirement Analysis, 120s TTL Engine, P2P Concurrency & Behavioral Modelling** | Sec 2 (Stakeholders & Use-Cases), Sec 4.3/4.5/4.6 (UML Sequence, Activity & Level-0/1 DFDs) | `CheckoutService.ts`, `PeerTransferService.ts`, `IssueRequestTTLScheduler.ts`, `RealtimeEventHub.ts`, `frontend/src/components/student/*`, `IssueRequestTTLScheduler.test.ts` |
| **Member 3** | **IEEE-830 SRS, Relational DB/ACID RPCs, Security, 3-Tier Testing, SQA & Planning** | Sec 3 (FR, NFR & Constraints), Sec 4.7 (6-Table ER), Sec 7–10 (TC-01..20, RTM, SQA, WBS/Schedule/COCOMO, Maintenance) | `001`/`002` SQL migrations, `JwtTokenService.ts`, `AuthService.ts`, `AdminGovernanceService.ts`, `frontend/src/components/admin/*`, `fullLifecycleAndRbac.system.test.ts`, `ci.yml` |

---

## 2. Three-Minute SE Live Demo Script (`Ctrl + Shift + D`)

1. **Launch Stack:** Run `npm run dev` in `backend/` (`:4000`) and `frontend/` (`:5173`), open `http://localhost:5173`, and press **`Ctrl + Shift + D`** (`Cmd + Shift + D` on macOS) to toggle the discrete role switcher (`ENABLE_DEMO_AUTH`-gated signed HS256 JWT sessions).
2. **Privacy-Safe Feed & 120s Server TTL (`Student A` — Member 2):**
   - Switch to **`Student A`**. Highlight `FR-06` & `NFR-04`: live equipment counts and activity room occupancy (`Occupied since HH:MM`) expose **zero student PII**.
   - Submit a checkout request for **2x TT Racket** (`FR-08`) and point out the authoritative **120-second server countdown** (`FR-09`).
3. **ACID Row-Locked Batch Approval & Faculty Room Override (`Guard` — Member 1):**
   - Switch to **`Guard`**. Click **Approve** (`FR-12`): `approve_issue_request_tx` locks `sac_items` `FOR UPDATE`, decrements stock from `6` to `4`, and inserts 2 unit rows under 1 shared `batch_id`.
   - Toggle **Faculty Occupy** on *Dance Room Key* (`FR-19`) and show real-time Socket.io update (`NFR-02`), then release it.
4. **Atomic P2P Custody Row Split (`Student A` → `Student B` — Member 2):**
   - Switch to **`Student A`**, initiate transfer of 1 racket to **`IIT2023002`** (`FR-17`), switch to **`Student B`**, and click **Accept** (`FR-18`).
   - Switch to **`Guard`**: show that the Active Register now displays **both** `Student A` (1 racket) and `Student B` (1 racket + clickable `tel:` phone link) under the shared batch (`FR-13`).
5. **Damaged Return Defaulter Lock, CSV Audit & Admin Clearance (`Guard` → `Admin` — Member 3):**
   - As **`Guard`**, mark `Student B`'s racket **Damaged** (`FR-15`): functional stock drops by 1 without incrementing available stock, and `Student B` is locked as a Defaulter (`403 INELIGIBLE_BORROWER`).
   - Switch to **`Admin`**, download the **Master Register CSV** (`FR-20`), and click **Clear Defaulter** (`FR-21`) in the Restrictions tab.

---

## 3. Top 12 SE Viva Questions & Engineering Answers

1. **Why did you choose an Iterative & Incremental SDLC over Waterfall?**
   - SACPulse involves real-time concurrency hazards (simultaneous Guard approvals, P2P acceptance racing against physical counter returns, and server restarts mid-TTL). Building in 4 test-gated vertical increments let us validate ACID PostgreSQL RPCs and timer recovery early instead of discovering race conditions at the end.
2. **How do you prevent negative stock if two Guards click "Approve" on the last TT Racket simultaneously?**
   - `approve_issue_request_tx` (`002_acid_rpc_functions.sql`) runs inside an ACID PostgreSQL transaction using `SELECT * FROM sac_items WHERE id = ... FOR UPDATE`. The second transaction blocks on the row lock until the first commits `available_qty = 0`, then aborts cleanly with `409 INSUFFICIENT_STOCK`.
3. **What if Student A initiates a P2P transfer to Student B, then hands the racket back to the Guard right as Student B clicks "Accept"?**
   - Physical counter return takes strict precedence (`FR-16`). `close_guard_return_tx` locks the row `FOR UPDATE`, transitions status to `RETURNED`/`DAMAGED`, and wipes `pending_transfer_to_id = NULL`. Student B's late request hits a terminal state and fails deterministically with `409 Conflict`.
4. **Why split a P2P transfer into two `register_logs` rows instead of updating `student_id` in place?**
   - Updating `student_id` in place destroys audit history (`NFR-09`). Closing Holder A's row (`RETURNED_VIA_TRANSFER`, `departure_time = T`) and inserting Holder B's row (`ISSUED`, `arrival_time = T`, same `batch_id`) preserves an immutable chain of custody without falsely incrementing counter stock.
5. **What happens to active 120-second request timers if the Node.js server crashes or restarts?**
   - Deadlines are persisted in `issue_requests.expires_at`. On startup (`server.ts`), `IssueRequestTTLScheduler.recoverPendingRequests()` immediately expires any `PENDING` rows where `expires_at <= NOW()` and reschedules timers for remaining unexpired rows (`TC-06`).
6. **How is the system secured against forged tokens, role escalation, and IDOR attacks?**
   - Google logins verify ID tokens cryptographically via `google-auth-library`; session JWTs are signed with `HMAC-SHA256` and verified via `crypto.timingSafeEqual`; `requireRole` blocks vertical escalation (`TC-18`), and `req.user.userId === studentId` blocks horizontal IDOR (`TC-19`).
7. **How do you protect the primary Admin from being revoked by a delegated Admin?**
   - Only `INITIAL_ADMIN_EMAIL` (Root Admin) has authority to grant or revoke the `ADMIN` role (`403` for delegated admins), and self-revocation is blocked (`400`), verified by 13 integration tests in `whitelistWorkflow.test.ts` (`TC-11`).
8. **How does your 3-tier test suite run in GitHub Actions CI without exposing live Supabase credentials?**
   - Because services depend on abstract `I*Repository` interfaces, `.github/workflows/ci.yml` sets `PERSISTENCE_DRIVER=memory` to run all **11 suites / 85 tests** against `InMemory*Repository` in `0.76 seconds`, while `npm test` runs the exact same 85 tests against live Supabase PostgreSQL.
9. **Why soft-archive (`is_archived = true`) SAC items instead of running `DELETE FROM sac_items`?**
   - Hard-deleting an item with historical `register_logs` rows would either violate `ON DELETE RESTRICT` or erase historical audit records. We block deletion if active holdings exist (`400`) and set `is_archived = true` otherwise (`FR-22`, `NFR-09`).
10. **How did you estimate effort and schedule using COCOMO?**
    - Across ~10.0 KSLOC (`backend/src`, `frontend/src`, `migrations`, `tests`), Basic Organic COCOMO (`E = 2.4 × 10^1.05`) yields an industrial baseline of `26.9 Person-Months`, compressed into a 5-milestone, 10-week 3-member schedule using strict TypeScript, managed Supabase, and automated Vitest regression suites.
11. **How does the Campus Feed detect a Faculty Session without storing faculty PII or leaking student PII?**
    - `InventoryQueryService` checks whether an occupied `ROOM_KEY` (`occupied_since IS NOT NULL`) appears in the set of active `register_logs.item_id`s. If absent, `isFacultySession = true` (`TC-12`) — zero personal data is queried or serialized.
12. **How is post-deployment maintenance planned across the 4 IEEE maintenance categories?**
    - **Corrective:** centralized `domainErrorHandler` + regression test per fix; **Adaptive:** swap `Supabase*Repository` for on-premise campus Postgres via DIP; **Perfective:** runtime `IPenaltyStrategy` tournament swaps & barcode scanner input; **Preventive:** monthly RFC-4180 CSV archival & partial index monitoring.

