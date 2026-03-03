import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { VoiceEntity } from './voice.entity'
import { VOICE_SEED } from './voice-seed'

@Injectable()
export class VoicesService {
  constructor(
    @InjectRepository(VoiceEntity)
    private readonly voiceRepo: Repository<VoiceEntity>,
  ) {}

  /** Seed voices table from VOICE_SEED if empty. Call once on app start or first use. */
  async seedIfEmpty(): Promise<void> {
    const count = await this.voiceRepo.count()
    if (count > 0) {
      await this.backfillSampleText()
      return
    }
    const rows = VOICE_SEED.map((row, i) =>
      this.voiceRepo.create({
        id: row.id,
        name: row.name,
        locale: row.locale,
        country: row.country,
        language: row.language,
        gender: row.gender,
        enabled: true,
        sort_order: i,
        sample_text: row.sample_text,
      }),
    )
    await this.voiceRepo.save(rows)
  }

  /** Set sample_text from VOICE_SEED so seed updates (e.g. translations) apply to existing rows. */
  private async backfillSampleText(): Promise<void> {
    const byId = new Map(VOICE_SEED.map((r) => [r.id, r.sample_text]))
    const voices = await this.voiceRepo.find()
    const toSave = voices.filter((v) => byId.has(v.id))
    if (toSave.length === 0) return
    for (const v of toSave) {
      v.sample_text = byId.get(v.id) ?? null
    }
    await this.voiceRepo.save(toSave)
  }

  /** All voices (for backoffice). Ensures seeded. */
  async findAll(): Promise<VoiceEntity[]> {
    await this.seedIfEmpty()
    return this.voiceRepo.find({ order: { sort_order: 'ASC', id: 'ASC' } })
  }

  /** Only enabled voices (for order form). */
  async findEnabled(): Promise<VoiceEntity[]> {
    await this.seedIfEmpty()
    return this.voiceRepo.find({
      where: { enabled: true },
      order: { sort_order: 'ASC', id: 'ASC' },
    })
  }

  async updateEnabled(id: string, enabled: boolean): Promise<VoiceEntity> {
    await this.seedIfEmpty()
    const voice = await this.voiceRepo.findOne({ where: { id } })
    if (!voice) throw new NotFoundException(`Voice "${id}" not found`)
    voice.enabled = enabled
    await this.voiceRepo.save(voice)
    return voice
  }

  /** Sample text for voice preview (edge voices only). Returns null if not found or no sample. */
  async getSampleText(voiceId: string): Promise<string | null> {
    await this.seedIfEmpty()
    const voice = await this.voiceRepo.findOne({
      where: { id: voiceId },
      select: ['sample_text'],
    })
    return voice?.sample_text ?? null
  }
}
