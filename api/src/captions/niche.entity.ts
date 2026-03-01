import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('niches')
export class NicheEntity {
  @PrimaryColumn('varchar', { length: 128 })
  id: string

  @Column({ type: 'varchar', length: 255 })
  label: string

  @Column({ type: 'text' })
  keywords: string

  @Column({ type: 'text' })
  rss_feeds: string

  @Column({ type: 'varchar', length: 32 })
  created_at: string
}
