import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { Repository } from 'typeorm'
import { paths } from '../paths'
import { FontEntity } from './font.entity'

const ALLOWED_EXT = ['.ttf', '.otf']

export interface FontDto {
  id: string
  name: string
  filename: string
  source: 'custom' | 'builtin'
}

@Injectable()
export class FontsService {
  constructor(
    @InjectRepository(FontEntity)
    private readonly fontRepo: Repository<FontEntity>,
  ) {}

  async listFromDb(): Promise<FontDto[]> {
    const rows = await this.fontRepo.find({ order: { name: 'ASC' } })
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      filename: row.filename,
      source: 'custom' as const,
    }))
  }

  async upload(file: Express.Multer.File): Promise<FontDto> {
    if (!file?.originalname) {
      throw new BadRequestException('No file provided')
    }
    const ext = extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXT.includes(ext)) {
      throw new BadRequestException(
        `Only .ttf and .otf are allowed. Got: ${ext}`,
      )
    }
    const filename = file.originalname
    if (filename !== filename.replace(/[/\\]/g, '')) {
      throw new BadRequestException('Invalid filename')
    }
    await mkdir(paths.fontsDir, { recursive: true })
    const destPath = join(paths.fontsDir, filename)
    await writeFile(destPath, file.buffer)
    const now = new Date().toISOString()
    const name = filename.replace(/\.[^.]+$/, '') || filename
    await this.fontRepo.upsert(
      {
        id: filename,
        name,
        filename,
        created_at: now,
      },
      { conflictPaths: ['id'] },
    )
    return { id: filename, name, filename, source: 'custom' }
  }

  async update(id: string, dto: { name?: string }): Promise<FontDto> {
    if (id === 'default') {
      throw new BadRequestException('Cannot update built-in font')
    }
    const row = await this.fontRepo.findOne({ where: { id } })
    if (!row) {
      throw new NotFoundException(`Font "${id}" not found`)
    }
    if (dto.name !== undefined && dto.name.trim()) {
      await this.fontRepo.update(id, { name: dto.name.trim() })
    }
    const updated = await this.fontRepo.findOneOrFail({ where: { id } })
    return {
      id: updated.id,
      name: updated.name,
      filename: updated.filename,
      source: 'custom',
    }
  }

  async delete(id: string): Promise<void> {
    if (id === 'default') {
      throw new BadRequestException('Cannot delete built-in font')
    }
    const row = await this.fontRepo.findOne({ where: { id } })
    if (!row) {
      throw new NotFoundException(`Font "${id}" not found`)
    }
    await this.fontRepo.delete(id)
    const filePath = join(paths.fontsDir, row.filename)
    await unlink(filePath).catch(() => {})
  }
}
