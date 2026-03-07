import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { StudioJwtAuthGuard } from './studio-jwt-auth.guard';

type AuthenticatedRequest = Request & {
  user?: {
    sub?: string;
    id?: string;
  };
};

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login/google')
  @HttpCode(HttpStatus.OK)
  async loginWithGoogle(@Body(ValidationPipe) loginDto: GoogleAuthDto) {
    return this.authService.loginWithGoogle(loginDto);
  }

  @Post('register/google')
  @HttpCode(HttpStatus.CREATED)
  async registerWithGoogle(@Body(ValidationPipe) registerDto: GoogleAuthDto) {
    return this.authService.registerWithGoogle(registerDto);
  }

  @Get('me')
  @UseGuards(StudioJwtAuthGuard)
  async getProfile(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub ?? req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.authService.getProfile(userId);
  }
}
