import type { Order, StudioPreviewSize } from "../types";

/**
 * Constants for studio preview sizes
 */
export const STUDIO_PREVIEW_SIZES: { id: StudioPreviewSize; label: string }[] = [
  { id: "phone", label: "Phone" },
  { id: "tablet", label: "Tablet" },
  { id: "laptop", label: "Laptop" },
  { id: "desktop", label: "Desktop" },
];

/**
 * Determine preview size from video dimensions
 */
export function studioPreviewSizeFromDimensions(
  width: number,
  height: number,
): StudioPreviewSize {
  if (!width || !height) return "phone";
  const ratio = width / height;
  if (ratio < 0.75) return "phone";
  if (ratio < 1.1) return "tablet";
  if (ratio <= 1.85) return "laptop";
  return "desktop";
}

/**
 * Get human-readable label for output size
 */
export function orderOutputSizeLabel(size: string | null | undefined): string {
  switch (size) {
    case "tablet": return "Tablet";
    case "laptop": return "Laptop";
    case "desktop": return "Desktop";
    default: return "Phone";
  }
}

/**
 * Format payment line for confirmed orders (bank, ref, descriptor)
 */
export function orderPaymentLine(order: {
  bankCode: string | null;
  paymentReference: string | null;
  paymentDescriptor?: string | null;
}): string {
  const parts: string[] = [];
  if (order.bankCode) parts.push(order.bankCode);
  if (
    order.paymentReference &&
    order.paymentReference !== (order.bankCode ?? "")
  ) {
    parts.push(order.paymentReference);
  }
  if (order.paymentDescriptor?.trim()) {
    parts.push(order.paymentDescriptor.trim());
  }
  return parts.length ? `✓ ${parts.join(" · ")}` : "✓ Paid";
}

/**
 * Truncate a string in the middle with ellipsis
 */
export function truncateMiddle(value: string, max = 44): string {
  if (value.length <= max) return value;
  const keep = Math.floor((max - 1) / 2);
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

/**
 * Extract Facebook page ID from post URL
 */
export function parseFacebookPageIdFromUrl(url: string): string | undefined {
  const m = url.match(/facebook\.com\/(\d+)\/videos\//i);
  return m?.[1];
}

/**
 * Convert locale string to country flag emoji
 */
export function localeToFlag(locale: string): string {
  const part = locale.split("-").pop() || "";
  const cc = part.toUpperCase();
  if (cc.length !== 2) return "";
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0))
  );
}

/**
 * Normalize a caption's hashtag line for display and posting.
 * The AI returns plain words on the last line — this prefixes each with #.
 * Words already starting with # are left untouched.
 */
export function formatCaptionHashtags(caption: string): string {
  if (!caption?.trim()) return caption ?? "";
  const lines = caption.split("\n");
  // Find last non-empty line
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && !lines[lastIdx].trim()) lastIdx--;
  if (lastIdx < 0) return caption;

  const lastLine = lines[lastIdx].trim();
  const tokens = lastLine.split(/\s+/).filter(Boolean);
  // Only treat as hashtag line if 2+ tokens and all are word-chars (with optional leading #)
  const looksLikeTagLine =
    tokens.length >= 2 &&
    tokens.every((t) => /^#?[a-zA-Z0-9_\u00C0-\u024F]+$/.test(t));

  if (!looksLikeTagLine) return caption;

  const tagLine = tokens
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .join(" ");
  return [...lines.slice(0, lastIdx), tagLine].join("\n");
}

/**
 * Send browser notification
 */
export function sendNotification(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  } else if (Notification.permission === "default") {
    void Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification(title, { body, icon: "/favicon.ico" });
      }
    });
  }
}

/**
 * Execute price calculation functions for orders
 */

/** Price per frame for an order's tier (TTS only, clip only, or clip + narrator). */
export function pricePerFrameForOrder(
  order: Order,
  orderPricing: {
    pricePerFramePesos: number;
    pricePerFramePesosByTier?: {
      ttsOnly: number;
      clipOnly: number;
      clipAndNarrator: number;
    };
  } | null
): number {
  const tiers = orderPricing?.pricePerFramePesosByTier;
  if (!tiers) return orderPricing?.pricePerFramePesos ?? 5;
  if (order.useClipAudioWithNarrator) return tiers.clipAndNarrator;
  if (order.useClipAudio) return tiers.clipOnly;
  return tiers.ttsOnly;
}

/** Compute frame count and total price for a script using current order pricing; optional order for tier. */
export function orderFramesAndPrice(
  script: string,
  orderPricing: {
    wordsPerFrame: number;
    pricePerFramePesos: number;
    pricePerFramePesosByTier?: {
      ttsOnly: number;
      clipOnly: number;
      clipAndNarrator: number;
    };
  } | null,
  order?: Order
): { frames: number; pricePesos: number } {
  const wpf = orderPricing?.wordsPerFrame ?? 5;
  const pfp = order
    ? pricePerFrameForOrder(order, orderPricing)
    : orderPricing?.pricePerFramePesos ?? 5;
  const words = script.trim().split(/\s+/).filter(Boolean);
  const frames = wpf < 1 ? 0 : Math.ceil(words.length / wpf) || 0;
  return { frames, pricePesos: frames * pfp };
}

/** Split script into frame caption texts for timeline (uses order pricing words-per-frame). */
export function scriptToFrameTexts(
  scriptText: string,
  wordsPerFrame: number = 5
): string[] {
  const wpf = wordsPerFrame;
  const words = scriptText.trim().split(/\s+/).filter(Boolean);
  if (wpf < 1) return [];
  const frames: string[] = [];
  for (let i = 0; i < words.length; i += wpf) {
    frames.push(words.slice(i, i + wpf).join(" "));
  }
  return frames;
}
