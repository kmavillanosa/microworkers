import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { StudioJwtAuthGuard } from './studio-jwt-auth.guard';
import { StudioUserEntity } from './studio-user.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([StudioUserEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn =
          configService.get<string>('STUDIO_JWT_EXPIRES_IN') ||
          configService.get<string>('JWT_EXPIRES_IN') ||
          '7d';

        return {
          secret:
            configService.get<string>('STUDIO_JWT_SECRET') ||
            configService.get<string>('JWT_SECRET') ||
            'studio-secret-change-in-production',
          signOptions: {
            expiresIn: expiresIn as any,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, StudioJwtAuthGuard],
  exports: [AuthService, StudioJwtAuthGuard, JwtModule],
})
export class AuthModule {}
