import { BaseEntity, Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('deployment_plan_artifacts')
class DeploymentPlanArtifactEntity extends BaseEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  plan_id: string;

  @Column()
  artifact_type: string; // PROJECT_ANALYSIS, INFRASTRUCTURE_PLAN, SECRET_REQUIREMENTS, WORKFLOW_PLAN, DEPLOYMENT_PLAN, COST_ESTIMATE

  @Column({ type: 'text' })
  content_json: string;

  @Column()
  created_at: Date;
}

export default DeploymentPlanArtifactEntity;
