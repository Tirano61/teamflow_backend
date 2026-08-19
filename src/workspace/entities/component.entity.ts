import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { WorkModule } from './work-module.entity';
import { Discussion } from './discussion.entity';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity('components')
@Index('idx_components_organization_id', ['organizationId'])
export class Component {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, (organization) => organization.components, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

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

  @ManyToMany(() => WorkModule, (workModule) => workModule.components)
  workModules!: WorkModule[];

  @ManyToMany(() => Discussion, (discussion) => discussion.components)
  discussions!: Discussion[];
}
