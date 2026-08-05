import { BaseEntity, Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('deployment_plan_approvals')
class DeploymentPlanApprovalEntity extends BaseEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  plan_id: string;

  @Column()
  action: string; // APPROVED, REJECTED, REQUEST_CHANGES

  @Column({ nullable: true })
  notes: string;

  @Column()
  created_at: Date;
}

export default DeploymentPlanApprovalEntity;
