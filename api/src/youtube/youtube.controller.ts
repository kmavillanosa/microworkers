import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { UploadYoutubeDto } from './dto/upload-youtube.dto'
import { YoutubeService } from './youtube.service'

@Controller('api/youtube')
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @Get('status')
  getStatus() {
    return this.youtubeService.getStatus()
  }

  @Get('auth-url')
  getAuthUrl(@Query('accountId') accountId: string) {
    return this.youtubeService.getAuthorizationUrl(accountId)
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const result = await this.youtubeService.handleOAuthCallback(code, state)
    return res.redirect(result.redirectUrl)
  }

  @Post('upload')
  upload(@Body() body: UploadYoutubeDto) {
    return this.youtubeService.uploadReel(body)
  }
}
