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
import { Component } from './component.entity';

@Entity('work_modules')
export class WorkModule {
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

  @ManyToMany(() => Component, (component) => component.workModules)
  @JoinTable({
    name: 'work_module_components',
    joinColumn: { name: 'work_module_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'component_id', referencedColumnName: 'id' },
  })
  components!: Component[];

  @ManyToMany(() => Discussion, (discussion) => discussion.workModules)
  discussions!: Discussion[];
}
