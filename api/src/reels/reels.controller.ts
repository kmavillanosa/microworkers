import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateReelDto } from './dto/create-reel.dto';
import { InstallPiperVoiceDto } from './dto/install-piper-voice.dto';
import { MarkReelUploadedDto } from './dto/mark-reel-uploaded.dto';
import { UpdateShowcaseDto } from './dto/update-showcase.dto';
import { ReelsService } from './reels.service';

@Controller('api/reels')
export class ReelsController {
  constructor(private readonly reelsService: ReelsService) {}

  @Post()
  async create(@Body() body: CreateReelDto) {
    const job = await this.reelsService.createJob(body);
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
    };
  }

  @Get('jobs/:jobId')
  async getJob(@Param('jobId') jobId: string) {
    return this.reelsService.getJob(jobId);
  }

  @Get()
  async list() {
    return this.reelsService.listReels();
  }

  @Get('showcase')
  async listShowcase() {
    return this.reelsService.listShowcaseReels();
  }

  @Patch(':reelId/showcase')
  async updateShowcase(
    @Param('reelId') reelId: string,
    @Body() body: UpdateShowcaseDto,
  ) {
    await this.reelsService.updateShowcase(reelId, {
      showcase: body.showcase,
      showcaseTitle: body.showcaseTitle,
      showcaseDescription: body.showcaseDescription,
    });
    return { ok: true };
  }

  @Post(':reelId/uploaded')
  async markUploaded(
    @Param('reelId') reelId: string,
    @Body() body: MarkReelUploadedDto,
  ) {
    return this.reelsService.markReelUploaded(reelId, {
      uploaded: body.uploaded ?? true,
      youtubeUrl: body.youtubeUrl,
    });
  }

  @Post('mark-all-uploaded')
  async markAllUploaded() {
    return this.reelsService.markAllUploaded();
  }

  @Get('voices')
  async listVoices() {
    return this.reelsService.listVoices();
  }

  @Get('fonts')
  async listFonts() {
    return this.reelsService.listFonts();
  }

  @Post('piper/install')
  async installPiperVoice(@Body() body: InstallPiperVoiceDto) {
    return this.reelsService.installPiperVoice(body.voiceId);
  }
}
