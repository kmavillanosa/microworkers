import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettingEntity } from './app-setting.entity';

const KEY_PAYMENT_METHOD_TYPES = 'paymongo_payment_method_types';
const KEY_MAINTAINANCE_MODE = 'is_on_maintainance_mode';

/** PayMongo payment method type identifiers. */
export const PAYMONGO_PAYMENT_METHOD_OPTIONS = [
  { id: 'gcash', label: 'GCash' },
  { id: 'paymaya', label: 'PayMaya' },
  { id: 'card', label: 'Card' },
  { id: 'grab_pay', label: 'GrabPay' },
  { id: 'dob', label: 'Direct online banking' },
  { id: 'dob_ubp', label: 'UnionBank Online' },
] as const;

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettingEntity)
    private readonly repo: Repository<AppSettingEntity>,
  ) {}

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.repo.upsert({ key, value }, { conflictPaths: ['key'] });
  }

  /**
   * Returns the list of PayMongo payment method types to show at checkout.
   * Defaults to ['gcash'] when not configured.
   */
  async getPaymentMethodTypes(): Promise<string[]> {
    const raw = await this.get(KEY_PAYMENT_METHOD_TYPES);
    if (!raw?.trim()) return ['gcash'];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        return parsed.length ? parsed : ['gcash'];
      }
    } catch {
      /* ignore */
    }
    return ['gcash'];
  }

  async setPaymentMethodTypes(types: string[]): Promise<string[]> {
    const valid = types.filter((t) =>
      PAYMONGO_PAYMENT_METHOD_OPTIONS.some((o) => o.id === t),
    );
    await this.set(
      KEY_PAYMENT_METHOD_TYPES,
      JSON.stringify(valid.length ? valid : ['gcash']),
    );
    return this.getPaymentMethodTypes();
  }

  async getIsOnMaintainanceMode(): Promise<boolean> {
    const raw = await this.get(KEY_MAINTAINANCE_MODE);
    if (!raw?.trim()) return false;

    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'boolean') {
        return parsed;
      }
    } catch {
      /* ignore */
    }

    return false;
  }

  async setIsOnMaintainanceMode(
    isOnMaintainanceMode: boolean,
  ): Promise<boolean> {
    await this.set(
      KEY_MAINTAINANCE_MODE,
      isOnMaintainanceMode ? 'true' : 'false',
    );
    return this.getIsOnMaintainanceMode();
  }
}
