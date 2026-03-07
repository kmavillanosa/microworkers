import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  SettingsService,
  PAYMONGO_PAYMENT_METHOD_OPTIONS,
} from './settings.service';
import { VoicesService } from '../voices/voices.service';
import { StudioJwtAuthGuard } from '../auth/studio-jwt-auth.guard';

@Controller('api/settings')
@UseGuards(StudioJwtAuthGuard)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly voicesService: VoicesService,
  ) {}

  @Get('payment-methods')
  async getPaymentMethods() {
    const enabled = await this.settingsService.getPaymentMethodTypes();
    return {
      options: PAYMONGO_PAYMENT_METHOD_OPTIONS,
      enabled,
    };
  }

  @Patch('payment-methods')
  async updatePaymentMethods(@Body() body: { enabled: string[] }) {
    const enabled = Array.isArray(body?.enabled) ? body.enabled : [];
    const updated = await this.settingsService.setPaymentMethodTypes(enabled);
    return { enabled: updated };
  }

  @Get('maintenance-mode')
  async getMaintainanceMode() {
    return {
      isOnMaintainanceMode:
        await this.settingsService.getIsOnMaintainanceMode(),
    };
  }

  @Patch('maintenance-mode')
  async updateMaintainanceMode(
    @Body()
    body: {
      isOnMaintainanceMode?: boolean;
      isOnMaintenanceMode?: boolean;
    },
  ) {
    const requestedValue =
      body?.isOnMaintainanceMode ?? body?.isOnMaintenanceMode ?? false;

    const updated = await this.settingsService.setIsOnMaintainanceMode(
      requestedValue === true,
    );

    return {
      isOnMaintainanceMode: updated,
    };
  }

  @Get('voices')
  async listVoices() {
    return this.voicesService.findAll();
  }

  @Patch('voices/:id')
  async updateVoiceEnabled(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    const voice = await this.voicesService.updateEnabled(
      id,
      body.enabled === true,
    );
    return voice;
  }
}
