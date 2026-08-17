import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('settings')
export default class SettingsEntity {
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column({ default: false })
  useExperimentalGpu: boolean;

  @Column({ default: 0 })
  cpuCores: number;

  @Column({ default: 0 })
  totalRamGb: number;

  @Column({ default: 0 })
  gpuRamGb: number;

  @Column({ default: 0 })
  storageUsedGb: number;

  @Column({ default: 0 })
  storageTotalGb: number;

  @Column({ default: 128000 })
  contextSizeLimit: number;
}
