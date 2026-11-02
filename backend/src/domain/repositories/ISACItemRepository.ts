import type { SACItem } from '../entities/SACItem.js';

/**
 * SOLID Dependency Inversion Principle (DIP): Abstract SACItem Repository Contract.
 */
export interface ISACItemRepository {
  findAll(): Promise<SACItem[]>;
  findById(id: string): Promise<SACItem | null>;
  create(item: SACItem): Promise<SACItem>;
  save(item: SACItem): Promise<void>;
  delete(id: string): Promise<void>;
}

