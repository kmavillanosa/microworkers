import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ClipsService } from '../clips/clips.service'
import { UpdateClipDto } from '../clips/dto/update-clip.dto'

const ORDER = 'order' as const

@Controller('api/order-clips')
export class OrderClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  @Get()
  async list() {
    return this.clipsService.list(ORDER)
  }

  @Get(':id/transcript')
  async getTranscript(@Param('id') id: string) {
    return this.clipsService.getTranscriptInfo(ORDER, id)
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    return this.clipsService.upload(ORDER, file)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateClipDto) {
    return this.clipsService.update(ORDER, id, body)
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.clipsService.delete(ORDER, id)
  }
}
