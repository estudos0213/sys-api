import 'dotenv/config';
import { isEmail, isUUID } from 'class-validator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { users } from '../database/schema';
import { hashPassword } from './password';

async function createUser(): Promise<void> {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  const email = process.env.USER_EMAIL?.trim().toLowerCase();
  const tenantId = process.env.USER_TENANT_ID;
  const password = process.env.USER_PASSWORD;
  if (
    !connectionString || !email || !isEmail(email) || email.length > 254 ||
    !tenantId || !isUUID(tenantId) || !password || password.length > 128
  ) {
    throw new Error('Set MIGRATION_DATABASE_URL, USER_EMAIL, USER_TENANT_ID (UUID), and USER_PASSWORD (1–128 characters)');
  }

  const passwordHash = await hashPassword(password);
  const pool = new Pool({ connectionString });
  try {
    const [user] = await drizzle(pool).insert(users).values({ email, tenantId, passwordHash })
      .returning({ id: users.id, email: users.email, tenantId: users.tenantId });
    console.log(user);
  } finally {
    await pool.end();
  }
}

void createUser().catch((error: unknown) => {
  // Do not log query parameters, which include the password hash.
  console.error(error instanceof Error && error.message.startsWith('Set ')
    ? error.message : 'Unable to create user. Check database access and that the email is unique.');
  process.exitCode = 1;
});
