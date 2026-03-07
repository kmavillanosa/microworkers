import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { StudioUserEntity } from './studio-user.entity';

type StudioAuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  pictureUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

type StudioAuthResponse = {
  accessToken: string;
  user: StudioAuthUser;
};

type GoogleUserInfo = {
  id?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(StudioUserEntity)
    private readonly studioUserRepository: Repository<StudioUserEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async loginWithGoogle(loginDto: GoogleAuthDto): Promise<StudioAuthResponse> {
    const googleUser = await this.fetchGoogleUserInfo(loginDto.accessToken);

    const email = googleUser.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Unable to retrieve email from Google');
    }

    const user = await this.studioUserRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Account not found. Please register first.');
    }

    user.google_id = googleUser.id ?? user.google_id;
    user.display_name = googleUser.name ?? user.display_name;
    user.given_name = googleUser.given_name ?? user.given_name;
    user.family_name = googleUser.family_name ?? user.family_name;
    user.picture_url = googleUser.picture ?? user.picture_url;
    user.last_login_at = new Date();

    const savedUser = await this.studioUserRepository.save(user);

    return {
      accessToken: this.generateAccessToken(savedUser),
      user: this.toStudioAuthUser(savedUser),
    };
  }

  async registerWithGoogle(
    registerDto: GoogleAuthDto,
  ): Promise<StudioAuthResponse> {
    const googleUser = await this.fetchGoogleUserInfo(registerDto.accessToken);

    const email = googleUser.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Unable to retrieve email from Google');
    }

    const existingUser = await this.studioUserRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const user = this.studioUserRepository.create({
      email,
      google_id: googleUser.id ?? null,
      display_name: googleUser.name ?? null,
      given_name: googleUser.given_name ?? null,
      family_name: googleUser.family_name ?? null,
      picture_url: googleUser.picture ?? null,
      last_login_at: new Date(),
    });

    const savedUser = await this.studioUserRepository.save(user);

    return {
      accessToken: this.generateAccessToken(savedUser),
      user: this.toStudioAuthUser(savedUser),
    };
  }

  async getProfile(userId: string): Promise<StudioAuthUser> {
    const user = await this.studioUserRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.toStudioAuthUser(user);
  }

  private async fetchGoogleUserInfo(
    accessToken: string,
  ): Promise<GoogleUserInfo> {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new UnauthorizedException('Invalid Google access token');
    }

    return response.json() as Promise<GoogleUserInfo>;
  }

  private generateAccessToken(user: StudioUserEntity): string {
    const payload = {
      sub: user.id,
      id: user.id,
      email: user.email,
      authProvider: 'google',
    };

    return this.jwtService.sign(payload);
  }

  private toStudioAuthUser(user: StudioUserEntity): StudioAuthUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      pictureUrl: user.picture_url,
      createdAt: user.created_at.toISOString(),
      lastLoginAt: user.last_login_at ? user.last_login_at.toISOString() : null,
    };
  }
}
