import { MainModule } from '../../main.module.js';

export class DeploymentPlanServices {
  mainModule: MainModule;

  constructor(mainModule: MainModule) {
    this.mainModule = mainModule;
  }
}
