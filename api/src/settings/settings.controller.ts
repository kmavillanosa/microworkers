import { Body, Controller, Get, Patch } from '@nestjs/common'
import { SettingsService, PAYMONGO_PAYMENT_METHOD_OPTIONS } from './settings.service'

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
}
