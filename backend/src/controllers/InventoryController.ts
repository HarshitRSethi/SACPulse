import type { NextFunction, Request, Response } from 'express';
import { InventoryQueryService } from '../application/services/InventoryQueryService.js';
import { BaseController } from './BaseController.js';

export class InventoryController extends BaseController {
  private readonly inventoryQueryService: InventoryQueryService;

  constructor(inventoryQueryService: InventoryQueryService) {
    super();
    this.inventoryQueryService = inventoryQueryService;
  }

  /**
   * GET /api/inventory
   * Blueprint Rule 2: Privacy-safe campus inventory feed (zero student PII leaked).
   */
  public getInventory = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const feed = await this.inventoryQueryService.getPrivacySafeCampusFeed();
      return this.ok(res, feed);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };
}
