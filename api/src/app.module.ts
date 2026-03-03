import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { paths } from './paths';
import { ormConfig } from './db/orm.config';
import { AccountsController } from './accounts/accounts.controller';
import { SocialAccountEntity } from './accounts/social-account.entity';
import { AccountsService } from './accounts/accounts.service';
import { ReelsController } from './reels/reels.controller';
import { ReelsService } from './reels/reels.service';
import { ClipEntity } from './clips/clip.entity';
import { ClipsController } from './clips/clips.controller';
import { ClipsService } from './clips/clips.service';
import { OrderClipsController } from './order-clips/order-clips.controller';
import { YoutubeController } from './youtube/youtube.controller';
import { YoutubeService } from './youtube/youtube.service';
import { FacebookController } from './facebook/facebook.controller';
import { FacebookService } from './facebook/facebook.service';
import { CaptionsController } from './captions/captions.controller';
import { CaptionsService } from './captions/captions.service';
import { NicheEntity } from './captions/niche.entity';
import { PipelineController } from './pipeline/pipeline.controller';
import { PipelineConfigEntity } from './pipeline/pipeline-config.entity';
import { PipelineService } from './pipeline/pipeline.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { OrderEntity } from './orders/order.entity';
import { OrderPricingEntity } from './orders/order-pricing.entity';
import { PendingCheckoutEntity } from './orders/pending-checkout.entity';
import { FontEntity } from './fonts/font.entity';
import { FontsController } from './fonts/fonts.controller';
import { FontsService } from './fonts/fonts.service';
import { ImageCacheController } from './image-cache/image-cache.controller';
import { ImageCacheService } from './image-cache/image-cache.service';
import { PaymongoService } from './paymongo/paymongo.service';
import { PaymongoWebhookController } from './webhooks/paymongo-webhook.controller';
import { AppSettingEntity } from './settings/app-setting.entity';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';
import { ReelJobEntity } from './reels/reel-job.entity';
import { WorkerReelJobsController } from './worker/worker-reel-jobs.controller';
import { SlackService } from './slack/slack.service';
import { VoiceEntity } from './voices/voice.entity';
import { VoicesService } from './voices/voices.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () => ormConfig,
    }),
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderPricingEntity,
      PendingCheckoutEntity,
      SocialAccountEntity,
      NicheEntity,
      PipelineConfigEntity,
      FontEntity,
      ClipEntity,
      AppSettingEntity,
      ReelJobEntity,
      VoiceEntity,
    ]),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot(
      {
        rootPath: join(paths.outputDir),
        serveRoot: '/media/output',
      },
      {
        rootPath: join(paths.clipsDir),
        serveRoot: '/media/clips',
      },
      {
        rootPath: join(paths.orderClipsDir),
        serveRoot: '/media/order-clips',
      },
      {
        rootPath: join(paths.fontsDir),
        serveRoot: '/media/fonts',
      },
    ),
  ],
  controllers: [AccountsController, ReelsController, ClipsController, OrderClipsController, YoutubeController, FacebookController, CaptionsController, PipelineController, OrdersController, FontsController, ImageCacheController, PaymongoWebhookController, SettingsController, WorkerReelJobsController],
  providers: [AccountsService, ReelsService, ClipsService, YoutubeService, FacebookService, CaptionsService, PipelineService, OrdersService, FontsService, ImageCacheService, PaymongoService, SettingsService, SlackService, VoicesService],
})
export class AppModule {}
