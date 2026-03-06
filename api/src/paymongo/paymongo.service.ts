import { Injectable } from '@nestjs/common';

const PAYMONGO_API = 'https://api.paymongo.com/v1';

const DEFAULT_QRPH_EXPIRY_MINUTES = 15;

function parseTimestamp(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const maybeNumber = Number(trimmed);
    if (Number.isFinite(maybeNumber)) {
      const millis =
        maybeNumber > 1_000_000_000_000 ? maybeNumber : maybeNumber * 1000;
      const parsedNumber = new Date(millis);
      if (!Number.isNaN(parsedNumber.getTime())) {
        return parsedNumber;
      }
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function resolveQrExpiry(
  nextAction:
    | {
        type?: string;
        code?: Record<string, unknown>;
        qrph?: Record<string, unknown>;
        display_qrph?: Record<string, unknown>;
        expires_at?: unknown;
        expired_at?: unknown;
        expiresAt?: unknown;
        expiry?: unknown;
      }
    | undefined,
): string {
  const candidates: unknown[] = [
    nextAction?.expires_at,
    nextAction?.expired_at,
    nextAction?.expiresAt,
    nextAction?.expiry,
    nextAction?.code?.expires_at,
    nextAction?.code?.expired_at,
    nextAction?.code?.expiresAt,
    nextAction?.code?.expiry,
    nextAction?.qrph?.expires_at,
    nextAction?.qrph?.expired_at,
    nextAction?.display_qrph?.expires_at,
    nextAction?.display_qrph?.expired_at,
  ];

  for (const value of candidates) {
    const parsed = parseTimestamp(value);
    if (parsed) {
      return parsed.toISOString();
    }
  }

  const configuredExpiry = Number(process.env.PAYMONGO_QRPH_EXPIRY_MINUTES);
  const fallbackMinutes =
    Number.isFinite(configuredExpiry) && configuredExpiry > 0
      ? configuredExpiry
      : DEFAULT_QRPH_EXPIRY_MINUTES;

  return new Date(Date.now() + fallbackMinutes * 60_000).toISOString();
}

export interface CreateCheckoutParams {
  /** When provided, stored in session metadata so webhook can find the order. Omit when creating order only after payment. */
  orderId?: string;
  amountPesos: number;
  /** Human-readable label shown in PayMongo line item name. */
  lineItemName?: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  /** Prefill billing on the payment page when provided. */
  billing?: {
    name?: string;
    email?: string;
    address?: { line1?: string };
  };
  /** Payment method types to show (e.g. ['gcash']). Defaults to gcash only if not set. */
  paymentMethodTypes?: string[];
}

@Injectable()
export class PaymongoService {
  private getSecretKey(): string {
    const key = process.env.PAYMONGO_SECRET_KEY;
    if (!key || !key.startsWith('sk_')) {
      throw new Error(
        'PAYMONGO_SECRET_KEY is not set or invalid (must start with sk_)',
      );
    }
    return key;
  }

  /**
   * Create a PayMongo Checkout Session and return the checkout URL.
   * Amount is in PHP pesos; PayMongo expects centavos in line_items.
   */
  async createCheckoutSession(
    params: CreateCheckoutParams,
  ): Promise<{ checkoutUrl: string; sessionId?: string }> {
    const secretKey = this.getSecretKey();
    const amountCentavos = Math.round(params.amountPesos * 100);
    if (amountCentavos < 100) {
      throw new Error('Amount must be at least ₱1.00');
    }

    const paymentMethodTypes = params.paymentMethodTypes?.length
      ? params.paymentMethodTypes
      : ['gcash'];
    const lineItemName =
      params.lineItemName?.trim() ||
      params.description?.trim() ||
      'Reelagad checkout';
    const attributes: Record<string, unknown> = {
      line_items: [
        {
          amount: amountCentavos,
          currency: 'PHP',
          name: lineItemName.slice(0, 120),
          quantity: 1,
          description: params.description.slice(0, 255),
        },
      ],
      payment_method_types: paymentMethodTypes,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      description: params.description.slice(0, 255),
      show_line_items: true,
      ...(params.orderId && { metadata: { order_id: params.orderId } }),
    };
    if (
      params.billing &&
      (params.billing.name ||
        params.billing.email ||
        params.billing.address?.line1)
    ) {
      attributes.billing = {
        ...(params.billing.name && { name: params.billing.name.slice(0, 255) }),
        ...(params.billing.email && {
          email: params.billing.email.slice(0, 255),
        }),
        ...(params.billing.address?.line1 && {
          address: { line1: params.billing.address.line1.slice(0, 255) },
        }),
      };
    }
    const body = {
      data: {
        attributes,
      },
    };

    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const res = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`PayMongo checkout failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as {
      data?: { id?: string; attributes?: { checkout_url?: string } };
    };
    const checkoutUrl = data?.data?.attributes?.checkout_url;
    const sessionId = data?.data?.id ?? undefined;
    if (!checkoutUrl) {
      throw new Error('PayMongo did not return checkout_url');
    }
    return { checkoutUrl, sessionId };
  }

  /**
   * Retrieve a Checkout Session by id (e.g. from webhook).
   * Uses secret key so payments array and billing are included.
   */
  async getCheckoutSession(
    sessionId: string,
  ): Promise<CheckoutSessionResource | null> {
    const secretKey = this.getSecretKey();
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const res = await fetch(`${PAYMONGO_API}/checkout_sessions/${sessionId}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: CheckoutSessionResource };
    return json?.data ?? null;
  }

  /**
   * Create a Payment Intent with QR Ph, attach a qrph payment method, and return the QR image.
   * Customer scans the QR with GCash/Maya/bank app to pay. Amount in PHP pesos.
   * Minimum amount per PayMongo is 20 PHP (2000 centavos) for Payment Intents.
   */
  async createPaymentIntentQrPh(params: {
    orderId?: string;
    amountPesos: number;
    description: string;
    billing?: { name?: string; email?: string };
    metadata?: Record<string, string>;
  }): Promise<{
    paymentIntentId: string;
    qrImageUrl: string;
    amountPesos: number;
    qrExpiresAt: string;
  }> {
    const secretKey = this.getSecretKey();
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const amountCentavos = Math.round(params.amountPesos * 100);
    if (amountCentavos < 2000) {
      throw new Error('Amount must be at least ₱20.00 for QR Ph payment');
    }

    const metadata: Record<string, string> = {
      ...(params.metadata ?? {}),
      ...(params.orderId && { order_id: params.orderId }),
    };
    const hasMetadata = Object.keys(metadata).length > 0;

    // 1. Create Payment Intent with qrph allowed
    const piRes = await fetch(`${PAYMONGO_API}/payment_intents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountCentavos,
            currency: 'PHP',
            payment_method_allowed: ['qrph'],
            description: params.description.slice(0, 255),
            ...(hasMetadata && { metadata }),
          },
        },
      }),
    });
    if (!piRes.ok) {
      const err = await piRes.text();
      throw new Error(`PayMongo Payment Intent failed: ${piRes.status} ${err}`);
    }
    const piJson = (await piRes.json()) as {
      data?: { id?: string; attributes?: { client_key?: string } };
    };
    const paymentIntentId = piJson?.data?.id;
    if (!paymentIntentId) {
      throw new Error('PayMongo did not return Payment Intent id');
    }

    // 2. Create QR Ph payment method
    const pmBody: {
      data: {
        attributes: {
          type: string;
          billing?: { name?: string; email?: string };
        };
      };
    } = {
      data: {
        attributes: {
          type: 'qrph',
          ...(params.billing &&
            (params.billing.name || params.billing.email) && {
              billing: {
                ...(params.billing.name && {
                  name: params.billing.name.slice(0, 255),
                }),
                ...(params.billing.email && {
                  email: params.billing.email.slice(0, 255),
                }),
              },
            }),
        },
      },
    };
    const pmRes = await fetch(`${PAYMONGO_API}/payment_methods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(pmBody),
    });
    if (!pmRes.ok) {
      const err = await pmRes.text();
      throw new Error(
        `PayMongo Payment Method (qrph) failed: ${pmRes.status} ${err}`,
      );
    }
    const pmJson = (await pmRes.json()) as { data?: { id?: string } };
    const paymentMethodId = pmJson?.data?.id;
    if (!paymentMethodId) {
      throw new Error('PayMongo did not return Payment Method id');
    }

    // 3. Attach payment method to Payment Intent → get QR image in next_action
    const attachRes = await fetch(
      `${PAYMONGO_API}/payment_intents/${paymentIntentId}/attach`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              payment_method: paymentMethodId,
            },
          },
        }),
      },
    );
    if (!attachRes.ok) {
      const err = await attachRes.text();
      throw new Error(
        `PayMongo attach (qrph) failed: ${attachRes.status} ${err}`,
      );
    }
    const attachJson = (await attachRes.json()) as {
      data?: {
        attributes?: {
          next_action?: {
            type?: string;
            expires_at?: string | number;
            expired_at?: string | number;
            expiresAt?: string | number;
            expiry?: string | number;
            qrph?: {
              expires_at?: string | number;
              expired_at?: string | number;
            };
            display_qrph?: {
              expires_at?: string | number;
              expired_at?: string | number;
            };
            code?: { image_url?: string };
          };
        };
      };
    };
    const nextAction = attachJson?.data?.attributes?.next_action;
    const qrImageUrl = nextAction?.code?.image_url ?? '';
    if (!qrImageUrl) {
      throw new Error('PayMongo did not return QR Ph image_url');
    }
    const qrExpiresAt = resolveQrExpiry(nextAction);
    return {
      paymentIntentId,
      qrImageUrl,
      amountPesos: params.amountPesos,
      qrExpiresAt,
    };
  }

  /**
   * Retrieve a Payment Intent by id (e.g. to get metadata.order_id from webhook).
   */
  async getPaymentIntent(
    paymentIntentId: string,
  ): Promise<PaymentIntentResource | null> {
    const secretKey = this.getSecretKey();
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const res = await fetch(
      `${PAYMONGO_API}/payment_intents/${paymentIntentId}`,
      {
        headers: { Authorization: `Basic ${auth}` },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: PaymentIntentResource };
    return json?.data ?? null;
  }
}

/** Checkout Session resource as returned by PayMongo (for webhook + retrieve). */
export interface CheckoutSessionResource {
  id?: string;
  type?: string;
  attributes?: {
    metadata?: { order_id?: string };
    reference_number?: string;
    billing?: {
      name?: string;
      email?: string;
      phone?: string;
      address?: {
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        country?: string;
      };
    };
    payments?: Array<{
      id?: string;
      type?: string;
      attributes?: {
        billing?: {
          name?: string;
          email?: string;
          phone?: string;
          address?: {
            line1?: string;
            line2?: string;
            city?: string;
            state?: string;
            postal_code?: string;
            country?: string;
          };
        };
        statement_descriptor?: string;
        external_reference_number?: string;
      };
    }>;
  };
}

/** Payment Intent resource (for QR Ph webhook: get metadata.order_id). */
export interface PaymentIntentResource {
  id?: string;
  attributes?: {
    status?: string;
    amount?: number;
    next_action?: {
      type?: string;
      expires_at?: string | number;
      expired_at?: string | number;
      expiresAt?: string | number;
      expiry?: string | number;
      qrph?: {
        expires_at?: string | number;
        expired_at?: string | number;
      };
      display_qrph?: {
        expires_at?: string | number;
        expired_at?: string | number;
      };
      code?: {
        image_url?: string;
      };
    };
    metadata?: {
      order_id?: string;
      [key: string]: string | number | boolean | null | undefined;
    };
  };
}
