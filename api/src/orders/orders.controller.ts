import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { FileFilterCallback } from 'multer';
import { mkdir } from 'node:fs/promises';
import { paths } from '../paths';
import { ClipsService } from '../clips/clips.service';
import {
  OrdersService,
  type OrderAudioFilter,
  type OrderStatus,
} from './orders.service';
import { ReelsService } from '../reels/reels.service';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { PaymongoCheckoutDto } from './dto/paymongo-checkout.dto';
import { PaymongoQrDto } from './dto/paymongo-qr.dto';
import { PrepareCheckoutDto } from './dto/prepare-checkout.dto';
import { PaymongoService } from '../paymongo/paymongo.service';
import { SettingsService } from '../settings/settings.service';
import { SetOrderStatusDto } from './dto/set-order-status.dto';
import { ProcessOrderDto } from './dto/process-order.dto';
import { UpdateOrderPricingDto } from './dto/update-order-pricing.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { DeleteAllOrdersDto } from './dto/delete-all-orders.dto';
import { StudioJwtAuthGuard } from '../auth/studio-jwt-auth.guard';

const allowedExt = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);
const DELETE_ALL_CONFIRM = 'DELETE_ALL_ORDERS';
const ORDER_STATUS_FILTERS = new Set<OrderStatus>([
  'pending',
  'accepted',
  'declined',
  'processing',
  'ready_for_sending',
  'closed',
]);
const PAYMENT_STATUS_FILTERS = new Set<'pending' | 'confirmed'>([
  'pending',
  'confirmed',
]);
const ORDER_AUDIO_FILTERS = new Set<OrderAudioFilter>([
  'tts_only',
  'clip_only',
  'clip_and_narrator',
]);

function parseBoundedInt(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

type Segment = { start: number; end: number; text: string };

/**
 * Align revised script to original segment timings so captions stay in sync with clip audio.
 * Splits the revised script proportionally by each segment's share of the original word count,
 * keeping original start/end times.
 */
function alignScriptToSegmentTiming(
  script: string,
  segments: Segment[],
): Segment[] {
  const scriptWords = script.trim().split(/\s+/).filter(Boolean);
  if (scriptWords.length === 0) return segments;
  const segWordCounts = segments.map(
    (s) => s.text.trim().split(/\s+/).filter(Boolean).length,
  );
  const totalOrig = segWordCounts.reduce((a, b) => a + b, 0);
  if (totalOrig === 0) return segments;
  let wordIdx = 0;
  return segments.map((seg, i) => {
    const n = segWordCounts[i];
    const proportion = n / totalOrig;
    const take = Math.max(0, Math.round(scriptWords.length * proportion));
    const startIdx = wordIdx;
    const endIdx =
      i === segments.length - 1
        ? scriptWords.length
        : Math.min(wordIdx + take, scriptWords.length);
    wordIdx = endIdx;
    const text = scriptWords.slice(startIdx, endIdx).join(' ').trim();
    return { start: seg.start, end: seg.end, text: text || seg.text };
  });
}

@Controller('api/orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly reelsService: ReelsService,
    private readonly clipsService: ClipsService,
    private readonly paymongoService: PaymongoService,
    private readonly settingsService: SettingsService,
  ) {}

  private async resolveOrderPayloadScript(
    payload: Record<string, unknown>,
  ): Promise<CreateOrderDto> {
    const script = (payload.script as string | undefined)?.trim() ?? '';
    const clipName = (payload.clipName as string | undefined)?.trim();

    if (!script && !clipName) {
      throw new BadRequestException(
        'Script is required when no clip is uploaded',
      );
    }

    let resolvedScript = script;
    if (clipName && !script) {
      const transcript = await this.clipsService.getTranscript(
        'order',
        clipName,
      );
      if (transcript) {
        resolvedScript = transcript;
      }
    }

    return {
      ...(payload as unknown as CreateOrderDto),
      script: resolvedScript,
      clipName: clipName || undefined,
    };
  }

  private parseTimestampToIso(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const millis = value > 1_000_000_000_000 ? value : value * 1000;
      const parsed = new Date(millis);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;

      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        const millis = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
        const parsedNumeric = new Date(millis);
        if (!Number.isNaN(parsedNumeric.getTime())) {
          return parsedNumeric.toISOString();
        }
      }

      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }

    return null;
  }

  private resolveQrExpiryFromNextAction(
    nextAction: Record<string, unknown> | undefined,
  ): string | null {
    if (!nextAction) return null;

    const code =
      typeof nextAction.code === 'object' && nextAction.code
        ? (nextAction.code as Record<string, unknown>)
        : undefined;
    const qrph =
      typeof nextAction.qrph === 'object' && nextAction.qrph
        ? (nextAction.qrph as Record<string, unknown>)
        : undefined;
    const displayQrph =
      typeof nextAction.display_qrph === 'object' && nextAction.display_qrph
        ? (nextAction.display_qrph as Record<string, unknown>)
        : undefined;

    const candidates: unknown[] = [
      nextAction.expires_at,
      nextAction.expired_at,
      nextAction.expiresAt,
      nextAction.expiry,
      code?.expires_at,
      code?.expired_at,
      code?.expiresAt,
      code?.expiry,
      qrph?.expires_at,
      qrph?.expired_at,
      displayQrph?.expires_at,
      displayQrph?.expired_at,
    ];

    for (const candidate of candidates) {
      const parsed = this.parseTimestampToIso(candidate);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private extractPendingQrData(payload: Record<string, unknown> | null): {
    qrImageUrl: string | null;
    amountPesos: number | null;
    qrExpiresAt: string | null;
  } | null {
    if (!payload || typeof payload !== 'object') return null;

    const qrRaw = payload.__qr;
    if (!qrRaw || typeof qrRaw !== 'object') return null;
    const qr = qrRaw as Record<string, unknown>;

    const qrImageUrl =
      typeof qr.qrImageUrl === 'string' && qr.qrImageUrl.trim()
        ? qr.qrImageUrl.trim()
        : null;
    const amountPesos =
      typeof qr.amountPesos === 'number' && Number.isFinite(qr.amountPesos)
        ? qr.amountPesos
        : null;
    const qrExpiresAt = this.parseTimestampToIso(qr.qrExpiresAt);

    if (!qrImageUrl && amountPesos == null && !qrExpiresAt) {
      return null;
    }

    return {
      qrImageUrl,
      amountPesos,
      qrExpiresAt,
    };
  }

  private normalizeDescriptorPart(
    value: string | null | undefined,
    maxLength: number,
  ): string {
    return (value ?? '')
      .replace(/\s+/g, ' ')
      .replace(/[|]+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  private buildQrPaymentDescriptor(payload: CreateOrderDto): string {
    const customerName = this.normalizeDescriptorPart(payload.customerName, 48);
    const customerEmail = this.normalizeDescriptorPart(
      payload.customerEmail,
      64,
    );
    const customerTag = customerName || customerEmail || 'Guest';
    const voiceTag =
      this.normalizeDescriptorPart(payload.voiceName, 32) ||
      this.normalizeDescriptorPart(payload.voiceEngine, 24) ||
      'voice';
    const clipTag = payload.clipName?.trim() ? 'clip' : 'no-clip';

    return `QRPH | ${customerTag} | ${voiceTag} | ${clipTag}`.slice(0, 255);
  }

  private buildQrPaymongoDescription(
    amountPesos: number,
    payload: CreateOrderDto,
    descriptor: string,
  ): string {
    const titleTag = this.normalizeDescriptorPart(payload.title, 48);
    const parts = ['Reel order', `₱${amountPesos}`, descriptor];
    if (titleTag) {
      parts.push(`Title:${titleTag}`);
    }
    return parts.join(' | ').slice(0, 255);
  }

  private buildCheckoutPaymentDescriptor(params: {
    customerName?: string | null;
    customerEmail?: string | null;
    voiceName?: string | null;
    voiceEngine?: string | null;
    clipName?: string | null;
    orderId?: string | null;
  }): string {
    const customerName = this.normalizeDescriptorPart(params.customerName, 48);
    const customerEmail = this.normalizeDescriptorPart(
      params.customerEmail,
      64,
    );
    const customerTag = customerName || customerEmail || 'Guest';
    const voiceTag =
      this.normalizeDescriptorPart(params.voiceName, 32) ||
      this.normalizeDescriptorPart(params.voiceEngine, 24) ||
      'voice';
    const clipTag = params.clipName?.trim() ? 'clip' : 'no-clip';
    const orderTag = params.orderId?.trim()
      ? `ORD:${params.orderId.trim().slice(-8)}`
      : null;

    const parts = ['Checkout', customerTag, voiceTag, clipTag];
    if (orderTag) {
      parts.push(orderTag);
    }
    return parts.join(' | ').slice(0, 255);
  }

  private buildCheckoutPaymongoDescription(
    amountPesos: number,
    title: string | null | undefined,
    descriptor: string,
  ): string {
    const titleTag = this.normalizeDescriptorPart(title, 64);
    const parts = ['Checkout payment', `₱${amountPesos}`, descriptor];
    if (titleTag) {
      parts.push(`Title:${titleTag}`);
    }
    return parts.join(' | ').slice(0, 255);
  }

  private buildQrPaymentMetadata(
    payload: CreateOrderDto,
    descriptor: string,
  ): Record<string, string> {
    const customerName = this.normalizeDescriptorPart(payload.customerName, 80);
    const customerEmail = this.normalizeDescriptorPart(
      payload.customerEmail,
      120,
    );
    const title = this.normalizeDescriptorPart(payload.title, 80);
    const clipName = this.normalizeDescriptorPart(payload.clipName, 80);
    const voiceName = this.normalizeDescriptorPart(payload.voiceName, 60);
    const voiceEngine = this.normalizeDescriptorPart(payload.voiceEngine, 24);
    const outputSize =
      this.normalizeDescriptorPart(payload.outputSize, 16) || 'phone';
    const scriptWords = payload.script?.trim()
      ? payload.script.trim().split(/\s+/).filter(Boolean).length
      : 0;

    return {
      order_descriptor: descriptor,
      customer_name: customerName || 'Guest',
      ...(customerEmail && { customer_email: customerEmail }),
      ...(title && { order_title: title }),
      ...(clipName && { clip_name: clipName }),
      ...(voiceName && { voice_name: voiceName }),
      ...(voiceEngine && { voice_engine: voiceEngine }),
      output_size: outputSize,
      script_words: String(scriptWords),
    };
  }

  @Post('upload-clip')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: async (
          _req: Request,
          _file: Express.Multer.File,
          cb: (error: Error | null, destination: string) => void,
        ) => {
          try {
            await mkdir(paths.orderClipsDir, { recursive: true });
            cb(null, paths.orderClipsDir);
          } catch (err) {
            cb(err as Error, paths.orderClipsDir);
          }
        },
        filename: (
          _req: Request,
          file: Express.Multer.File,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(
            null,
            `order-${Date.now()}-${randomUUID()}${allowedExt.has(ext) ? ext : '.mp4'}`,
          );
        },
      }),
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: FileFilterCallback,
      ) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!allowedExt.has(ext)) {
          cb(null, false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadClip(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    await this.clipsService.registerFromDisk('order', file.filename);
    if (process.env.RUN_TRANSCRIPTION_IN_API !== 'false') {
      void this.clipsService.transcribeClip('order', file.filename);
    }
    return {
      name: file.filename,
      url: `/media/order-clips/${file.filename}`,
    };
  }

  @Post()
  async create(@Body() body: CreateOrderDto) {
    const resolvedPayload = await this.resolveOrderPayloadScript(
      body as unknown as Record<string, unknown>,
    );
    return this.ordersService.create(resolvedPayload);
  }

  @Post('delete-all')
  @UseGuards(StudioJwtAuthGuard)
  async deleteAllOrdersAndRelated(@Body() body: DeleteAllOrdersDto) {
    if (body.confirm !== DELETE_ALL_CONFIRM) {
      throw new BadRequestException('Missing or invalid confirm value');
    }
    const [ordersDeleted, orderReelsDeleted, orderClipsDeleted] =
      await Promise.all([
        this.ordersService.deleteAllOrders(),
        this.reelsService.deleteAllOrderReels(),
        this.clipsService.deleteAllOrderClips(),
      ]);
    return {
      ordersDeleted,
      orderReelsDeleted,
      orderClipsDeleted,
    };
  }

  @Post(':id/process')
  async processOrder(@Param('id') id: string, @Body() body: ProcessOrderDto) {
    const order = await this.ordersService.getById(id);
    let script = body.script?.trim() ?? order.script?.trim() ?? '';
    let segments: Array<{ start: number; end: number; text: string }> | null =
      null;
    const useClipAudio =
      body.useClipAudio ?? order.useClipAudio ?? Boolean(order.clipName);
    const useClipAudioWithNarrator =
      body.useClipAudioWithNarrator ?? order.useClipAudioWithNarrator ?? false;
    const scriptOverridden = Boolean(body.script?.trim());
    if (order.clipName) {
      const transcriptData = await this.clipsService.getTranscriptData(
        'order',
        order.clipName,
      );
      const transcript = transcriptData.text;
      segments = transcriptData.segments;
      if (useClipAudio || useClipAudioWithNarrator) {
        const hasClipTranscript = transcript && segments?.length;
        if (scriptOverridden) {
          await this.ordersService.updateScript(order.id, script);
          // For clip+narrator, caption timing comes from TTS so drop segments. For clip-only, keep timing by aligning revised script to segments.
          if (useClipAudioWithNarrator) segments = null;
          else if (segments?.length && script !== transcript)
            segments = alignScriptToSegmentTiming(script, segments);
        } else if (useClipAudioWithNarrator && script && !hasClipTranscript) {
          segments = null;
        } else if (!hasClipTranscript && !script) {
          throw new BadRequestException(
            'Transcript not ready yet for this clip',
          );
        } else if (hasClipTranscript) {
          if (!script) {
            script = transcript;
            await this.ordersService.updateScript(order.id, transcript);
          } else if (script !== transcript) {
            // Script was edited: for clip-only, align revised script to segment timings so captions stay in sync with clip audio; for clip+narrator, use TTS timing.
            if (useClipAudioWithNarrator) segments = null;
            else if (segments?.length)
              segments = alignScriptToSegmentTiming(script, segments);
          }
        }
      } else if (!script && transcript) {
        script = transcript;
        await this.ordersService.updateScript(order.id, transcript);
      }
    }
    if (!script) {
      throw new BadRequestException('Order script is empty');
    }
    const job = await this.reelsService.createJob({
      script,
      title: order.title ?? undefined,
      clipName: order.clipName ?? undefined,
      fontName: order.fontId,
      voiceEngine:
        useClipAudio && !useClipAudioWithNarrator
          ? 'none'
          : (order.voiceEngine as any),
      voiceName:
        useClipAudio && !useClipAudioWithNarrator ? undefined : order.voiceName,
      ...(useClipAudio && {
        useClipAudio: true,
        useClipAudioWithNarrator: useClipAudioWithNarrator || undefined,
        ...(segments?.length ? { transcriptSegments: segments } : {}),
      }),
      orderId: order.id,
      outputSize: ['phone', 'tablet', 'laptop', 'desktop'].includes(
        order.outputSize ?? '',
      )
        ? (order.outputSize as 'phone' | 'tablet' | 'laptop' | 'desktop')
        : 'phone',
      scriptPosition: ['top', 'center', 'bottom'].includes(
        order.scriptPosition ?? '',
      )
        ? (order.scriptPosition as 'top' | 'center' | 'bottom')
        : undefined,
      scriptStyle: order.scriptStyle ?? undefined,
    });

    await this.ordersService.updateStatus(order.id, 'processing');

    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
    };
  }

  /** Debug: check if order or pending exists for a checkout session (no side effects). */
  @Get('debug-checkout-session/:sessionId')
  async debugCheckoutSession(@Param('sessionId') sessionId: string) {
    const sid = sessionId?.trim();
    if (!sid) {
      return {
        sessionId: null,
        orderExists: false,
        pendingExists: false,
        message: 'Empty session id',
      };
    }
    const order = await this.ordersService.findOrderByPaymentSessionId(sid);
    const pending =
      await this.ordersService.findPendingByCheckoutSessionId(sid);
    return {
      sessionId: sid,
      orderExists: Boolean(order?.id),
      orderId: order?.id ?? null,
      pendingExists: Boolean(pending && typeof pending === 'object'),
      message: order?.id
        ? 'Order found'
        : pending
          ? 'Pending found (order will be created when you call by-checkout-session)'
          : 'No order and no pending for this session',
    };
  }

  @Get('by-checkout-session/:sessionId')
  async getByCheckoutSession(@Param('sessionId') sessionId: string) {
    const sid = sessionId?.trim();
    if (!sid) {
      throw new BadRequestException('Checkout session ID is required');
    }
    let order = await this.ordersService.findOrderByPaymentSessionId(sid);
    if (!order) {
      order = await this.ordersService.createOrderFromPendingCheckout(sid);
    }
    if (!order) {
      this.logger.warn(`Order not found for checkout session: ${sid}`);
      throw new NotFoundException(
        'Order not found for this checkout session. If you used a payment link, please place your order from the order form and use "Continue to payment" so we can link your payment to your order.',
      );
    }
    return order;
  }

  @Post('prepare-checkout')
  async prepareCheckout(@Body() body: PrepareCheckoutDto) {
    const resolvedPayload = await this.resolveOrderPayloadScript(
      body.orderPayload as Record<string, unknown>,
    );
    const amountPesos = body.amountPesos;
    const paymentDescriptor = this.buildCheckoutPaymentDescriptor({
      customerName: resolvedPayload.customerName,
      customerEmail: resolvedPayload.customerEmail,
      voiceName: resolvedPayload.voiceName,
      voiceEngine: resolvedPayload.voiceEngine,
      clipName: resolvedPayload.clipName,
    });
    const description = this.buildCheckoutPaymongoDescription(
      amountPesos,
      resolvedPayload.title,
      paymentDescriptor,
    );
    const paymentMethodTypes =
      await this.settingsService.getPaymentMethodTypes();
    const customerName = resolvedPayload.customerName?.trim() ?? '';
    const customerEmail = resolvedPayload.customerEmail?.trim() ?? '';
    const deliveryAddress = resolvedPayload.deliveryAddress?.trim() ?? '';
    const billing =
      customerName || customerEmail || deliveryAddress
        ? {
            ...(customerName && { name: customerName }),
            ...(customerEmail && { email: customerEmail }),
            ...(deliveryAddress && { address: { line1: deliveryAddress } }),
          }
        : undefined;
    const { checkoutUrl, sessionId } =
      await this.paymongoService.createCheckoutSession({
        amountPesos,
        lineItemName: paymentDescriptor,
        description,
        successUrl: body.successUrl,
        cancelUrl: body.cancelUrl,
        billing,
        paymentMethodTypes,
      });
    if (!sessionId) {
      throw new BadRequestException('PayMongo did not return a session id');
    }
    // Persist pending checkout first so by-checkout-session can always find or create the order
    await this.ordersService.savePendingCheckout(
      sessionId,
      resolvedPayload as unknown as Record<string, unknown>,
    );
    this.logger.log(`Saved pending checkout for session ${sessionId}`);
    // Create order now with payment_session_id so by-checkout-session finds it when user returns
    try {
      await this.ordersService.create(resolvedPayload, sessionId);
      this.logger.log(`Created order for checkout session ${sessionId}`);
    } catch (err) {
      this.logger.warn(
        `Order create failed for session ${sessionId}, will create from pending on return: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return { checkoutUrl, sessionId };
  }

  @Post('paymongo-qr')
  async createPaymongoQr(@Body() body: PaymongoQrDto) {
    const resolvedPayload = await this.resolveOrderPayloadScript(
      body.orderPayload as Record<string, unknown>,
    );
    const amountPesos = body.amountPesos;
    const paymentDescriptor = this.buildQrPaymentDescriptor(resolvedPayload);
    const description = this.buildQrPaymongoDescription(
      amountPesos,
      resolvedPayload,
      paymentDescriptor,
    );
    const customerName = resolvedPayload.customerName?.trim() ?? '';
    const customerEmail = resolvedPayload.customerEmail?.trim() ?? '';
    const billing =
      customerName || customerEmail
        ? {
            ...(customerName && { name: customerName }),
            ...(customerEmail && { email: customerEmail }),
          }
        : undefined;

    const result = await this.paymongoService.createPaymentIntentQrPh({
      amountPesos,
      description,
      billing,
      metadata: this.buildQrPaymentMetadata(resolvedPayload, paymentDescriptor),
    });

    const pendingPayload: Record<string, unknown> = {
      ...(resolvedPayload as unknown as Record<string, unknown>),
      __qr: {
        paymentIntentId: result.paymentIntentId,
        qrImageUrl: result.qrImageUrl,
        qrExpiresAt: result.qrExpiresAt,
        amountPesos: result.amountPesos,
      },
    };

    await this.ordersService.savePendingCheckout(
      result.paymentIntentId,
      pendingPayload,
    );
    this.logger.log(
      `Saved pending QR payload for payment intent ${result.paymentIntentId}`,
    );

    return {
      qrImageUrl: result.qrImageUrl,
      amountPesos: result.amountPesos,
      paymentIntentId: result.paymentIntentId,
      qrExpiresAt: result.qrExpiresAt,
    };
  }

  @Get()
  list() {
    return this.ordersService.list();
  }

  @Get('paged')
  listPaged(
    @Query('page') pageValue?: string,
    @Query('pageSize') pageSizeValue?: string,
    @Query('search') searchValue?: string,
    @Query('status') statusValue?: string,
    @Query('paymentStatus') paymentStatusValue?: string,
    @Query('audio') audioValue?: string,
  ) {
    const page = parseBoundedInt(pageValue, 1, 1, 1_000_000);
    const pageSize = parseBoundedInt(pageSizeValue, 25, 1, 100);

    const status = statusValue?.trim() as OrderStatus | undefined;
    if (status && !ORDER_STATUS_FILTERS.has(status)) {
      throw new BadRequestException(`Invalid status filter: ${statusValue}`);
    }

    const paymentStatus = paymentStatusValue?.trim() as
      | 'pending'
      | 'confirmed'
      | undefined;
    if (paymentStatus && !PAYMENT_STATUS_FILTERS.has(paymentStatus)) {
      throw new BadRequestException(
        `Invalid paymentStatus filter: ${paymentStatusValue}`,
      );
    }

    const audio = audioValue?.trim() as OrderAudioFilter | undefined;
    if (audio && !ORDER_AUDIO_FILTERS.has(audio)) {
      throw new BadRequestException(`Invalid audio filter: ${audioValue}`);
    }

    return this.ordersService.listPaged({
      page,
      pageSize,
      search: searchValue?.trim() || undefined,
      status,
      paymentStatus,
      audio,
    });
  }

  @Get('pricing')
  getPricing() {
    return this.ordersService.getPricing();
  }

  @Patch('pricing')
  @UseGuards(StudioJwtAuthGuard)
  updatePricing(@Body() body: UpdateOrderPricingDto) {
    return this.ordersService.updatePricing(body);
  }

  @Get('payment-qr/:paymentIntentId')
  async getPaymentQrSession(@Param('paymentIntentId') paymentIntentId: string) {
    const intentId = paymentIntentId?.trim();
    if (!intentId) {
      throw new BadRequestException('Payment intent ID is required');
    }

    const [paymentIntent, pendingPayload] = await Promise.all([
      this.paymongoService.getPaymentIntent(intentId),
      this.ordersService.findPendingByCheckoutSessionId(intentId),
    ]);

    if (!paymentIntent) {
      throw new NotFoundException('Payment session not found');
    }

    const pendingQr = this.extractPendingQrData(pendingPayload);
    const attrs = paymentIntent.attributes;
    const amountPesosFromIntent =
      typeof attrs?.amount === 'number' && Number.isFinite(attrs.amount)
        ? Math.round(attrs.amount) / 100
        : null;
    const qrImageUrlFromIntent =
      attrs?.next_action?.code?.image_url?.trim() || null;
    const qrExpiresAtFromIntent = this.resolveQrExpiryFromNextAction(
      (attrs?.next_action ?? undefined) as unknown as
        | Record<string, unknown>
        | undefined,
    );

    const metadataOrderIdRaw = attrs?.metadata?.order_id;
    const metadataOrderId =
      typeof metadataOrderIdRaw === 'string' && metadataOrderIdRaw.trim()
        ? metadataOrderIdRaw.trim()
        : null;

    let order = await this.ordersService.findOrderByPaymentSessionId(intentId);
    if (!order && metadataOrderId) {
      try {
        order = await this.ordersService.getById(metadataOrderId);
      } catch {
        order = null;
      }
    }

    const paymongoStatus = attrs?.status ?? null;
    const isPaid =
      order?.paymentStatus === 'confirmed' || paymongoStatus === 'succeeded';

    return {
      paymentIntentId: intentId,
      qrImageUrl: qrImageUrlFromIntent ?? pendingQr?.qrImageUrl ?? null,
      amountPesos: amountPesosFromIntent ?? pendingQr?.amountPesos ?? null,
      qrExpiresAt: pendingQr?.qrExpiresAt ?? qrExpiresAtFromIntent,
      paymongoStatus,
      isPaid,
      orderId: order?.id ?? null,
    };
  }

  @Get('payment-ping/:paymentIntentId')
  async pingPaymentStatusByIntent(
    @Param('paymentIntentId') paymentIntentId: string,
  ) {
    const intentId = paymentIntentId?.trim();
    if (!intentId) {
      throw new BadRequestException('Payment intent ID is required');
    }

    let order = await this.ordersService.findOrderByPaymentSessionId(intentId);
    if (order?.paymentStatus === 'confirmed') {
      return {
        isPaid: true,
        paymentStatus: order.paymentStatus,
        source: 'order',
        paymongoStatus: 'succeeded',
        orderId: order.id,
      };
    }

    const paymentIntent = await this.paymongoService.getPaymentIntent(intentId);
    if (!paymentIntent) {
      return {
        isPaid: false,
        paymentStatus: order?.paymentStatus ?? 'pending',
        source: order ? 'order' : 'paymongo',
        paymongoStatus: null,
        orderId: order?.id ?? null,
      };
    }

    const metadataOrderId =
      paymentIntent.attributes?.metadata?.order_id?.trim();
    if (!order && metadataOrderId) {
      try {
        order = await this.ordersService.getById(metadataOrderId);
      } catch {
        order = null;
      }
    }

    const paymongoStatus = paymentIntent.attributes?.status ?? null;
    const metadataDescriptorRaw =
      paymentIntent.attributes?.metadata?.order_descriptor;
    const metadataDescriptor =
      typeof metadataDescriptorRaw === 'string'
        ? metadataDescriptorRaw.trim()
        : '';
    if (paymongoStatus !== 'succeeded') {
      return {
        isPaid: false,
        paymentStatus: order?.paymentStatus ?? 'pending',
        source: order ? 'order' : 'paymongo',
        paymongoStatus,
        orderId: order?.id ?? null,
      };
    }

    if (!order) {
      const pendingPayload =
        await this.ordersService.findPendingByCheckoutSessionId(intentId);
      if (pendingPayload && typeof pendingPayload === 'object') {
        try {
          const dto = pendingPayload as unknown as CreateOrderDto;
          order = await this.ordersService.create(dto, intentId);
        } catch (err) {
          this.logger.warn(
            `Failed creating order from QR payment intent ${intentId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    if (!order) {
      this.logger.warn(
        `Payment intent ${intentId} succeeded but no order payload was available`,
      );
      return {
        isPaid: false,
        paymentStatus: 'pending',
        source: 'pending',
        paymongoStatus,
        orderId: null,
      };
    }

    const updated = await this.ordersService.confirmPaymentByPayMongo(
      order.id,
      intentId,
      {
        paymentDescriptor: metadataDescriptor || undefined,
      },
    );
    await this.ordersService.deletePendingCheckout(intentId);
    return {
      isPaid: true,
      paymentStatus: updated.paymentStatus,
      source: 'paymongo',
      paymongoStatus,
      orderId: updated.id,
    };
  }

  @Get(':id/reels')
  getReelsForOrder(@Param('id') id: string) {
    return this.reelsService.listReelsByOrderId(id);
  }

  @Get(':id/payment-ping')
  async pingPaymentStatus(
    @Param('id') id: string,
    @Query('paymentIntentId') paymentIntentId?: string,
  ) {
    const order = await this.ordersService.getById(id);

    if (order.paymentStatus === 'confirmed') {
      return {
        isPaid: true,
        paymentStatus: order.paymentStatus,
        source: 'order',
      };
    }

    const intentId = paymentIntentId?.trim();
    if (!intentId) {
      return {
        isPaid: false,
        paymentStatus: order.paymentStatus,
        source: 'order',
      };
    }

    const paymentIntent = await this.paymongoService.getPaymentIntent(intentId);
    if (!paymentIntent) {
      return {
        isPaid: false,
        paymentStatus: order.paymentStatus,
        source: 'paymongo',
        paymongoStatus: null,
      };
    }

    const metadataOrderId = paymentIntent.attributes?.metadata?.order_id;
    if (metadataOrderId && metadataOrderId !== id) {
      throw new BadRequestException('Payment intent does not match this order');
    }

    const paymongoStatus = paymentIntent.attributes?.status ?? null;

    if (paymongoStatus === 'succeeded') {
      const updated = await this.ordersService.confirmPaymentByPayMongo(
        id,
        intentId,
      );
      return {
        isPaid: true,
        paymentStatus: updated.paymentStatus,
        source: 'paymongo',
        paymongoStatus,
      };
    }

    return {
      isPaid: false,
      paymentStatus: order.paymentStatus,
      source: 'paymongo',
      paymongoStatus,
    };
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.ordersService.getById(id);
  }

  @Delete(':id')
  async deleteOrderAndOutput(@Param('id') id: string) {
    const reelsDeleted = await this.reelsService.deleteReelsByOrderId(id);
    await this.ordersService.deleteOrder(id);
    return { orderDeleted: true, reelsDeleted };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateOrderDto) {
    return this.ordersService.update(id, body);
  }

  @Patch(':id/payment')
  confirmPayment(@Param('id') id: string, @Body() body: ConfirmPaymentDto) {
    return this.ordersService.confirmPayment(
      id,
      body.bankCode,
      body.paymentReference,
    );
  }

  @Post(':id/paymongo-checkout')
  async createPaymongoCheckout(
    @Param('id') id: string,
    @Body() body: PaymongoCheckoutDto,
  ) {
    const order = await this.ordersService.getById(id);
    const amountPesos = body.amountPesos;
    const paymentDescriptor = this.buildCheckoutPaymentDescriptor({
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      voiceName: order.voiceName,
      voiceEngine: order.voiceEngine,
      clipName: order.clipName,
      orderId: order.id,
    });
    const description = this.buildCheckoutPaymongoDescription(
      amountPesos,
      order.title,
      paymentDescriptor,
    );
    const paymentMethodTypes =
      await this.settingsService.getPaymentMethodTypes();
    const billing =
      order.customerName?.trim() ||
      order.customerEmail?.trim() ||
      order.deliveryAddress?.trim()
        ? {
            ...(order.customerName?.trim() && {
              name: order.customerName.trim(),
            }),
            ...(order.customerEmail?.trim() && {
              email: order.customerEmail.trim(),
            }),
            ...(order.deliveryAddress?.trim() && {
              address: { line1: order.deliveryAddress.trim() },
            }),
          }
        : undefined;
    const { checkoutUrl } = await this.paymongoService.createCheckoutSession({
      orderId: id,
      amountPesos,
      lineItemName: paymentDescriptor,
      description,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      billing,
      paymentMethodTypes,
    });
    return { checkoutUrl };
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() body: SetOrderStatusDto) {
    return this.ordersService.updateStatus(id, body.orderStatus as OrderStatus);
  }
}
