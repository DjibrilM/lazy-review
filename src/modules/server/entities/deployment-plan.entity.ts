import { BaseEntity, Entity, Column, PrimaryColumn, Unique } from 'typeorm';

@Entity('deployment_plans')
@Unique(['project_id', 'version'])
class DeploymentPlanEntity extends BaseEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  project_id: string;

  @Column()
  version: number;

  @Column()
  status: string; // DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, SUPERSEDED, EXECUTING, COMPLETED, FAILED

  @Column({ nullable: true })
  summary: string;

  @Column({ nullable: true })
  generated_by: string;

  @Column()
  created_at: Date;

  @Column({ nullable: true })
  approved_at: Date;
}

export default DeploymentPlanEntity;
