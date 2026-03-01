import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('pipeline_config')
export class PipelineConfigEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id: string

  @Column({ type: 'varchar', length: 255, default: 'Pipeline' })
  label: string

  @Column({ type: 'tinyint', default: 0 })
  enabled: number

  @Column({ type: 'varchar', length: 128, default: 'gaming' })
  niche_id: string

  @Column({ type: 'varchar', length: 64, default: '' })
  facebook_account_id: string

  @Column({ type: 'text', nullable: true })
  facebook_page_ids: string | null

  @Column({ type: 'varchar', length: 32, default: 'edge' })
  voice_engine: string

  @Column({ type: 'varchar', length: 128, default: 'en-US-GuyNeural' })
  voice_name: string

  @Column({ type: 'varchar', length: 255, default: 'default' })
  font_name: string

  @Column({ type: 'varchar', length: 64, default: 'llama3' })
  ollama_model: string

  @Column({ type: 'varchar', length: 16, default: 'auto' })
  lang: string

  @Column({ type: 'float', default: 0.5 })
  interval_hours: number

  @Column({ type: 'varchar', length: 32 })
  created_at: string

  @Column({ type: 'varchar', length: 32, nullable: true })
  last_run_at: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  last_run_status: string | null

  @Column({ type: 'text', nullable: true })
  last_run_error: string | null
}
