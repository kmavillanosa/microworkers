import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('pending_checkouts')
export class PendingCheckoutEntity {
  /** PayMongo checkout session id (cs_xxx). Stored after creating the session. */
  @PrimaryColumn('varchar', { length: 64 })
  checkout_session_id: string

  /** Order payload (CreateOrderDto shape) so we can create the order when payment succeeds. */
  @Column({ type: 'json' })
  payload: Record<string, unknown>

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date
}
