import {
  BaseEntity,
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
class AgentTaskEntity extends BaseEntity {
  @PrimaryColumn()
  id: string; // The UUID or ID assigned by the agent/gateway

  @Column()
  projectId: string;

  @Column()
  title: string;

  @Column()
  type: string; // 'read_file' | 'write_file' | 'shell' | 'plan' | 'report'

  @Column()
  status: string; // 'running' | 'success' | 'error'

  @Column({ nullable: true })
  path: string;

  @Column({ nullable: true })
  command: string;

  @Column({ type: 'text', nullable: true })
  output: string;

  @Column({ type: 'text', nullable: true })
  details: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

export default AgentTaskEntity;
