import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'
import { PipelineService } from './pipeline.service'
import type { Pipeline, PipelineUpsert } from './pipeline.service'

@Controller('api/pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get()
  list() {
    return this.pipelineService.listPipelines()
  }

  @Post()
  create(@Body() body: Partial<PipelineUpsert> & { label: string }) {
    return this.pipelineService.createPipeline(body)
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.pipelineService.getPipeline(id)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<PipelineUpsert>) {
    return this.pipelineService.updatePipeline(id, body)
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string) {
    await this.pipelineService.deletePipeline(id)
  }

  @Get(':id/status')
  status(@Param('id') id: string) {
    return this.pipelineService.getStatus(id)
  }

  @Post(':id/run')
  @HttpCode(202)
  run(
    @Param('id') id: string,
    @Query('forceReel') forceReel?: string,
  ) {
    const options = forceReel === 'true' ? { forceReel: true } : undefined
    void this.pipelineService.runPipeline(id, options)
    return { queued: true }
  }

  @Post('run-all')
  @HttpCode(202)
  runAll() {
    return this.pipelineService.runAll()
  }

  @Post('stop-all')
  @HttpCode(202)
  stopAll() {
    return this.pipelineService.stopAll()
  }

  @Post(':id/stop')
  @HttpCode(200)
  stop(@Param('id') id: string) {
    return this.pipelineService.stopPipeline(id)
  }
}
