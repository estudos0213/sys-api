import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { notes } from '../database/schema';

@Injectable()
export class NotesService {
  constructor(private readonly database: DatabaseService) {}

  create(tenantId: string, title: string) {
    return this.database.withTenant(tenantId, async (tx) => {
      const [note] = await tx.insert(notes).values({ tenantId, title }).returning();
      return note;
    });
  }

  findAll(tenantId: string) {
    return this.database.withTenant(tenantId, (tx) =>
      tx.select().from(notes).orderBy(notes.createdAt),
    );
  }

  findOne(tenantId: string, id: string) {
    return this.database.withTenant(tenantId, async (tx) => {
      const [note] = await tx.select().from(notes)
        .where(and(eq(notes.id, id), eq(notes.tenantId, tenantId)));
      if (!note) throw new NotFoundException('Note not found');
      return note;
    });
  }

  update(tenantId: string, id: string, title: string) {
    return this.database.withTenant(tenantId, async (tx) => {
      const [note] = await tx.update(notes).set({ title })
        .where(and(eq(notes.id, id), eq(notes.tenantId, tenantId))).returning();
      if (!note) throw new NotFoundException('Note not found');
      return note;
    });
  }

  remove(tenantId: string, id: string) {
    return this.database.withTenant(tenantId, async (tx) => {
      const [note] = await tx.delete(notes)
        .where(and(eq(notes.id, id), eq(notes.tenantId, tenantId))).returning();
      if (!note) throw new NotFoundException('Note not found');
    });
  }
}
