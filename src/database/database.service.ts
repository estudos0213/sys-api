import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgTransaction } from 'drizzle-orm/node-postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema';

export type TenantTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly db;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool, { schema });
  }

  // Credentials must be looked up before a tenant can be authenticated.
  // No tenant data is queried through this unscoped path.
  async findUserForLogin(email: string) {
    const [user] = await this.db.select().from(schema.users)
      .where(eq(schema.users.email, email)).limit(1);
    return user;
  }

  async withTenant<T>(tenantId: string, work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      // true scopes the setting to this transaction, including pooled connections.
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      return work(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
