import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import type { Platform } from './account.types';
import { StudioJwtAuthGuard } from '../auth/studio-jwt-auth.guard';

@Controller('api/accounts')
@UseGuards(StudioJwtAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  async list(@Query('platform') platform?: string) {
    if (platform) {
      return this.accountsService.listByPlatform(platform as Platform);
    }
    return this.accountsService.listAll();
  }

  @Post()
  async create(@Body() body: CreateAccountDto) {
    return this.accountsService.create(body.platform, body.label);
  }

  @Patch(':id/label')
  async updateLabel(@Param('id') id: string, @Body() body: UpdateLabelDto) {
    return this.accountsService.updateLabel(id, body.label);
  }

  @Post(':id/disconnect')
  @HttpCode(200)
  async disconnect(@Param('id') id: string) {
    return this.accountsService.disconnect(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string) {
    await this.accountsService.delete(id);
  }
}
