import type { IIssueRequestRepository } from '../../domain/repositories/IIssueRequestRepository.js';
import type { IRegisterLogRepository } from '../../domain/repositories/IRegisterLogRepository.js';
import type { ISACItemRepository } from '../../domain/repositories/ISACItemRepository.js';
import type { IUserRepository } from '../../domain/repositories/IUserRepository.js';
import { DatabaseConnection } from './DatabaseConnection.js';
import {
  InMemoryDatabaseStore,
  InMemoryIssueRequestRepository,
  InMemoryRegisterLogRepository,
  InMemorySACItemRepository,
  InMemoryUserRepository
} from './inMemory/InMemoryRepositories.js';
import { SupabaseIssueRequestRepository } from './supabase/SupabaseIssueRequestRepository.js';
import { SupabaseRegisterLogRepository } from './supabase/SupabaseRegisterLogRepository.js';
import { SupabaseSACItemRepository } from './supabase/SupabaseSACItemRepository.js';
import { SupabaseUserRepository } from './supabase/SupabaseUserRepository.js';

export interface RepositoryContainer {
  userRepo: IUserRepository;
  itemRepo: ISACItemRepository;
  issueRequestRepo: IIssueRequestRepository;
  registerLogRepo: IRegisterLogRepository;
  inMemoryStore?: InMemoryDatabaseStore;
}

export function createInMemoryRepositories(seedDefaults: boolean = true): RepositoryContainer {
  const store = new InMemoryDatabaseStore();
  if (seedDefaults) {
    store.seedDefaults();
  }
  return {
    userRepo: new InMemoryUserRepository(store),
    itemRepo: new InMemorySACItemRepository(store),
    issueRequestRepo: new InMemoryIssueRequestRepository(store),
    registerLogRepo: new InMemoryRegisterLogRepository(store),
    inMemoryStore: store
  };
}

export function createSupabaseRepositories(
  db: DatabaseConnection = DatabaseConnection.getInstance()
): RepositoryContainer {
  return {
    userRepo: new SupabaseUserRepository(db),
    itemRepo: new SupabaseSACItemRepository(db),
    issueRequestRepo: new SupabaseIssueRequestRepository(db),
    registerLogRepo: new SupabaseRegisterLogRepository(db)
  };
}

/**
 * Factory selecting Supabase persistence when configured, or In-Memory persistence
 * when `PERSISTENCE_DRIVER=memory` or cloud credentials are absent (e.g., offline CI).
 */
export function createDefaultRepositories(): RepositoryContainer {
  if (process.env.PERSISTENCE_DRIVER === 'memory') {
    return createInMemoryRepositories(true);
  }
  const db = DatabaseConnection.getInstance();
  if (!db.getSupabase()) {
    return createInMemoryRepositories(true);
  }
  return createSupabaseRepositories(db);
}

export {
  DatabaseConnection,
  InMemoryDatabaseStore,
  InMemoryUserRepository,
  InMemorySACItemRepository,
  InMemoryIssueRequestRepository,
  InMemoryRegisterLogRepository,
  SupabaseUserRepository,
  SupabaseSACItemRepository,
  SupabaseIssueRequestRepository,
  SupabaseRegisterLogRepository
};

// Backwards-compatible aliases
export {
  SupabaseUserRepository as UserRepository,
  SupabaseSACItemRepository as SACItemRepository,
  SupabaseIssueRequestRepository as IssueRequestRepository,
  SupabaseRegisterLogRepository as RegisterLogRepository
};
