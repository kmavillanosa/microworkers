import { IsNotEmpty, IsNumber, IsObject, Min } from 'class-validator';

export class PaymongoQrDto {
  /** Amount in PHP pesos. Minimum ₱20 for QR Ph. */
  @IsNumber()
  @Min(20)
  amountPesos: number;

  /** Order payload (CreateOrderDto shape). Order is created only after payment is confirmed. */
  @IsObject()
  @IsNotEmpty()
  orderPayload: Record<string, unknown>;
}
