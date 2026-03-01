import { Column, Entity, PrimaryColumn } from 'typeorm'

export type ClipType = 'game' | 'order'

@Entity('clips')
export class ClipEntity {
  @PrimaryColumn('varchar', { length: 16 })
  type: ClipType

  @PrimaryColumn('varchar', { length: 255 })
  id: string

  @Column({ type: 'varchar', length: 255 })
  name: string

  @Column({ type: 'varchar', length: 255 })
  filename: string

  @Column({ type: 'varchar', length: 32 })
  created_at: string

  @Column({ type: 'text', nullable: true })
  transcript_text: string | null

  @Column({ type: 'longtext', nullable: true })
  transcript_segments: string | null

  @Column({ type: 'varchar', length: 16, nullable: true })
  transcript_language: string | null

  @Column({ type: 'float', nullable: true })
  transcript_language_probability: number | null

  @Column({ type: 'varchar', length: 32, nullable: true })
  transcript_status: string | null

  @Column({ type: 'text', nullable: true })
  transcript_error: string | null

  @Column({ type: 'varchar', length: 32, nullable: true })
  transcript_updated_at: string | null
}
