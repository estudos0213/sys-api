import 'reflect-metadata';
import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { DatabaseService } from '../src/database/database.service';
import { notes } from '../src/database/schema';

describe('JWT login and notes tenant isolation', () => {
  let app: INestApplication;
  let admin: Pool;
  let tokenA: string;
  let tokenB: string;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const emailA = `${randomUUID()}@example.com`;
  const emailB = `${randomUUID()}@example.com`;
  const password = 'Test password 123!';
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    admin = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
    const hash = await hashPassword(password);
    await admin.query(
      'insert into users (email, password_hash, tenant_id) values ($1, $2, $3), ($4, $2, $5)',
      [emailA, hash, tenantA, emailB, tenantB],
    );
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');

    const loginA = await request(app.getHttpServer()).post('/auth/login')
      .send({ email: emailA, password }).expect(200);
    const loginB = await request(app.getHttpServer()).post('/auth/login')
      .send({ email: emailB, password }).expect(200);
    tokenA = loginA.body.access_token;
    tokenB = loginB.body.access_token;
  });

  afterAll(async () => {
    await app?.close();
    if (admin) {
      try {
        await admin.query('delete from notes where tenant_id = any($1::uuid[])', [[tenantA, tenantB]]);
        await admin.query('delete from users where tenant_id = any($1::uuid[])', [[tenantA, tenantB]]);
      } finally {
        await admin.end();
      }
    }
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  it('logs in with only email and password and returns the stored tenant', async () => {
    const response = await request(app.getHttpServer()).post('/auth/login')
      .set('x-tenant-id', tenantB)
      .send({ email: `  ${emailA.toUpperCase()}  `, password }).expect(200);
    expect(response.body).toMatchObject({
      token_type: 'Bearer', expires_in: 3600,
      user: { email: emailA, tenantId: tenantA },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    const payload = await app.get(JwtService).verifyAsync(response.body.access_token);
    expect(payload).toMatchObject({ sub: response.body.user.id, email: emailA, tenantId: tenantA });
    expect(payload.exp - payload.iat).toBe(3600);
    expect(JSON.stringify(response.body)).not.toContain('password');

    await request(app.getHttpServer()).post('/auth/login')
      .send({ email: emailA, password, tenantId: tenantB }).expect(400);
    await request(app.getHttpServer()).post('/auth/login')
      .send({ email: emailA }).expect(400);
    await request(app.getHttpServer()).post('/auth/login')
      .send({ email: 'invalid', password }).expect(400);
  });

  it('rejects incorrect credentials with the same response', async () => {
    const wrongPassword = await request(app.getHttpServer()).post('/auth/login')
      .send({ email: emailA, password: 'incorrect' }).expect(401);
    const unknownEmail = await request(app.getHttpServer()).post('/auth/login')
      .send({ email: `${randomUUID()}@example.com`, password }).expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('requires a signed, unexpired token with valid identity claims on every notes route', async () => {
    const server = app.getHttpServer();
    await request(server).get('/notes').set('x-tenant-id', tenantA).expect(401);
    await request(server).post('/notes').send({ title: 'Denied' }).expect(401);
    const id = randomUUID();
    await request(server).get(`/notes/${id}`).expect(401);
    await request(server).patch(`/notes/${id}`).send({ title: 'Denied' }).expect(401);
    await request(server).delete(`/notes/${id}`).expect(401);

    const jwt = app.get(JwtService);
    const payload = await jwt.verifyAsync(tokenA);
    const identity = { sub: payload.sub, email: payload.email, tenantId: tenantA };
    const invalidTokens = [
      'not-a-jwt',
      await jwt.signAsync(identity, { secret: randomBytes(32).toString('hex') }),
      await jwt.signAsync(identity, { expiresIn: -1 }),
      await jwt.signAsync({ sub: identity.sub, email: emailA }),
      await jwt.signAsync({ ...identity, tenantId: 'invalid' }),
      await jwt.signAsync({ ...identity, sub: 'invalid' }),
      await jwt.signAsync(identity, { algorithm: 'HS384' }),
      await jwt.signAsync(identity, { issuer: 'other-service' }),
      await jwt.signAsync(identity, { audience: 'other-service' }),
      await new JwtService({
        secret: process.env.JWT_SECRET,
        signOptions: { algorithm: 'HS256', issuer: 'sys-api', audience: 'sys-api' },
      }).signAsync(identity),
    ];
    for (const token of invalidTokens) {
      await request(server).get('/notes').set('Authorization', `Bearer ${token}`).expect(401);
    }
  });

  it('isolates authenticated CRUD and ignores a spoofed tenant header', async () => {
    const server = app.getHttpServer();
    const authA = `Bearer ${tokenA}`;
    const authB = `Bearer ${tokenB}`;
    await request(server).post('/notes').set('Authorization', authA)
      .send({ title: '' }).expect(400);
    await request(server).post('/notes').set('Authorization', authA)
      .send({ title: 'Denied', tenantId: tenantB }).expect(400);

    const created = await request(server).post('/notes').set('Authorization', authA)
      .set('x-tenant-id', tenantB).send({ title: 'First' }).expect(201);
    const id: string = created.body.id;
    expect(created.body.tenantId).toBe(tenantA);

    const ownList = await request(server).get('/notes').set('Authorization', authA).expect(200);
    expect(ownList.body.map((item: { id: string }) => item.id)).toContain(id);
    const otherList = await request(server).get('/notes').set('Authorization', authB)
      .set('x-tenant-id', tenantA).expect(200);
    expect(otherList.body).toEqual([]);
    await request(server).get(`/notes/${id}`).set('Authorization', authA).expect(200);
    await request(server).get(`/notes/${id}`).set('Authorization', authB).expect(404);
    await request(server).patch(`/notes/${id}`).set('Authorization', authB)
      .send({ title: 'Changed' }).expect(404);
    await request(server).delete(`/notes/${id}`).set('Authorization', authB).expect(404);

    await Promise.all(Array.from({ length: 10 }, async (_, i) => {
      const tenant = i % 2 === 0 ? tenantA : tenantB;
      const token = i % 2 === 0 ? tokenA : tokenB;
      const response = await request(server).get('/notes')
        .set('Authorization', `Bearer ${token}`).expect(200);
      expect(response.body.every((note: { tenantId: string }) => note.tenantId === tenant)).toBe(true);
      expect(response.body.some((note: { id: string }) => note.id === id)).toBe(tenant === tenantA);
    }));

    const updated = await request(server).patch(`/notes/${id}`).set('Authorization', authA)
      .send({ title: 'Updated' }).expect(200);
    expect(updated.body.title).toBe('Updated');
    await request(server).delete(`/notes/${id}`).set('Authorization', authA).expect(204);
    await request(server).get(`/notes/${id}`).set('Authorization', authA).expect(404);
  });

  it('enforces RLS in PostgreSQL and clears context after commit and rollback', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const client = await pool.connect();
    let id: string;
    try {
      const role = await client.query('select rolsuper, rolbypassrls from pg_roles where rolname = current_user');
      expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      const inserted = await client.query('insert into notes (tenant_id, title) values ($1, $2) returning id', [tenantA, 'RLS']);
      id = inserted.rows[0].id;
      await client.query('commit');
      expect((await client.query('select id from notes where id = $1', [id])).rows).toEqual([]);

      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantB]);
      expect((await client.query('select id from notes where id = $1', [id])).rows).toEqual([]);
      expect((await client.query('update notes set title = $1 where id = $2', ['Denied', id])).rowCount).toBe(0);
      expect((await client.query('delete from notes where id = $1', [id])).rowCount).toBe(0);
      await client.query('rollback');

      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(client.query('insert into notes (tenant_id, title) values ($1, $2)', [tenantB, 'Denied']))
        .rejects.toMatchObject({ code: '42501' });
      await client.query('rollback');
      expect((await client.query('select id from notes where id = $1', [id])).rows).toEqual([]);

      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(client.query('update notes set tenant_id = $1 where id = $2', [tenantB, id]))
        .rejects.toMatchObject({ code: '42501' });
      await client.query('rollback');
      await expect(client.query('update users set tenant_id = $1 where email = $2', [tenantB, emailA]))
        .rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('rollback');
      client.release();
      await pool.end();
    }

    const database = app.get(DatabaseService);
    await expect(database.withTenant(tenantA, async (tx) => {
      await tx.insert(notes).values({ tenantId: tenantA, title: 'Rolled back' });
      throw new Error('Abort');
    })).rejects.toThrow('Abort');
    const ownRows = await database.withTenant(tenantA, (tx) => tx.select().from(notes));
    expect(ownRows.map((note) => note.title)).toEqual(['RLS']);
    const otherRows = await database.withTenant(tenantB, (tx) => tx.select().from(notes));
    expect(otherRows).toEqual([]);
  });
});
