import type { WhitewaterSettings } from "../rendering/WhitewaterRenderer";
import type { WaterSettings } from "../rendering/WaterRenderer";
import GUI from "lil-gui";
import type { BoxBoundary } from "../simulation/boundaries/BoxBoundary";
import type { SPHConfig } from "../simulation/sph/SPHConfig";
import type { BoundaryConfig } from "../simulation/boundaries/BoundaryConfig";

export class ParamsControls {
  private gui: GUI;
  private boundaryConfig!: BoundaryConfig;
  private sphConfig!: SPHConfig;
  private boxBoundary: BoxBoundary;
  private onParticleCountChange: (count: number) => void;

  constructor(
    boxBoundary: BoxBoundary,
    boundaryConfig: BoundaryConfig,
    sphConfig: SPHConfig,
    onParticleCountChange: (count: number) => void,
    whitewater: WhitewaterSettings,
    water: WaterSettings
  ) {
    this.gui = new GUI({ title: "Settings" });
    this.boxBoundary = boxBoundary;
    this.onParticleCountChange = onParticleCountChange;
    this.boundaryConfig = boundaryConfig;
    this.sphConfig = sphConfig;
    this.initialize();
    const waterFolder = this.gui.addFolder("Water");
    waterFolder.addColor(water, "color").name("Color");
    waterFolder.add(water, "density", 0.2, 2.5, 0.05).name("Density");
    const effects = this.gui.addFolder("Whitewater");
    effects.add(whitewater, "enabled").name("Spray & foam");
    effects.add(whitewater, "amount", 0, 2, 0.1).name("Emission");
  }

  initialize() {
    // One-sided piston: dragging the width pushes the right wall only,
    // so sweeping the slider works as a wave generator.
    this.gui
      .add(this.boundaryConfig.width, "value", 8, this.boundaryConfig.maxWidth, 0.1)
      .name("Box Width (piston)")
      .onChange(() => {
        this.boxBoundary.updateSizes();
      });
    this.gui
      .add(this.boundaryConfig.depth, "value", 6, this.boundaryConfig.maxDepth, 0.2)
      .name("Box Depth")
      .onChange(() => {
        this.boxBoundary.updateSizes();
      });
    this.gui
      .add(this.sphConfig, "particleCount", 1000, 40000, 1000)
      .name("Particle Count")
      .onFinishChange((value: number) => {
        this.onParticleCountChange(value);
      });
  }
}
