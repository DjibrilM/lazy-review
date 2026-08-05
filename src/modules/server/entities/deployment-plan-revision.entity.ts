import { BaseEntity, Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('deployment_plan_revisions')
class DeploymentPlanRevisionEntity extends BaseEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  project_id: string;

  @Column({ nullable: true, type: 'text' })
  from_plan_id: string | null;

  @Column()
  to_plan_id: string;

  @Column({ nullable: true })
  revision_reason: string;

  @Column()
  created_at: Date;
}

export default DeploymentPlanRevisionEntity;
