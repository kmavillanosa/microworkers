import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { SocialAccountEntity } from './social-account.entity'
import type { Platform, SocialAccount } from './account.types'

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(SocialAccountEntity)
    private readonly repo: Repository<SocialAccountEntity>,
  ) {}

  async listAll(): Promise<SocialAccount[]> {
    const rows = await this.repo.find({ order: { created_at: 'ASC' } })
    return rows.map(this.toAccount)
  }

  async listByPlatform(platform: Platform): Promise<SocialAccount[]> {
    const rows = await this.repo.find({
      where: { platform },
      order: { created_at: 'ASC' },
    })
    return rows.map(this.toAccount)
  }

  async findById(id: string): Promise<SocialAccount | null> {
    const row = await this.repo.findOne({ where: { id } })
    return row ? this.toAccount(row) : null
  }

  async findByIdOrThrow(id: string): Promise<SocialAccount> {
    const account = await this.findById(id)
    if (!account) {
      throw new NotFoundException(`Account not found: ${id}`)
    }
    return account
  }

  async create(platform: Platform, label: string): Promise<SocialAccount> {
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    await this.repo.insert({
      id,
      platform,
      label,
      credentials: null,
      connected: 0,
      created_at: createdAt,
    })
    return this.findByIdOrThrow(id)
  }

  async updateLabel(id: string, label: string): Promise<SocialAccount> {
    await this.findByIdOrThrow(id)
    await this.repo.update(id, { label })
    return this.findByIdOrThrow(id)
  }

  async saveCredentials(id: string, credentials: object): Promise<SocialAccount> {
    await this.findByIdOrThrow(id)
    await this.repo.update(id, {
      credentials: JSON.stringify(credentials),
      connected: 1,
    })
    return this.findByIdOrThrow(id)
  }

  async disconnect(id: string): Promise<SocialAccount> {
    await this.findByIdOrThrow(id)
    await this.repo.update(id, { credentials: null, connected: 0 })
    return this.findByIdOrThrow(id)
  }

  async delete(id: string): Promise<void> {
    await this.findByIdOrThrow(id)
    await this.repo.delete(id)
  }

  async getCredentials<T>(id: string): Promise<T | null> {
    const account = await this.findByIdOrThrow(id)
    if (!account.credentials) return null
    return JSON.parse(account.credentials) as T
  }

  /** First connected account id for a platform, or null. */
  async getFirstConnectedId(platform: Platform): Promise<string | null> {
    const row = await this.repo.findOne({
      where: { platform, connected: 1 },
      order: { created_at: 'ASC' },
    })
    return row?.id ?? null
  }

  private toAccount(row: SocialAccountEntity): SocialAccount {
    return {
      id: row.id,
      platform: row.platform as Platform,
      label: row.label,
      credentials: row.credentials,
      connected: row.connected === 1,
      createdAt: row.created_at,
    }
  }
}
