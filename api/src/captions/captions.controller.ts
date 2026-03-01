import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { CaptionsService } from './captions.service'
import type { Lang } from './captions.service'
import { PipelineService } from '../pipeline/pipeline.service'

@Controller('api/captions')
export class CaptionsController {
  constructor(
    private readonly captionsService: CaptionsService,
    private readonly pipelineService: PipelineService,
  ) {}

  // ---------------------------------------------------------------------------
  // Suggestion endpoints
  // ---------------------------------------------------------------------------

  @Get('suggest')
  suggest(
    @Query('niche') niche = 'gaming',
    @Query('model') model = 'llama3',
    @Query('lang') lang: Lang = 'auto',
  ) {
    return this.captionsService.suggestCaption(niche, model, lang)
  }

  @Get('script')
  script(
    @Query('niche') niche = 'gaming',
    @Query('model') model = 'llama3',
    @Query('lang') lang: Lang = 'auto',
  ) {
    return this.captionsService.suggestScript(niche, model, lang)
  }

  @Get('script/negative')
  negativeScript(
    @Query('niche') niche = 'gaming',
    @Query('model') model = 'llama3',
    @Query('lang') lang: Lang = 'auto',
  ) {
    return this.captionsService.suggestNegativeScript(niche, model, lang)
  }

  @Get('suggest/negative')
  negativeCaption(
    @Query('niche') niche = 'gaming',
    @Query('model') model = 'llama3',
    @Query('lang') lang: Lang = 'auto',
  ) {
    return this.captionsService.suggestNegativeCaption(niche, model, lang)
  }

  @Get('models')
  models() {
    return this.captionsService.listOllamaModels()
  }

  // ---------------------------------------------------------------------------
  // Niche CRUD
  // ---------------------------------------------------------------------------

  @Get('niches')
  listNiches() {
    return this.captionsService.listNiches()
  }

  @Post('niches')
  async createNiche(
    @Body() body: { label: string; keywords: string; rssFeeds: string[] },
  ) {
    const niche = await this.captionsService.createNiche(body.label, body.keywords, body.rssFeeds)
    await this.pipelineService.ensurePipelineForNiche(niche.id, niche.label)
    return niche
  }

  @Put('niches/:id')
  async updateNiche(
    @Param('id') id: string,
    @Body() body: { label?: string; keywords?: string; rssFeeds?: string[] },
  ) {
    return this.captionsService.updateNiche(id, body.label, body.keywords, body.rssFeeds)
  }

  @Delete('niches/:id')
  async deleteNiche(@Param('id') id: string) {
    await this.captionsService.deleteNiche(id)
    return { deleted: true }
  }
}
