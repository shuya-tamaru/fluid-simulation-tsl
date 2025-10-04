import GUI from "lil-gui";
import type { BoxBoundary } from "../simulation/boundaries/BoxBoundary";
import type { Particles } from "../simulation/sph/Particles";
import type { SPHConfig } from "../simulation/sph/SPHConfig";
import type { BoundaryConfig } from "../simulation/boundaries/BoundaryConfig";

export class ParamsControls {
  private gui: GUI;
  private boundaryConfig!: BoundaryConfig;
  private sphConfig!: SPHConfig;
  private boxBoundary: BoxBoundary;
  private particles: Particles;

  constructor(
    boxBoundary: BoxBoundary,
    particles: Particles,
    boundaryConfig: BoundaryConfig,
    sphConfig: SPHConfig
  ) {
    this.gui = new GUI();
    this.boxBoundary = boxBoundary;
    this.particles = particles;
    this.boundaryConfig = boundaryConfig;
    this.sphConfig = sphConfig;
    this.initialize();
  }

  initialize() {
    this.gui
      .add(this.boundaryConfig.width, "value", 10, 32, 0.2)
      .name("Box Width")
      .onChange(() => {
        this.boxBoundary.updateSizes();
      });
    this.gui
      .add(this.boundaryConfig.depth, "value", 10, 32, 0.2)
      .name("Box Depth")
      .onChange(() => {
        this.boxBoundary.updateSizes();
      });
    this.gui
      .add(this.sphConfig, "particleCount", 1000, 20000, 1000)
      .name("Particle Count")
      .onChange(async (value: number) => {
        await this.particles.updateParticleCount(value);
      });
  }
}
