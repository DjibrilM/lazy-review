import { BaseEntity, Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
class ProjectEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  repository_url: string;

  @Column()
  repository_path: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;

  @Column({ type: 'json' })
  repositorySecrets: Record<string, string>;

  @Column({ type: 'json', nullable: true })
  pr_reviews: Record<string, any>;

  @Column({ nullable: true })
  ai_provider_id: string;

  @Column({ nullable: true })
  ai_model: string;

  @Column({ type: 'json', nullable: true })
  analysis: Record<string, any>;

  @Column({ default: 1 })
  indexing_version: number;

  @Column({ type: 'text', nullable: true })
  current_task: string | null;

  @Column({ default: false })
  deployed: boolean;

  @Column({ nullable: true })
  vps_ssh_key: string;

  @Column({ nullable: true })
  vps_host: string;

  @Column({ nullable: true })
  vps_username: string;

  @Column({ type: 'int', default: 22 })
  vps_port: number;

  @Column({ nullable: true })
  vps_password: string;

  @Column({ type: 'json', nullable: true })
  agent_messages: any[] | null;
}

export default ProjectEntity;
