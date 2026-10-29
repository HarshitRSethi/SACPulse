import { Router, type Request, type Response } from 'express';
import { InventoryController } from '../controllers/InventoryController.js';
import { IssueRequestController } from '../controllers/IssueRequestController.js';
import { GuardCounterController } from '../controllers/GuardCounterController.js';
import { TransferController } from '../controllers/TransferController.js';
import { AdminController } from '../controllers/AdminController.js';
import { AuthController } from '../controllers/AuthController.js';
import { UserRepository } from '../infrastructure.persistence/repositories/UserRepository.js';
import { RegisterLogRepository } from '../infrastructure.persistence/repositories/RegisterLogRepository.js';
import { Student } from '../domain.entities/User.js';

export function createApiRouter(): Router {
  const router = Router();

  const authCtrl = new AuthController();
  const inventoryCtrl = new InventoryController();
  const issueReqCtrl = new IssueRequestController();
  const guardCtrl = new GuardCounterController();
  const transferCtrl = new TransferController();
  const adminCtrl = new AdminController();
  const userRepo = new UserRepository();
  const regRepo = new RegisterLogRepository();

  // 0. Authentication & Onboarding
  router.post('/auth/google', authCtrl.googleAuth);
  router.patch('/auth/mobile-setup', authCtrl.mobileSetup);
  router.patch('/auth/onboarding-mobile', authCtrl.mobileSetup);

  // 1. Inventory & Live Campus Status
  router.get('/inventory', inventoryCtrl.getInventory);

  // 2. Issue Requests & Counter Queue
  router.post('/issue-requests', issueReqCtrl.createIssueRequest);
  router.get('/guard/requests/pending', issueReqCtrl.getPendingRequests);

  // 3. Guard Counter Operations
  router.post('/guard/requests/:id/approve', guardCtrl.approveRequest);
  router.post('/guard/returns/:entryId/intact', guardCtrl.returnUnitIntact);
  router.post('/guard/returns/batch/:batchId/intact', guardCtrl.returnBatchIntact);
  router.post('/guard/returns/:entryId/damaged', guardCtrl.returnUnitDamaged);
  router.get('/guard/register/active', guardCtrl.getActiveRegister);

  // 4. Peer-to-Peer Transfers
  router.post('/transfers/:entryId/initiate', transferCtrl.initiateTransfer);
  router.post('/transfers/:entryId/cancel', transferCtrl.cancelTransfer);
  router.post('/transfers/:entryId/respond', transferCtrl.respondTransfer);
  router.get('/transfers/incoming/:studentId', transferCtrl.getIncomingTransfers);

  // 5. User Profile & Student Active Holdings
  router.get('/users/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const user = await userRepo.findById(id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      const isStudent = user instanceof Student;
      return res.json({
        success: true,
        data: {
          id: user.getId(),
          name: user.getName(),
          email: user.getEmail(),
          role: user.getRole(),
          rollNo: isStudent ? (user as Student).getRollNo() : null,
          mobileNo: isStudent ? (user as Student).getMobileNo() : null,
          isDefaulter: isStudent ? (user as Student).getIsDefaulter() : false,
          penaltyUntil: isStudent && (user as Student).getPenaltyUntil()
            ? (user as Student).getPenaltyUntil()!.toISOString()
            : null,
          dashboardRoute: user.getDashboardRoute()
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/register/student/:studentId', async (req: Request, res: Response) => {
    try {
      const studentId = req.params.studentId as string;
      const activeEntries = await regRepo.findActive({ studentId });
      return res.json({
        success: true,
        data: activeEntries.map((e) => ({
          id: e.getId(),
          batchId: e.getBatchId(),
          studentId: e.getStudentId(),
          studentName: e.getStudentName(),
          rollNo: e.getRollNo(),
          mobileNo: e.getMobileNo(),
          itemId: e.getItemId(),
          itemName: e.getItemName(),
          category: e.getCategory(),
          arrivalTime: e.getArrivalTime().toISOString(),
          status: e.getStatus(),
          pendingTransferToId: e.getPendingTransferToId()
        }))
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. Admin Console & Management
  router.get('/admin/register-logs', adminCtrl.getRegisterLogs);
  router.post('/admin/users/:id/clear-defaulter', adminCtrl.clearDefaulter);
  router.post('/admin/users/:id/reset-cooldown', adminCtrl.resetCooldown);
  router.post('/admin/inventory', adminCtrl.upsertInventoryItem);
  router.delete('/admin/inventory/:id', adminCtrl.deleteInventoryItem);
  router.get('/admin/users', adminCtrl.listUsers);

  return router;
}
