import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('social_accounts')
export class SocialAccountEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id: string

  @Column({ type: 'varchar', length: 32 })
  platform: string

  @Column({ type: 'varchar', length: 255 })
  label: string

  @Column({ type: 'text', nullable: true })
  credentials: string | null

  @Column({ type: 'tinyint', default: 0 })
  connected: number

  @Column({ type: 'varchar', length: 32 })
  created_at: string
}
