import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { NotesModule } from './notes/notes.module';
import { AuthModule } from './auth/auth.module';

@Module({ imports: [DatabaseModule, AuthModule, NotesModule] })
export class AppModule {}
