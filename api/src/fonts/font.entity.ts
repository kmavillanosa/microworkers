import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('fonts')
export class FontEntity {
  @PrimaryColumn('varchar', { length: 255 })
  id: string

  @Column({ type: 'varchar', length: 255 })
  name: string

  @Column({ type: 'varchar', length: 255 })
  filename: string

  @Column({ type: 'varchar', length: 32 })
  created_at: string
}
