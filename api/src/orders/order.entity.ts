import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('orders')
export class OrderEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id: string

  @Column({ type: 'varchar', length: 255 })
  customer_name: string

  @Column({ type: 'varchar', length: 255 })
  customer_email: string

  @Column({ type: 'text' })
  delivery_address: string

  @Column({ type: 'text' })
  script: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null

  @Column({ type: 'varchar', length: 255 })
  font_id: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  clip_name: string | null

  @Column({ type: 'varchar', length: 64, default: 'edge' })
  voice_engine: string

  @Column({ type: 'varchar', length: 255 })
  voice_name: string

  /** Output video size: phone (9:16), tablet (4:3), laptop (16:10), desktop (16:9). Default phone. */
  @Column({ type: 'varchar', length: 16, nullable: true, default: 'phone' })
  output_size: string | null

  /** When true, use the uploaded clip's audio (with transcript) instead of TTS. */
  @Column({ type: 'boolean', default: false })
  use_clip_audio: boolean

  /** When true, use clip audio and also add a TTS narrator (mixed). Requires use_clip_audio. */
  @Column({ type: 'boolean', default: false })
  use_clip_audio_with_narrator: boolean

  @Column({ type: 'varchar', length: 32, nullable: true })
  bank_code: string | null

  @Column({ type: 'varchar', length: 128, nullable: true })
  payment_reference: string | null

  /** PayMongo statement_descriptor or other transaction descriptor. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  payment_descriptor: string | null

  @Column({
    type: 'enum',
    enum: ['pending', 'confirmed'],
    default: 'pending',
  })
  payment_status: 'pending' | 'confirmed'

  @Column({
    type: 'enum',
    enum: ['pending', 'accepted', 'declined', 'processing', 'ready_for_sending', 'closed'],
    default: 'pending',
  })
  order_status: string

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date

  /** Set when order was created from PayMongo checkout (webhook). Used to look up order after redirect. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  payment_session_id: string | null
}

