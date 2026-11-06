import { Router } from 'express';
import { AdminGovernanceService } from '../application/services/AdminGovernanceService.js';
import {
  AuthService,
  type IGoogleTokenVerifier
} from '../application/services/AuthService.js';
import { CheckoutService } from '../application/services/CheckoutService.js';
import { GuardCounterService } from '../application/services/GuardCounterService.js';
import { InventoryQueryService } from '../application/services/InventoryQueryService.js';
import { IssueRequestTTLScheduler } from '../application/services/IssueRequestTTLScheduler.js';
import { JwtTokenService } from '../application/services/JwtTokenService.js';
import { PeerTransferService } from '../application/services/PeerTransferService.js';
import { RealtimeEventHub } from '../application/services/RealtimeEventHub.js';
import { AdminController } from '../controllers/AdminController.js';
import { AuthController } from '../controllers/AuthController.js';
import { GuardCounterController } from '../controllers/GuardCounterController.js';
import { InventoryController } from '../controllers/InventoryController.js';
import { IssueRequestController } from '../controllers/IssueRequestController.js';
import { TransferController } from '../controllers/TransferController.js';
import {
  SlidingWindowCooldownStrategy,
  type IPenaltyStrategy
} from '../domain/strategies/IPenaltyStrategy.js';
import type { RepositoryContainer } from '../infrastructure/persistence/index.js';
import {
  createAuthenticateJWT,
  requireRole
} from './middleware/authMiddleware.js';

export interface ApiRouterDependencies {
  repositories: RepositoryContainer;
  jwtService?: JwtTokenService;
  googleVerifier?: IGoogleTokenVerifier;
  penaltyStrategy?: IPenaltyStrategy;
  scheduler?: IssueRequestTTLScheduler;
  eventHub?: RealtimeEventHub;
}

export function createApiRouter(deps: ApiRouterDependencies): Router {
  const router = Router();

  const { repositories } = deps;
  const jwtService = deps.jwtService ?? new JwtTokenService();
  const penaltyStrategy = deps.penaltyStrategy ?? new SlidingWindowCooldownStrategy();
  const scheduler = deps.scheduler ?? IssueRequestTTLScheduler.getInstance();
  const eventHub = deps.eventHub ?? RealtimeEventHub.getInstance();

  scheduler.setPersistenceDelegate(repositories.issueRequestRepo);
  scheduler.setPenaltyStrategy(penaltyStrategy);

  // Compose Application Services (SOLID Dependency Inversion: injected abstract repositories)
  const authService = new AuthService(
    repositories.userRepo,
    jwtService,
    deps.googleVerifier
  );
  const inventoryQueryService = new InventoryQueryService(
    repositories.itemRepo,
    repositories.registerLogRepo
  );
  const checkoutService = new CheckoutService(
    repositories.userRepo,
    repositories.issueRequestRepo,
    repositories.registerLogRepo,
    penaltyStrategy,
    scheduler,
    eventHub
  );
  const guardService = new GuardCounterService(
    repositories.userRepo,
    repositories.itemRepo,
    repositories.issueRequestRepo,
    repositories.registerLogRepo,
    scheduler,
    eventHub
  );
  const transferService = new PeerTransferService(
    repositories.registerLogRepo,
    repositories.userRepo,
    penaltyStrategy,
    eventHub
  );
  const adminService = new AdminGovernanceService(
    repositories.registerLogRepo,
    repositories.userRepo,
    repositories.itemRepo,
    eventHub
  );

  // Compose Thin HTTP Presentation Controllers
  const authCtrl = new AuthController(authService);
  const inventoryCtrl = new InventoryController(inventoryQueryService);
  const issueReqCtrl = new IssueRequestController(checkoutService);
  const guardCtrl = new GuardCounterController(guardService);
  const transferCtrl = new TransferController(transferService);
  const adminCtrl = new AdminController(adminService);

  const authenticateJWT = createAuthenticateJWT(jwtService);

  // 0. Authentication, Demo Session & External Whitelist Onboarding
  router.post('/auth/google', authCtrl.googleAuth);
  router.post('/auth/demo-session', authCtrl.demoSession);
  router.patch('/auth/mobile-setup', authenticateJWT, authCtrl.mobileSetup);
  router.patch('/auth/onboarding-mobile', authenticateJWT, authCtrl.mobileSetup);
  router.post('/auth/request-whitelist', authCtrl.requestWhitelist);
  router.get('/auth/whitelist-status', authCtrl.getWhitelistStatus);

  // 1. Live Privacy-Safe Campus Inventory Feed
  router.get('/inventory', inventoryCtrl.getInventory);

  // 2. Student Issue Requests & Counter Queue
  router.post(
    '/issue-requests',
    authenticateJWT,
    requireRole('STUDENT'),
    issueReqCtrl.createIssueRequest
  );
  router.get(
    '/issue-requests/my-pending',
    authenticateJWT,
    requireRole('STUDENT'),
    issueReqCtrl.getPendingRequests
  );
  router.get(
    '/guard/requests/pending',
    authenticateJWT,
    requireRole('GUARD', 'ADMIN'),
    issueReqCtrl.getPendingRequests
  );

  // 3. Guard Counter Operations (`GUARD | ADMIN`)
  router.post(
    '/guard/requests/:id/approve',
    authenticateJWT,
    requireRole('GUARD', 'ADMIN'),
    guardCtrl.approveRequest
  );
  router.post(
    '/guard/returns/:entryId/intact',
    authenticateJWT,
    requireRole('GUARD', 'ADMIN'),
    guardCtrl.returnUnitIntact
  );
  router.post(
    '/guard/returns/batch/:batchId/intact',
    authenticateJWT,
    requireRole('GUARD', 'ADMIN'),
    guardCtrl.returnBatchIntact
  );
  router.post(
    '/guard/returns/:entryId/damaged',
    authenticateJWT,
    requireRole('GUARD', 'ADMIN'),
    guardCtrl.returnUnitDamaged
  );
  router.get(
    '/guard/register/active',
    authenticateJWT,
    requireRole('GUARD', 'ADMIN'),
    guardCtrl.getActiveRegister
  );
  router.post(
    '/guard/rooms/:id/faculty-occupy',
    authenticateJWT,
    requireRole('GUARD', 'ADMIN'),
    guardCtrl.facultyOccupyRoom
  );
  router.post(
    '/guard/rooms/:id/release',
    authenticateJWT,
    requireRole('GUARD', 'ADMIN'),
    guardCtrl.releaseRoom
  );

  // 4. Peer-to-Peer Transfers (`STUDENT`)
  router.post(
    '/transfers/:entryId/initiate',
    authenticateJWT,
    requireRole('STUDENT'),
    transferCtrl.initiateTransfer
  );
  router.post(
    '/transfers/:entryId/cancel',
    authenticateJWT,
    requireRole('STUDENT'),
    transferCtrl.cancelTransfer
  );
  router.post(
    '/transfers/:entryId/respond',
    authenticateJWT,
    requireRole('STUDENT'),
    transferCtrl.respondTransfer
  );
  router.get(
    '/transfers/incoming/:studentId',
    authenticateJWT,
    requireRole('STUDENT', 'GUARD', 'ADMIN'),
    transferCtrl.getIncomingTransfers
  );

  // 5. User Profile & Student Active Holdings
  router.get('/users/:id', authenticateJWT, authCtrl.getUserProfile);
  router.get(
    '/register/student/:studentId',
    authenticateJWT,
    requireRole('STUDENT', 'GUARD', 'ADMIN'),
    issueReqCtrl.getStudentActiveHoldings
  );

  // 6. Admin Governance Console (`ADMIN`)
  router.get(
    '/admin/register-logs',
    authenticateJWT,
    requireRole('ADMIN'),
    adminCtrl.getRegisterLogs
  );
  router.post(
    '/admin/users/:id/clear-defaulter',
    authenticateJWT,
    requireRole('ADMIN'),
    adminCtrl.clearDefaulter
  );
  router.post(
    '/admin/users/:id/reset-cooldown',
    authenticateJWT,
    requireRole('ADMIN'),
    adminCtrl.resetCooldown
  );
  router.post(
    '/admin/inventory',
    authenticateJWT,
    requireRole('ADMIN'),
    adminCtrl.upsertInventoryItem
  );
  router.delete(
    '/admin/inventory/:id',
    authenticateJWT,
    requireRole('ADMIN'),
    adminCtrl.deleteInventoryItem
  );
  router.get('/admin/users', authenticateJWT, requireRole('ADMIN'), adminCtrl.listUsers);
  router.get('/admin/whitelist', authenticateJWT, requireRole('ADMIN'), adminCtrl.getWhitelist);
  router.post(
    '/admin/whitelist/approve',
    authenticateJWT,
    requireRole('ADMIN'),
    adminCtrl.approveWhitelist
  );
  router.post(
    '/admin/whitelist/reject',
    authenticateJWT,
    requireRole('ADMIN'),
    adminCtrl.rejectWhitelist
  );
  router.post(
    '/admin/whitelist/direct-add',
    authenticateJWT,
    requireRole('ADMIN'),
    adminCtrl.directAddWhitelist
  );
  router.delete(
    '/admin/whitelist/:id',
    authenticateJWT,
    requireRole('ADMIN'),
    adminCtrl.revokeWhitelist
  );

  return router;
}
