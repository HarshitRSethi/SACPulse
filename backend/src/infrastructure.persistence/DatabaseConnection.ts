import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * DatabaseConnection
 * Manages database access to Supabase PostgreSQL.
 * Supports connection pooling, transactions, row-level locking (SELECT ... FOR UPDATE),
 * and client-level queries.
 */
export class DatabaseConnection {
  private static instance: DatabaseConnection | null = null;
  private pool: Pool | null = null;
  private supabaseClient: SupabaseClient | null = null;

  private constructor() {
    this.initPool();
    this.initSupabaseClient();
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  private initPool(): void {
    const connectionString = process.env.DATABASE_URL;
    if (connectionString && !connectionString.includes('postgres:postgres@')) {
      this.pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      });
    }
  }

  private initSupabaseClient(): void {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (url && anonKey) {
      this.supabaseClient = createClient(url, anonKey);
    }
  }

  public getPool(): Pool | null {
    return this.pool;
  }

  public getSupabase(): SupabaseClient | null {
    return this.supabaseClient;
  }

  public async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error(
        'PostgreSQL connection pool is not configured. Set DATABASE_URL with valid credentials.'
      );
    }
    return this.pool.query<T>(text, params);
  }

  /**
   * Executes a database operation within an explicit transaction.
   * Enables strict isolation and SELECT ... FOR UPDATE row locking.
   */
  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    if (!this.pool) {
      throw new Error(
        'PostgreSQL connection pool is not configured. Set DATABASE_URL with valid credentials.'
      );
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
