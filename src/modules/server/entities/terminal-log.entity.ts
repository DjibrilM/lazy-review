import { BaseEntity, Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
class TerminalLogEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column({ default: 'system' })
  stream: string; // 'stdout' | 'stderr' | 'system'

  @Column({ type: 'text' })
  text: string;

  @CreateDateColumn()
  created_at: Date;
}

export default TerminalLogEntity;
