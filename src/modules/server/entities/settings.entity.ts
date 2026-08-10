import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('settings')
export default class SettingsEntity {
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column({ default: false })
  useExperimentalGpu: boolean;
}
