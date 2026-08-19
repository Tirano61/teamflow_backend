import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  ManyToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Discussion } from './discussion.entity';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity('tags')
@Unique('uq_tags_organization_normalized_name', ['organizationId', 'normalizedName'])
@Index('idx_tags_organization_id', ['organizationId'])
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, (organization) => organization.tags, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ length: 100 })
  name!: string;

  @Column({ name: 'normalized_name', length: 100 })
  normalizedName!: string;

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToMany(() => Discussion, (discussion) => discussion.tags)
  discussions!: Discussion[];
}
