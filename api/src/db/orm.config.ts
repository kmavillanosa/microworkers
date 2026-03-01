import { ConfigService } from '@nestjs/config'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { DataSource, DataSourceOptions } from 'typeorm'
import { config as loadEnv } from 'dotenv'

loadEnv()

const configService = new ConfigService()

export const ormConfig: TypeOrmModuleOptions & DataSourceOptions = {
  type: 'mysql',
  host: configService.get<string>('TYPEORM_DATABASE_HOST'),
  port: 3306,
  username: configService.get<string>('TYPEORM_DATABASE_USERNAME'),
  password: configService.get<string>('TYPEORM_DATABASE_PASSWORD'),
  database: configService.get<string>('TYPEORM_DATABASE_NAME'),
  logging: false,
  synchronize: true,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
  migrationsTableName: 'migrations',
}

const dataSource = new DataSource(ormConfig)

export default dataSource

