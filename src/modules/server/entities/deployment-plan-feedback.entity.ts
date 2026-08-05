import { BaseEntity, Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('deployment_plan_feedback')
class DeploymentPlanFeedbackEntity extends BaseEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  plan_id: string;

  @Column()
  feedback: string;

  @Column()
  created_at: Date;
}

export default DeploymentPlanFeedbackEntity;
