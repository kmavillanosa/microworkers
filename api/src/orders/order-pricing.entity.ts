import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('order_pricing')
export class OrderPricingEntity {
  @PrimaryColumn('varchar', { length: 32 })
  id: string

  @Column({ type: 'int', default: 5 })
  words_per_frame: number

  @Column({ type: 'double', default: 5 })
  price_per_frame_pesos: number
}

