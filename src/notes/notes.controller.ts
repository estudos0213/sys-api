import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantId } from '../tenant/tenant.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateNoteDto, UpdateNoteDto } from './dto';
import { NotesService } from './notes.service';

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() body: CreateNoteDto) {
    return this.notes.create(tenantId, body.title);
  }

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.notes.findAll(tenantId);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notes.findOne(tenantId, id);
  }

  @Patch(':id')
  update(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateNoteDto) {
    return this.notes.update(tenantId, id, body.title);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notes.remove(tenantId, id);
  }
}
