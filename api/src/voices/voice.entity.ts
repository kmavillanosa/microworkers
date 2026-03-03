import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('voices')
export class VoiceEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id: string

  @Column({ type: 'varchar', length: 128 })
  name: string

  @Column({ type: 'varchar', length: 16 })
  locale: string

  @Column({ type: 'varchar', length: 64 })
  country: string

  @Column({ type: 'varchar', length: 64 })
  language: string

  @Column({ type: 'varchar', length: 16 })
  gender: string

  @Column({ type: 'boolean', default: true })
  enabled: boolean

  @Column({ type: 'int', default: 0 })
  sort_order: number

  @Column({ type: 'varchar', length: 512, nullable: true })
  sample_text: string | null
}
