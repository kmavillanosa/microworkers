import { Body, Controller, Get, Param, Patch } from '@nestjs/common'
import { SettingsService, PAYMONGO_PAYMENT_METHOD_OPTIONS } from './settings.service'
import { VoicesService } from '../voices/voices.service'

@Controller('api/settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly voicesService: VoicesService,
  ) {}

  @Get('payment-methods')
  async getPaymentMethods() {
    const enabled = await this.settingsService.getPaymentMethodTypes()
    return {
      options: PAYMONGO_PAYMENT_METHOD_OPTIONS,
      enabled,
    }
  }

  @Patch('payment-methods')
  async updatePaymentMethods(
    @Body() body: { enabled: string[] },
  ) {
    const enabled = Array.isArray(body?.enabled) ? body.enabled : []
    const updated = await this.settingsService.setPaymentMethodTypes(enabled)
    return { enabled: updated }
  }

  @Get('voices')
  async listVoices() {
    return this.voicesService.findAll()
  }

  @Patch('voices/:id')
  async updateVoiceEnabled(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    const voice = await this.voicesService.updateEnabled(
      id,
      body.enabled === true,
    )
    return voice
  }
}
