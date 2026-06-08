import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ComplaintService } from '../services/complaint.service';
import { AuthGuard } from '../auth/auth.guard';
import { ComplaintCategory } from '../schemas/complaint.schema';

@ApiTags('Complaints (Help & Support)')
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintService: ComplaintService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a complaint / report (help & support)' })
  async create(
    @Req() req,
    @Body() body: { subject: string; message: string; category?: ComplaintCategory },
  ) {
    return this.complaintService.create(
      req.user.userId,
      body.subject,
      body.message,
      body.category,
    );
  }

  @Get('my')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my complaints' })
  async getMy(@Req() req, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.complaintService.getMyComplaints(
      req.user.userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get complaint by ID (owner only)' })
  async getById(@Req() req, @Param('id') id: string) {
    return this.complaintService.getById(id, req.user.userId, false);
  }
}
