import { Controller, Get, Patch, Query, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LawyerService } from '../services/lawyer.service';
import type { LawyerSearchFilters } from '../services/lawyer.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../schemas/user.schema';

@ApiTags('Lawyers')
@Controller('lawyers')
export class LawyerController {
  constructor(private readonly lawyerService: LawyerService) {}

  @Get()
  @ApiOperation({ summary: 'Search and filter lawyers' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'practiceArea', required: false })
  @ApiQuery({ name: 'minExperience', required: false, type: Number })
  @ApiQuery({ name: 'maxExperience', required: false, type: Number })
  @ApiQuery({ name: 'minRating', required: false, type: Number })
  @ApiQuery({ name: 'minFee', required: false, type: Number })
  @ApiQuery({ name: 'maxFee', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'latitude', required: false, type: Number })
  @ApiQuery({ name: 'longitude', required: false, type: Number })
  @ApiQuery({ name: 'radius', required: false, type: Number, description: 'Radius in kilometers' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['rating', 'experience', 'fee', 'reviews', 'distance'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async searchLawyers(@Query() filters: LawyerSearchFilters) {
    return this.lawyerService.searchLawyers({
      ...filters,
      page: filters.page ? Number(filters.page) : 1,
      limit: filters.limit ? Number(filters.limit) : 10,
      minExperience: filters.minExperience ? Number(filters.minExperience) : undefined,
      maxExperience: filters.maxExperience ? Number(filters.maxExperience) : undefined,
      minRating: filters.minRating ? Number(filters.minRating) : undefined,
      minFee: filters.minFee ? Number(filters.minFee) : undefined,
      maxFee: filters.maxFee ? Number(filters.maxFee) : undefined,
      latitude: filters.latitude !== undefined && filters.latitude !== null ? Number(filters.latitude) : undefined,
      longitude: filters.longitude !== undefined && filters.longitude !== null ? Number(filters.longitude) : undefined,
      radius: filters.radius !== undefined && filters.radius !== null ? Number(filters.radius) : undefined,
    });
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all practice area categories' })
  async getCategories() {
    return this.lawyerService.getCategories();
  }

  @Get('cities')
  @ApiOperation({ summary: 'Get all cities with lawyers' })
  async getCities() {
    return this.lawyerService.getCities();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lawyer profile by ID' })
  async getLawyerById(@Param('id') id: string) {
    return this.lawyerService.getLawyerById(id);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Get lawyer availability for a specific date' })
  @ApiQuery({ name: 'date', required: true, description: 'Date in YYYY-MM-DD format' })
  async getLawyerAvailability(@Param('id') id: string, @Query('date') date: string) {
    return this.lawyerService.getLawyerAvailability(id, date);
  }

  @Patch('profile')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update lawyer profile (lawyer only)' })
  async updateProfile(@Req() req, @Body() body: any) {
    return this.lawyerService.updateLawyerProfile(req.user.userId, body);
  }

  @Patch('availability')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update lawyer availability schedule (lawyer only)' })
  async updateAvailability(@Req() req, @Body() body: { availability: any[] }) {
    return this.lawyerService.updateAvailability(req.user.userId, body.availability);
  }
}
