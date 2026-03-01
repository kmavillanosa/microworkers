import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { UploadFacebookDto } from './dto/upload-facebook.dto'
import { UploadFacebookPhotoDto } from './dto/upload-facebook-photo.dto'
import { ShareFacebookPostDto } from './dto/share-facebook-post.dto'
import { FacebookService } from './facebook.service'

@Controller('api/facebook')
export class FacebookController {
  constructor(private readonly facebookService: FacebookService) {}

  @Get('status')
  getStatus() {
    return this.facebookService.getStatus()
  }

  @Get('auth-url')
  getAuthUrl(@Query('accountId') accountId: string) {
    return this.facebookService.getAuthorizationUrl(accountId)
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const result = await this.facebookService.handleOAuthCallback(code, state)
    return res.redirect(result.redirectUrl)
  }

  @Get('pages')
  getPages(@Query('accountId') accountId: string) {
    return this.facebookService.getPages(accountId)
  }

  @Post('upload')
  uploadToPage(@Body() body: UploadFacebookDto) {
    return this.facebookService.uploadToFacebookPage(body)
  }

  @Post('upload-photo')
  uploadPhotoToPage(@Body() body: UploadFacebookPhotoDto) {
    return this.facebookService.uploadPhotoToFacebookPage(body)
  }

  @Post('upload-instagram')
  uploadToInstagram(@Body() body: UploadFacebookDto) {
    return this.facebookService.uploadToInstagram(body)
  }

  @Post('share')
  sharePost(@Body() body: ShareFacebookPostDto) {
    return this.facebookService.sharePostToManagedPages(body)
  }
}
