import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { UpdateOrderPricingDto } from './dto/update-order-pricing.dto';
import type { UpdateOrderDto } from './dto/update-order.dto';
import { OrderEntity } from './order.entity';
import { OrderPricingEntity } from './order-pricing.entity';
import { PendingCheckoutEntity } from './pending-checkout.entity';
import { SlackService } from '../slack/slack.service';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'processing'
  | 'ready_for_sending'
  | 'closed';

/** Pricing tier: TTS only (default), clip audio only, or clip + narrator. */
export type PricingTierId = 'tts_only' | 'clip_only' | 'clip_and_narrator';

export interface OrderPricing {
  wordsPerFrame: number;
  /** Single price for backward compat (same as pricePerFramePesosByTier.ttsOnly). */
  pricePerFramePesos: number;
  pricePerFramePesosByTier: {
    ttsOnly: number;
    clipOnly: number;
    clipAndNarrator: number;
  };
}

export interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  script: string;
  title: string | null;
  fontId: string;
  clipName: string | null;
  voiceEngine: string;
  voiceName: string;
  /** Output video size: phone, tablet, laptop, desktop. */
  outputSize: string | null;
  useClipAudio?: boolean;
  useClipAudioWithNarrator?: boolean;
  bankCode: string | null;
  paymentReference: string | null;
  paymentSessionId: string | null;
  /** PayMongo statement_descriptor or other transaction descriptor. */
  paymentDescriptor: string | null;
  paymentStatus: 'pending' | 'confirmed';
  orderStatus: OrderStatus;
  createdAt: string;
  /** Script position: top, center, bottom. */
  scriptPosition?: string | null;
  /** Script style: { fontScale?, bgOpacity? }. */
  scriptStyle?: Record<string, unknown> | null;
}

export type OrderAudioFilter = 'tts_only' | 'clip_only' | 'clip_and_narrator';

export interface ListOrdersOptions {
  page: number;
  pageSize: number;
  search?: string;
  status?: OrderStatus;
  paymentStatus?: 'pending' | 'confirmed';
  audio?: OrderAudioFilter;
}

export interface PagedOrdersResult {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Split script into frame count (words / wordsPerFrame). */
function frameCount(script: string, wordsPerFrame: number): number {
  if (wordsPerFrame < 1) return 0;
  const words = script.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  return Math.ceil(words.length / wordsPerFrame);
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(OrderPricingEntity)
    private readonly pricingRepo: Repository<OrderPricingEntity>,
    @InjectRepository(PendingCheckoutEntity)
    private readonly pendingCheckoutRepo: Repository<PendingCheckoutEntity>,
    private readonly slackService: SlackService,
  ) {}

  async create(dto: CreateOrderDto, paymentSessionId?: string): Promise<Order> {
    const id = randomUUID();
    const entity = this.ordersRepo.create({
      id,
      customer_name: dto.customerName?.trim() ?? '',
      customer_email: dto.customerEmail?.trim() ?? '',
      delivery_address: dto.deliveryAddress?.trim() ?? '',
      script: dto.script ?? '',
      title: dto.title ?? null,
      font_id: dto.fontId,
      clip_name: dto.clipName ?? null,
      voice_engine: dto.voiceEngine,
      voice_name: dto.voiceName,
      output_size: ['phone', 'tablet', 'laptop', 'desktop'].includes(
        dto.outputSize ?? '',
      )
        ? dto.outputSize!
        : 'phone',
      use_clip_audio: dto.useClipAudio ?? false,
      use_clip_audio_with_narrator: dto.useClipAudioWithNarrator ?? false,
      payment_status: 'pending',
      order_status: 'pending',
      payment_session_id: paymentSessionId ?? null,
      script_position: ['top', 'center', 'bottom'].includes(
        dto.scriptPosition ?? '',
      )
        ? dto.scriptPosition!
        : 'bottom',
      script_style: dto.scriptStyle ?? null,
    });
    await this.ordersRepo.save(entity);
    return this.mapEntity(entity);
  }

  async savePendingCheckout(
    checkoutSessionId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const row = this.pendingCheckoutRepo.create({
      checkout_session_id: checkoutSessionId,
      payload,
    });
    await this.pendingCheckoutRepo.save(row);
  }

  async findPendingByCheckoutSessionId(
    checkoutSessionId: string,
  ): Promise<Record<string, unknown> | null> {
    const sid = checkoutSessionId?.trim();
    if (!sid) return null;
    let row = await this.pendingCheckoutRepo.findOne({
      where: { checkout_session_id: sid },
    });
    if (!row && checkoutSessionId !== sid) {
      row = await this.pendingCheckoutRepo.findOne({
        where: { checkout_session_id: checkoutSessionId },
      });
    }
    const raw = row?.payload;
    if (raw == null) return null;
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
      return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return typeof parsed === 'object' &&
          parsed !== null &&
          !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  async deletePendingCheckout(checkoutSessionId: string): Promise<void> {
    await this.pendingCheckoutRepo.delete({
      checkout_session_id: checkoutSessionId,
    });
  }

  async findOrderByPaymentSessionId(
    paymentSessionId: string,
  ): Promise<Order | null> {
    const sid = paymentSessionId?.trim();
    if (!sid) return null;
    const row = await this.ordersRepo.findOne({
      where: { payment_session_id: sid },
    });
    return row ? this.mapEntity(row) : null;
  }

  /**
   * If this checkout session has a pending payload (prepare-checkout ran but order creation failed or was skipped),
   * create the order now and return it. Used by by-checkout-session when no order exists yet (e.g. payment link flow).
   * @throws BadRequestException if pending exists but order creation fails (e.g. validation)
   */
  async createOrderFromPendingCheckout(
    sessionId: string,
  ): Promise<Order | null> {
    const sid = sessionId?.trim();
    if (!sid) return null;
    const payload = await this.findPendingByCheckoutSessionId(sid);
    if (!payload || typeof payload !== 'object') return null;
    try {
      const dto = payload as unknown as CreateOrderDto;
      const order = await this.create(dto, sid);
      await this.deletePendingCheckout(sid);
      return order;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `Order could not be created from checkout session: ${message}`,
      );
    }
  }

  async list(): Promise<Order[]> {
    const rows = await this.ordersRepo.find({
      order: { created_at: 'DESC' },
    });
    return rows.map((row) => this.mapEntity(row));
  }

  async listPaged(options: ListOrdersOptions): Promise<PagedOrdersResult> {
    const page = Math.max(1, Math.floor(options.page || 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Math.floor(options.pageSize || 25)),
    );
    const search = options.search?.trim().toLowerCase() ?? '';

    const query = this.ordersRepo.createQueryBuilder('order');

    if (options.status) {
      query.andWhere('order.order_status = :status', {
        status: options.status,
      });
    }

    if (options.paymentStatus) {
      query.andWhere('order.payment_status = :paymentStatus', {
        paymentStatus: options.paymentStatus,
      });
    }

    if (options.audio === 'tts_only') {
      query.andWhere('order.use_clip_audio = :useClipAudio', {
        useClipAudio: false,
      });
    }

    if (options.audio === 'clip_only') {
      query
        .andWhere('order.use_clip_audio = :useClipAudio', {
          useClipAudio: true,
        })
        .andWhere(
          'order.use_clip_audio_with_narrator = :useClipAudioWithNarrator',
          {
            useClipAudioWithNarrator: false,
          },
        );
    }

    if (options.audio === 'clip_and_narrator') {
      query
        .andWhere('order.use_clip_audio = :useClipAudio', {
          useClipAudio: true,
        })
        .andWhere(
          'order.use_clip_audio_with_narrator = :useClipAudioWithNarrator',
          {
            useClipAudioWithNarrator: true,
          },
        );
    }

    if (search) {
      const likeSearch = `%${search}%`;
      query.andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(order.id) LIKE :search', { search: likeSearch })
            .orWhere('LOWER(order.customer_name) LIKE :search', {
              search: likeSearch,
            })
            .orWhere('LOWER(order.customer_email) LIKE :search', {
              search: likeSearch,
            })
            .orWhere('LOWER(order.delivery_address) LIKE :search', {
              search: likeSearch,
            })
            .orWhere('LOWER(order.script) LIKE :search', {
              search: likeSearch,
            })
            .orWhere(`LOWER(COALESCE(order.title, '')) LIKE :search`, {
              search: likeSearch,
            })
            .orWhere(
              `LOWER(COALESCE(order.payment_reference, '')) LIKE :search`,
              {
                search: likeSearch,
              },
            )
            .orWhere(
              `LOWER(COALESCE(order.payment_descriptor, '')) LIKE :search`,
              {
                search: likeSearch,
              },
            )
            .orWhere(`LOWER(COALESCE(order.bank_code, '')) LIKE :search`, {
              search: likeSearch,
            });
        }),
      );
    }

    query.orderBy('order.created_at', 'DESC');
    query.skip((page - 1) * pageSize);
    query.take(pageSize);

    const [rows, total] = await query.getManyAndCount();
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

    return {
      items: rows.map((row) => this.mapEntity(row)),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async getById(id: string): Promise<Order> {
    const row = await this.ordersRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Order "${id}" not found`);
    return this.mapEntity(row);
  }

  /** Delete all orders from the database. Returns the number of orders deleted. */
  async deleteAllOrders(): Promise<number> {
    const result = await this.ordersRepo
      .createQueryBuilder()
      .delete()
      .from(OrderEntity)
      .execute();
    return result.affected ?? 0;
  }

  /** Delete a single order by id. Throws NotFoundException if not found. */
  async deleteOrder(id: string): Promise<void> {
    const order = await this.ordersRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order "${id}" not found`);
    await this.ordersRepo.remove(order);
  }

  async confirmPayment(
    id: string,
    bankCode: string,
    paymentReference: string,
  ): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order "${id}" not found`);
    order.bank_code = bankCode;
    order.payment_reference = paymentReference;
    order.payment_status = 'confirmed';
    await this.ordersRepo.save(order);
    const mapped = this.mapEntity(order);
    void this.notifySlackIfConfigured(mapped);
    return mapped;
  }

  /** Mark order as paid when PayMongo webhook receives checkout_session.payment.paid. Stores transaction ref, optional descriptor, and payer info for receipt and backoffice. */
  async confirmPaymentByPayMongo(
    orderId: string,
    paymongoTransactionRef?: string,
    opts?: {
      paymentDescriptor?: string;
      payer?: {
        customerName?: string;
        customerEmail?: string;
        deliveryAddress?: string;
      };
    },
  ): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order "${orderId}" not found`);
    const paymentReference = paymongoTransactionRef?.trim() || 'paymongo';
    order.bank_code = 'paymongo';
    order.payment_reference = paymentReference;
    order.payment_status = 'confirmed';
    const payer = opts?.payer;
    if (payer?.customerName?.trim())
      order.customer_name = payer.customerName.trim();
    if (payer?.customerEmail?.trim())
      order.customer_email = payer.customerEmail.trim();
    if (payer?.deliveryAddress !== undefined)
      order.delivery_address = payer.deliveryAddress?.trim() ?? '';
    order.payment_descriptor = this.buildPaymongoPaymentDescriptor({
      order,
      paymentReference,
      incomingDescriptor: opts?.paymentDescriptor,
    });
    await this.ordersRepo.save(order);
    const mapped = this.mapEntity(order);
    void this.notifySlackIfConfigured(mapped);
    return mapped;
  }

  private normalizeDescriptorPart(value: string, maxLength: number): string {
    return value
      .replace(/\s+/g, ' ')
      .replace(/[|]+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  private buildPaymongoPaymentDescriptor(params: {
    order: OrderEntity;
    paymentReference: string;
    incomingDescriptor?: string;
  }): string {
    const customerName = this.normalizeDescriptorPart(
      params.order.customer_name ?? '',
      48,
    );
    const customerEmail = this.normalizeDescriptorPart(
      params.order.customer_email ?? '',
      64,
    );
    const customerTag = customerName || customerEmail || 'unknown-customer';

    const incoming = this.normalizeDescriptorPart(
      params.incomingDescriptor?.trim() ?? '',
      80,
    );
    const incomingLower = incoming.toLowerCase();
    const incomingIsGeneric =
      !incoming ||
      incomingLower === 'reel order' ||
      incomingLower === 'reel order.';

    const orderTag = params.order.id.slice(-8);
    const reference = this.normalizeDescriptorPart(params.paymentReference, 24);
    const hasReference = reference && reference.toLowerCase() !== 'paymongo';

    if (!incomingIsGeneric) {
      return `QRPH | ${incoming} | ORD:${orderTag} | ${customerTag}`.slice(
        0,
        255,
      );
    }

    return `QRPH | ORD:${orderTag} | ${customerTag}${hasReference ? ` | REF:${reference.slice(-10)}` : ''}`.slice(
      0,
      255,
    );
  }

  async updateStatus(id: string, orderStatus: OrderStatus): Promise<Order> {
    const entity = await this.ordersRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Order "${id}" not found`);
    const allowed: OrderStatus[] = [
      'pending',
      'accepted',
      'declined',
      'processing',
      'ready_for_sending',
      'closed',
    ];
    if (!allowed.includes(orderStatus)) {
      throw new BadRequestException(`Invalid order status: ${orderStatus}`);
    }
    entity.order_status = orderStatus;
    await this.ordersRepo.save(entity);
    return this.mapEntity(entity);
  }

  async updateScript(id: string, script: string): Promise<void> {
    await this.ordersRepo.update({ id }, { script });
  }

  /** Partial update (e.g. script revision or clip-audio options before checkout). Only provided fields are updated. */
  async update(id: string, dto: UpdateOrderDto): Promise<Order> {
    const entity = await this.ordersRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Order "${id}" not found`);
    if (dto.customerName !== undefined)
      entity.customer_name = dto.customerName.trim();
    if (dto.customerEmail !== undefined)
      entity.customer_email = dto.customerEmail.trim();
    if (dto.deliveryAddress !== undefined)
      entity.delivery_address = dto.deliveryAddress.trim();
    if (dto.script !== undefined) entity.script = dto.script;
    if (dto.title !== undefined) entity.title = dto.title;
    if (dto.fontId !== undefined) entity.font_id = dto.fontId.trim();
    if (dto.clipName !== undefined)
      entity.clip_name = dto.clipName.trim() || null;
    if (dto.voiceEngine !== undefined)
      entity.voice_engine = dto.voiceEngine.trim();
    if (dto.voiceName !== undefined) entity.voice_name = dto.voiceName.trim();
    if (dto.outputSize !== undefined) entity.output_size = dto.outputSize;
    if (dto.useClipAudio !== undefined)
      entity.use_clip_audio = dto.useClipAudio;
    if (dto.useClipAudioWithNarrator !== undefined)
      entity.use_clip_audio_with_narrator = dto.useClipAudioWithNarrator;
    if (dto.scriptPosition !== undefined) {
      entity.script_position = ['top', 'center', 'bottom'].includes(
        dto.scriptPosition,
      )
        ? dto.scriptPosition
        : 'bottom';
    }
    if (dto.scriptStyle !== undefined) entity.script_style = dto.scriptStyle;
    await this.ordersRepo.save(entity);
    return this.mapEntity(entity);
  }

  /**
   * Fill script from transcript only for orders that don't have a script yet.
   * Never overwrite an existing script so user revisions (web-orders or backoffice) are preserved.
   */
  async applyTranscriptToClipOrders(
    clipName: string,
    transcript: string,
  ): Promise<void> {
    const trimmed = transcript.trim();
    if (!trimmed) return;
    await this.ordersRepo
      .createQueryBuilder()
      .update(OrderEntity)
      .set({ script: trimmed })
      .where('clip_name = :clipName', { clipName })
      .andWhere('order_status NOT IN (:...statuses)', {
        statuses: ['declined', 'closed'],
      })
      .andWhere('(script IS NULL OR TRIM(script) = :empty)', { empty: '' })
      .execute();
  }

  async markReadyForSending(id: string): Promise<void> {
    const entity = await this.ordersRepo.findOne({ where: { id } });
    if (!entity) {
      return;
    }
    if (
      entity.order_status === 'declined' ||
      entity.order_status === 'closed'
    ) {
      return;
    }
    entity.order_status = 'ready_for_sending';
    await this.ordersRepo.save(entity);
  }

  private static readonly PRICING_TIER_DEFAULTS: Record<PricingTierId, number> =
    {
      tts_only: 3,
      clip_only: 5,
      clip_and_narrator: 7,
    };

  async getPricing(): Promise<OrderPricing> {
    const [defaultRow, existingTtsRow] = await Promise.all([
      this.pricingRepo.findOne({
        where: { id: 'default' },
      }),
      this.pricingRepo.findOne({ where: { id: 'tts_only' } }),
    ]);
    const wordsPerFrame =
      existingTtsRow?.words_per_frame ?? defaultRow?.words_per_frame ?? 5;
    const ttsDefaultPrice =
      existingTtsRow?.price_per_frame_pesos ??
      defaultRow?.price_per_frame_pesos ??
      OrdersService.PRICING_TIER_DEFAULTS.tts_only;
    await this.ensurePricingRow('tts_only', wordsPerFrame, ttsDefaultPrice);
    await this.ensurePricingRow(
      'clip_only',
      wordsPerFrame,
      OrdersService.PRICING_TIER_DEFAULTS.clip_only,
    );
    await this.ensurePricingRow(
      'clip_and_narrator',
      wordsPerFrame,
      OrdersService.PRICING_TIER_DEFAULTS.clip_and_narrator,
    );
    const [tts, clip, clipNarr] = await Promise.all([
      this.pricingRepo.findOne({ where: { id: 'tts_only' } }),
      this.pricingRepo.findOne({ where: { id: 'clip_only' } }),
      this.pricingRepo.findOne({ where: { id: 'clip_and_narrator' } }),
    ]);
    let ttsOnly =
      tts?.price_per_frame_pesos ??
      OrdersService.PRICING_TIER_DEFAULTS.tts_only;
    let clipOnly =
      clip?.price_per_frame_pesos ??
      OrdersService.PRICING_TIER_DEFAULTS.clip_only;
    let clipAndNarrator =
      clipNarr?.price_per_frame_pesos ??
      OrdersService.PRICING_TIER_DEFAULTS.clip_and_narrator;
    // One-time migration: if DB has old defaults (5, 3, 4), update to new defaults (3, 5, 7)
    const oldDefaults = { tts_only: 5, clip_only: 3, clip_and_narrator: 4 };
    if (
      ttsOnly === oldDefaults.tts_only &&
      clipOnly === oldDefaults.clip_only &&
      clipAndNarrator === oldDefaults.clip_and_narrator
    ) {
      const newDefaults = OrdersService.PRICING_TIER_DEFAULTS;
      if (tts) {
        tts.price_per_frame_pesos = newDefaults.tts_only;
        await this.pricingRepo.save(tts);
      }
      if (clip) {
        clip.price_per_frame_pesos = newDefaults.clip_only;
        await this.pricingRepo.save(clip);
      }
      if (clipNarr) {
        clipNarr.price_per_frame_pesos = newDefaults.clip_and_narrator;
        await this.pricingRepo.save(clipNarr);
      }
      ttsOnly = newDefaults.tts_only;
      clipOnly = newDefaults.clip_only;
      clipAndNarrator = newDefaults.clip_and_narrator;
    }

    const resolvedWordsPerFrame = tts?.words_per_frame ?? wordsPerFrame;
    if (
      defaultRow &&
      (defaultRow.words_per_frame !== resolvedWordsPerFrame ||
        defaultRow.price_per_frame_pesos !== ttsOnly)
    ) {
      defaultRow.words_per_frame = resolvedWordsPerFrame;
      defaultRow.price_per_frame_pesos = ttsOnly;
      await this.pricingRepo.save(defaultRow);
    }

    return {
      wordsPerFrame: resolvedWordsPerFrame,
      pricePerFramePesos: ttsOnly,
      pricePerFramePesosByTier: { ttsOnly, clipOnly, clipAndNarrator },
    };
  }

  private async ensurePricingRow(
    id: string,
    wordsPerFrame: number,
    pricePerFramePesos: number,
  ): Promise<void> {
    let row = await this.pricingRepo.findOne({ where: { id } });
    if (!row) {
      row = this.pricingRepo.create({
        id,
        words_per_frame: wordsPerFrame,
        price_per_frame_pesos: pricePerFramePesos,
      });
      await this.pricingRepo.save(row);
    }
  }

  async updatePricing(dto: UpdateOrderPricingDto): Promise<OrderPricing> {
    const current = await this.getPricing();
    const wordsPerFrame = dto.wordsPerFrame ?? current.wordsPerFrame;
    if (wordsPerFrame < 1 || wordsPerFrame > 100) {
      throw new BadRequestException('wordsPerFrame must be between 1 and 100');
    }
    if (dto.pricePerFramePesos != null && dto.pricePerFramePesos < 0) {
      throw new BadRequestException('pricePerFramePesos must be non-negative');
    }
    if (dto.clipOnly != null && dto.clipOnly < 0) {
      throw new BadRequestException('clipOnly must be non-negative');
    }
    if (dto.clipAndNarrator != null && dto.clipAndNarrator < 0) {
      throw new BadRequestException('clipAndNarrator must be non-negative');
    }
    const ttsPrice =
      dto.pricePerFramePesos ?? current.pricePerFramePesosByTier.ttsOnly;
    const clipOnlyPrice =
      dto.clipOnly ?? current.pricePerFramePesosByTier.clipOnly;
    const clipAndNarratorPrice =
      dto.clipAndNarrator ?? current.pricePerFramePesosByTier.clipAndNarrator;

    let ttsRow = await this.pricingRepo.findOne({ where: { id: 'tts_only' } });
    if (!ttsRow) {
      ttsRow = this.pricingRepo.create({
        id: 'tts_only',
        words_per_frame: wordsPerFrame,
        price_per_frame_pesos: ttsPrice,
      });
    } else {
      ttsRow.words_per_frame = wordsPerFrame;
      ttsRow.price_per_frame_pesos = ttsPrice;
    }
    await this.pricingRepo.save(ttsRow);

    let defaultRow = await this.pricingRepo.findOne({
      where: { id: 'default' },
    });
    if (!defaultRow) {
      defaultRow = this.pricingRepo.create({
        id: 'default',
        words_per_frame: wordsPerFrame,
        price_per_frame_pesos: ttsPrice,
      });
    } else {
      defaultRow.words_per_frame = wordsPerFrame;
      defaultRow.price_per_frame_pesos = ttsPrice;
    }
    await this.pricingRepo.save(defaultRow);

    let clipOnlyRow = await this.pricingRepo.findOne({
      where: { id: 'clip_only' },
    });
    if (!clipOnlyRow) {
      clipOnlyRow = this.pricingRepo.create({
        id: 'clip_only',
        words_per_frame: wordsPerFrame,
        price_per_frame_pesos: clipOnlyPrice,
      });
    } else {
      clipOnlyRow.words_per_frame = wordsPerFrame;
      clipOnlyRow.price_per_frame_pesos = clipOnlyPrice;
    }
    await this.pricingRepo.save(clipOnlyRow);

    let clipAndNarratorRow = await this.pricingRepo.findOne({
      where: { id: 'clip_and_narrator' },
    });
    if (!clipAndNarratorRow) {
      clipAndNarratorRow = this.pricingRepo.create({
        id: 'clip_and_narrator',
        words_per_frame: wordsPerFrame,
        price_per_frame_pesos: clipAndNarratorPrice,
      });
    } else {
      clipAndNarratorRow.words_per_frame = wordsPerFrame;
      clipAndNarratorRow.price_per_frame_pesos = clipAndNarratorPrice;
    }
    await this.pricingRepo.save(clipAndNarratorRow);

    return this.getPricing();
  }

  /** Compute amount (pesos) and human-readable order type for Slack. */
  private async getOrderAmountAndType(
    order: Order,
  ): Promise<{ amountPesos: number; orderType: string }> {
    const pricing = await this.getPricing();
    const wordsPerFrame = pricing.wordsPerFrame;
    const frames = frameCount(order.script ?? '', wordsPerFrame);
    const tiers = pricing.pricePerFramePesosByTier;
    const useClip = order.useClipAudio ?? false;
    const useClipNarrator = order.useClipAudioWithNarrator ?? false;
    const pricePerFrame = useClipNarrator
      ? tiers.clipAndNarrator
      : useClip
        ? tiers.clipOnly
        : tiers.ttsOnly;
    const amountPesos = frames * pricePerFrame;
    const orderType = useClipNarrator
      ? 'Clip + narrator'
      : useClip
        ? 'Clip only'
        : 'TTS only';
    return { amountPesos, orderType };
  }

  /** Send Slack notification when payment is confirmed; no-op if webhook not configured. */
  private async notifySlackIfConfigured(order: Order): Promise<void> {
    try {
      const { amountPesos, orderType } =
        await this.getOrderAmountAndType(order);
      const baseUrl = (process.env.WEB_ORDERS_BASE_URL ?? '').replace(
        /\/$/,
        '',
      );
      const receiptLink = baseUrl
        ? `${baseUrl}/receipt/${order.id}`
        : `/receipt/${order.id}`;
      await this.slackService.notifyOrder({
        receiptLink,
        paymentReference: order.paymentReference?.trim() || '—',
        customerName: order.customerName ?? '',
        customerEmail: order.customerEmail ?? '',
        amountPesos,
        orderType,
        orderId: order.id,
      });
    } catch (err) {
      // Don't fail payment confirmation if Slack fails; log for debugging
      this.logger.warn(
        `Slack notification failed for order ${order.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private mapEntity(row: OrderEntity): Order {
    return {
      id: row.id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      deliveryAddress: row.delivery_address,
      script: row.script,
      title: row.title,
      fontId: row.font_id,
      clipName: row.clip_name,
      voiceEngine: row.voice_engine,
      voiceName: row.voice_name,
      outputSize: row.output_size ?? 'phone',
      useClipAudio: row.use_clip_audio ?? false,
      useClipAudioWithNarrator: row.use_clip_audio_with_narrator ?? false,
      bankCode: row.bank_code,
      paymentReference: row.payment_reference,
      paymentSessionId: row.payment_session_id,
      paymentDescriptor: row.payment_descriptor ?? null,
      paymentStatus: row.payment_status,
      orderStatus: (row.order_status ?? 'pending') as OrderStatus,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      scriptPosition: row.script_position ?? 'bottom',
      scriptStyle: row.script_style ?? null,
    };
  }
}
