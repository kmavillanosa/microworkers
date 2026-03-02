import {
	Column,
	Entity,
	PrimaryColumn,
} from 'typeorm'

export type ReelJobStatus = 'queued' | 'processing' | 'completed' | 'failed'

@Entity('reel_jobs')
export class ReelJobEntity {
	@PrimaryColumn('varchar', { length: 64 })
	id: string

	@Column({ type: 'text' })
	script: string

	@Column({ type: 'varchar', length: 255, nullable: true })
	title: string | null

	@Column({ type: 'varchar', length: 260, nullable: true })
	clip_name: string | null

	@Column({ type: 'varchar', length: 120, nullable: true })
	font_name: string | null

	@Column({ type: 'varchar', length: 32, default: 'piper' })
	voice_engine: string

	@Column({ type: 'varchar', length: 260, nullable: true })
	voice_name: string | null

	@Column({ type: 'int', default: 180 })
	voice_rate: number

	@Column({ type: 'varchar', length: 16, default: 'auto' })
	bg_mode: string

	@Column({ type: 'varchar', length: 24, default: 'queued' })
	status: ReelJobStatus

	@Column({ type: 'int', default: 0 })
	progress: number

	@Column({ type: 'varchar', length: 128, nullable: true })
	stage: string | null

	@Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
	created_at: Date

	@Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
	updated_at: Date

	@Column({ type: 'varchar', length: 255, nullable: true })
	output_folder: string | null

	@Column({ type: 'text', nullable: true })
	error: string | null

	@Column({ type: 'varchar', length: 64, nullable: true })
	order_id: string | null

	@Column({ type: 'varchar', length: 16, nullable: true })
	output_size: string | null

	@Column({ type: 'boolean', default: false })
	use_clip_audio: boolean

	@Column({ type: 'boolean', default: false })
	use_clip_audio_with_narrator: boolean

	/** JSON array of { start, end, text } for caption timing */
	@Column({ type: 'json', nullable: true })
	transcript_segments: Array<{ start: number; end: number; text: string }> | null

	/** Script/caption position: top, center, bottom. */
	@Column({ type: 'varchar', length: 16, nullable: true })
	script_position: string | null

	/** Script/caption style: { fontScale?, bgOpacity? }. */
	@Column({ type: 'json', nullable: true })
	script_style: Record<string, unknown> | null

	@Column({ type: 'varchar', length: 120, nullable: true })
	niche_id: string | null

	@Column({ type: 'varchar', length: 180, nullable: true })
	niche_label: string | null
}
