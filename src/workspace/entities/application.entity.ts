import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Discussion } from './discussion.entity';
import { Indicator } from './indicator.entity';

@Entity('applications')
export class Application {
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

  @ManyToMany(() => Indicator, (indicator) => indicator.applications)
  @JoinTable({
    name: 'application_indicators',
    joinColumn: { name: 'application_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'indicator_id', referencedColumnName: 'id' },
  })
  indicators!: Indicator[];

  @ManyToMany(() => Discussion, (discussion) => discussion.applications)
  discussions!: Discussion[];
}
