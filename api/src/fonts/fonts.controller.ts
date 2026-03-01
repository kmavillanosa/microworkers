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
import { FontsService } from './fonts.service'
import { UpdateFontDto } from './dto/update-font.dto'

@Controller('api/fonts')
export class FontsController {
  constructor(private readonly fontsService: FontsService) {}

  @Get()
  async list() {
    const custom = await this.fontsService.listFromDb()
    const builtin: { id: string; name: string; filename?: string; source: 'builtin' }[] = [
      { id: 'default', name: 'System fallback', source: 'builtin' },
    ]
    const defaultFont = custom[0]?.id ?? 'default'
    return {
      defaultFont,
      items: [...custom, ...builtin],
    }
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    return this.fontsService.upload(file)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateFontDto) {
    return this.fontsService.update(id, body)
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.fontsService.delete(id)
  }
}
