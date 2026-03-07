import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('studio_users')
export class StudioUserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  google_id!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  display_name!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  given_name!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  family_name!: string | null;

  @Column({ type: 'text', nullable: true })
  picture_url!: string | null;

  @Column({ type: 'datetime', nullable: true })
  last_login_at!: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at!: Date;
}
