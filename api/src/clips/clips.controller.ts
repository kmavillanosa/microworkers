import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import type { FileFilterCallback } from 'multer'
import { mkdir } from 'node:fs/promises'
import { paths } from '../paths'
import { ClipsService } from './clips.service'
import { UpdateClipDto } from './dto/update-clip.dto'

const allowedExt = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi'])
const GAME = 'game' as const

@Controller('api/clips')
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  @Get()
  async list() {
    return this.clipsService.list(GAME)
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(@UploadedFile() file: Express.Multer.File) {
    return this.clipsService.upload(GAME, file)
  }

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      storage: diskStorage({
        destination: async (
          _req: Request,
          _file: Express.Multer.File,
          cb: (error: Error | null, destination: string) => void,
        ) => {
          try {
            await mkdir(paths.clipsDir, { recursive: true })
            cb(null, paths.clipsDir)
          } catch (error) {
            cb(error as Error, paths.clipsDir)
          }
        },
        filename: (
          _req: Request,
          file: Express.Multer.File,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          const ext = extname(file.originalname).toLowerCase()
          const safeExt = allowedExt.has(ext) ? ext : '.mp4'
          cb(null, `clip-${Date.now()}-${randomUUID()}${safeExt}`)
        },
      }),
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: FileFilterCallback,
      ) => {
        const ext = extname(file.originalname).toLowerCase()
        if (!allowedExt.has(ext)) {
          cb(null, false)
          return
        }
        cb(null, true)
      },
    }),
  )
  async upload(@UploadedFiles() files: Array<Express.Multer.File>) {
    if (!files?.length) {
      throw new BadRequestException('No files uploaded')
    }
    for (const file of files) {
      await this.clipsService.registerFromDisk(GAME, file.filename)
    }
    return {
      uploaded: files.map((file) => ({
        name: file.filename,
        size: file.size,
        url: `/media/clips/${file.filename}`,
      })),
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateClipDto,
  ) {
    return this.clipsService.update(GAME, id, body)
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.clipsService.delete(GAME, id)
  }
}
