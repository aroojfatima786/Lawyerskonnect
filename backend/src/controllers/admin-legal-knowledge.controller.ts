import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../schemas/user.schema';
import { LegalKnowledgeService } from '../services/legal-knowledge.service';

@ApiTags('Admin Legal Knowledge')
@Controller('admin/legal-knowledge')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminLegalKnowledgeController {
  constructor(private readonly legalKnowledgeService: LegalKnowledgeService) {}

  @Post()
  @ApiOperation({ summary: 'Create legal knowledge entry (admin)' })
  create(@Req() req, @Body() body: any) {
    return this.legalKnowledgeService.create(body, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List legal knowledge entries (admin)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'language', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(@Query() query: any) {
    return this.legalKnowledgeService.list(
      query,
      query.page ? parseInt(query.page, 10) : 1,
      query.limit ? parseInt(query.limit, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get legal knowledge by id (admin)' })
  getById(@Param('id') id: string) {
    return this.legalKnowledgeService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update legal knowledge entry (admin)' })
  update(@Req() req, @Param('id') id: string, @Body() body: any) {
    return this.legalKnowledgeService.update(id, body, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete legal knowledge entry (admin)' })
  remove(@Param('id') id: string) {
    return this.legalKnowledgeService.remove(id);
  }
}
