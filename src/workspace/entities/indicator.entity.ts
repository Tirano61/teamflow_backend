import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
} from 'typeorm';
import { Application } from './application.entity';
import { Discussion } from './discussion.entity';

@Entity('indicators')
export class Indicator {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 150 })
  name!: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToMany(() => Application, (application) => application.indicators)
  applications!: Application[];

  @ManyToMany(() => Discussion, (discussion) => discussion.indicators)
  discussions!: Discussion[];
}
