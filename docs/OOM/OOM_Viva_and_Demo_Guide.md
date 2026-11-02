# SACPulse — Object-Oriented Methodology (OOM) Viva & Live Demo Guide

This guide prepares all **3 group members** specifically for the **Object-Oriented Methodology (OOM)** presentation and viva voce evaluation.

---

## 1. Three-Member OOM Module Ownership

| Member | OOM Focus Area | Code Files to Know Inside-Out | UML Diagrams to Present |
| :--- | :--- | :--- | :--- |
| **Member 1** | **Inventory & Custody Domain Core + GoF State, Template Method & Factory** | `backend/src/domain/entities/SACItem.ts`, `RegisterEntry.ts`, `CheckoutBatch.ts`, `InventoryCatalog.ts`, `backend/src/domain/states/IRegisterEntryState.ts`, `backend/src/domain/factories/*` | UML Class Diagram, `RegisterEntry` Statechart, Sequence Diagram C (Guard Damaged Return Override) |
| **Member 2** | **Actor Hierarchy + GoF Strategy & Observer/Singleton + P2P Collaboration** | `backend/src/domain/entities/User.ts`, `IssueRequest.ts`, `backend/src/domain/strategies/IPenaltyStrategy.ts`, `IEligibilityRule.ts`, `backend/src/application/services/IssueRequestTTLScheduler.ts`, `RealtimeEventHub.ts`, `PeerTransferService.ts` | `IssueRequest` Statechart, Activity Diagram, Sequence Diagrams A & B (120s Checkout & P2P Atomic Split) |
| **Member 3** | **SOLID DIP Repositories, `DomainException` Hierarchy, Modularity & Unit Tests** | `backend/src/domain/exceptions/DomainException.ts`, `backend/src/domain/repositories/*`, `backend/src/infrastructure/persistence/*`, `backend/src/presentation/middleware/errorHandler.ts`, `backend/tests/unit/gofPatternsAndSecurity.test.ts` | Use-Case Diagram, 5-Layer Package Dependency Structure, 85-Test OOP Verification Matrix |

---

## 2. Three-Minute OOM Live Demo Script (`Ctrl + Shift + D`)

1. **Start Servers:** Run `npm run dev` in `backend/` (`:4000`) and `frontend/` (`:5173`), open `http://localhost:5173`, and press **`Ctrl + Shift + D`** (`Cmd + Shift + D` on macOS) to reveal the discrete role-switcher strip.
2. **Polymorphic Feed & Composition Checkout (`Student A` — Member 2):**
   - Switch to **`Student A`**. Point out how `SportsEquipment` rows show numeric stock (`6 / 6`) while `RoomKey` rows show privacy-safe occupancy (`Occupied since HH:MM`) via polymorphic `SACItem.toInventoryDTO()`.
   - Request **2x TT Racket** (`IssueRequest *-- RequestLineItem`), arming the 120s server TTL.
3. **Template Method Allocation & Batch Composition (`Guard` — Member 1):**
   - Switch to **`Guard`** and click **Approve**. Explain that `SACItem.checkout()` runs its Template Method skeleton and spawns a `CheckoutBatch` composing 2 `RegisterEntry` objects in `IssuedState`.
4. **GoF State Pattern Atomic P2P Split (`Student A` → `Student B` — Member 2):**
   - As **`Student A`**, transfer 1 racket to **`IIT2023002`** (`IssuedState` → `TransferPendingState`).
   - Switch to **`Student B`** and click **Accept** (`TransferPendingState` closes Row A as `ReturnedViaTransferState` and spawns Row B in `IssuedState`).
5. **Encapsulated Damage & Polymorphic Exception Handling (`Guard` → `Admin` — Member 1 & Member 3):**
   - As **`Guard`**, mark `Student B`'s racket **Damaged** (`DamagedState` + `SportsEquipment.checkin(1, true)` increments private `damagedQty` without restoring `availableQty` + locks `Student B` as Defaulter).
   - Switch to **`Student B`** to show `IneligibleBorrowerException (403)`, then switch to **`Admin`** to invoke `Admin.clearDefaulter(student)`.

---

## 3. Top 12 OOM Viva Questions & Crisp Code-Backed Answers

1. **How did you avoid an "anemic domain model"?**
   - Every entity in `backend/src/domain/entities/` keeps all fields `private` or `protected`, validates invariants in its constructor, and exposes rich domain behaviors (`SACItem.checkout()`, `RegisterEntry.completeAtomicTransfer()`, `CheckoutBatch.returnAllActiveIntact()`, `Student.initiateTransfer()`).
2. **Show a concrete example of Polymorphism eliminating `if/else` or `instanceof`.**
   - `SACItem` declares abstract `toInventoryDTO()`, `toRealtimePayload()`, and `toPersistenceRecord()`. `InventoryCatalog` and `SupabaseSACItemRepository.save()` iterate over `SACItem[]` without a single `instanceof RoomKey` check.
3. **Distinguish Composition (`*--`) vs. Aggregation (`o--`) in SACPulse.**
   - **Composition:** `IssueRequest` instantiates and owns `RequestLineItem` value objects; `CheckoutBatch` owns its `RegisterEntry` units.
   - **Aggregation:** `InventoryCatalog` aggregates independent `SACItem` entities from `ISACItemRepository` for search and metrics; destroying the catalog does not destroy the `SACItem` instances.
4. **Why use the GoF State Pattern on `RegisterEntry` instead of an enum `switch`?**
   - Each of the 5 lifecycle states (`IssuedState`, `TransferPendingState`, `ReturnedState`, `ReturnedViaTransferState`, `DamagedState`) encapsulates its own legal transitions. Calling `acceptTransfer()` on `ReturnedState` or `IssuedState` automatically throws `InvalidStateTransitionException (409)` without duplicating guard clauses across services.
5. **Where is the GoF Template Method Pattern used?**
   - `SACItem.checkout(qty, now)` and `SACItem.checkin(qty, isDamaged, now)` define the invariant validation and `onInventoryMutated(now)` audit skeleton while deferring `assertCanAllocate`, `applyAllocation`, `applyRelease`, and `applyDamage` to `SportsEquipment` and `RoomKey`.
6. **How does the GoF Strategy Pattern make your penalty engine Open/Closed (OCP)?**
   - `CheckoutService` and `IssueRequestTTLScheduler` depend on `IPenaltyStrategy`. We can swap `SlidingWindowCooldownStrategy` (120s TTL, >3 strikes → 5h lock) with `StrictPeakHoursPenaltyStrategy` (90s TTL, >1 strike → 12h lock) at runtime without modifying either service.
7. **How is Liskov Substitution Principle (LSP) preserved between `SportsEquipment` and `RoomKey`?**
   - Both honor `SACItem.checkout()` and `SACItem.checkin()` pre/post-conditions and explicitly advertise capacity bounds via `getMaxAllocatablePerCheckout()`.
8. **How is Dependency Inversion Principle (DIP) implemented?**
   - Application Services import only abstract interfaces from `src/domain/repositories/`. Concrete `Supabase*Repository` and `InMemory*Repository` classes implement those interfaces in `src/infrastructure/persistence/`.
9. **Where is Interface Segregation Principle (ISP) demonstrated?**
   - Persistence is segregated into 4 domain repository interfaces, plus `IssueRequestTTLScheduler` consumes only the 5-method `ITTLPersistenceDelegate` interface.
10. **Why did you build a custom `DomainException` hierarchy?**
    - Domain entities throw semantic exceptions (`InsufficientStockException`, `InvalidStateTransitionException`, `IneligibleBorrowerException`) free of Express HTTP objects, and `domainErrorHandler` translates any `DomainException` polymorphically into consistent JSON responses.
11. **Why use `SACItemFactory` and `UserFactory`?**
    - They centralize polymorphic object creation from raw database/API discriminator strings (`EQUIPMENT` vs `ROOM_KEY`; `STUDENT` vs `GUARD` vs `ADMIN`) and reject unknown types with `ValidationException`.
12. **How do you prove all 6 GoF patterns and class relationships work?**
    - `backend/tests/unit/gofPatternsAndSecurity.test.ts` plus 10 additional Vitest suites (85/85 passing tests in `0.76s`) directly assert every state transition, strategy swap, factory validation, composition/aggregation behavior, and exception code.

