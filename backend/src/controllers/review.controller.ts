import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReviewService } from '../services/review.service';
import { AuthGuard } from '../auth/auth.guard';
import { CitizenKycGuard } from '../auth/citizen-kyc.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../schemas/user.schema';
import { CreateReviewDto, ToggleVisibilityDto, UpdateReviewDto } from '../dto/review.dto';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(AuthGuard, CitizenKycGuard, RolesGuard)
  @Roles(UserRole.CITIZEN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a review for a lawyer (citizen only)' })
  async createReview(
    @Req() req,
    @Body() body: CreateReviewDto,
  ) {
    return this.reviewService.createReview(
      req.user.userId,
      body.lawyerId,
      body.rating,
      body.comment,
      body.appointmentId,
    );
  }

  @Get('lawyer/me')
  @UseGuards(AuthGuard, CitizenKycGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reviews received by current lawyer (lawyer only)' })
  async getMyLawyerReviews(@Req() req) {
    return this.reviewService.getLawyerReceivedReviews(req.user.userId);
  }

  @Get('lawyer/:lawyerId')
  @ApiOperation({ summary: 'Get reviews for a lawyer' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLawyerReviews(
    @Param('lawyerId') lawyerId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviewService.getLawyerReviews(
      lawyerId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
    );
  }

  @Get('my-reviews')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my submitted reviews (citizen only)' })
  async getMyReviews(@Req() req) {
    return this.reviewService.getCitizenReviews(req.user.userId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update my review (citizen only)' })
  async updateReview(
    @Req() req,
    @Param('id') id: string,
    @Body() body: UpdateReviewDto,
  ) {
    return this.reviewService.updateReview(id, req.user.userId, body.rating, body.comment);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, CitizenKycGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a review (citizen own review or admin any review)' })
  async deleteReview(@Req() req, @Param('id') id: string) {
    const isAdmin = req.user.role === UserRole.ADMIN;
    return this.reviewService.deleteReview(id, req.user.userId, isAdmin);
  }

  @Patch(':id/visibility')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle review visibility (admin only)' })
  async toggleVisibility(@Param('id') id: string, @Body() body: ToggleVisibilityDto) {
    return this.reviewService.toggleReviewVisibility(id, body.adminNote);
  }
}
