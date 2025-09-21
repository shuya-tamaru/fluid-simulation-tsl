import GUI from "lil-gui";
import type { BoxBoundary } from "../simulation/boundaries/BoxBoundary";
import type { Particles } from "../simulation/sph/Particles";

export class ParamsControls {
  private gui: GUI;
  private boxBoundary: BoxBoundary;
  private particles: Particles;

  constructor(boxBoundary: BoxBoundary, particles: Particles) {
    this.gui = new GUI();
    this.boxBoundary = boxBoundary;
    this.particles = particles;
    this.initialize();
  }

  initialize() {
    this.gui
      .add(this.boxBoundary.getSizes(), "width", 10, 100, 0.2)
      .name("Box Width")
      .onChange((value: number) => {
        this.boxBoundary.updateSizes(
          value,
          this.boxBoundary.getSizes().height,
          this.boxBoundary.getSizes().depth
        );
      });
    this.gui
      .add(this.boxBoundary.getSizes(), "depth", 10, 100, 0.2)
      .name("Box Depth")
      .onChange((value: number) => {
        this.boxBoundary.updateSizes(
          this.boxBoundary.getSizes().width,
          this.boxBoundary.getSizes().height,
          value
        );
      });
    this.gui
      .add(this.particles, "particleCount", 1000, 20000, 1000)
      .name("Particle Count")
      .onChange(async (value: number) => {
        await this.particles.updateParticleCount(value);
      });
  }
}
