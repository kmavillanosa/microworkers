import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('app_settings')
export class AppSettingEntity {
  @PrimaryColumn('varchar', { length: 64 })
  key: string

  @Column({ type: 'text' })
  value: string
}
