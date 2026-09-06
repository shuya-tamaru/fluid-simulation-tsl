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
    this.gui.add(boundaryConfig, "showFrameInWater").name("Show frame in Water")
      .onChange(() => this.boxBoundary.updateVisibility());
    this.gui.add(boundaryConfig.topCollision, "value").name("Top collision");
    const waterFolder = this.gui.addFolder("Water");
    waterFolder.addColor(water, "color").name("Color");
    waterFolder.add(water, "density", 0.2, 2.5, 0.05).name("Density");
    const surfacePreset = { preset: "Detailed" };
    waterFolder.add(surfacePreset, "preset", ["Detailed", "Reference"]).name("Surface preset")
      .onChange((value: string) => {
        Object.assign(water, value === "Reference"
          ? { smoothing: 0.65, depthSigma: 0.55, smoothingPasses: 3 }
          : { smoothing: 0.48, depthSigma: 0.32, smoothingPasses: 2 });
        waterFolder.controllersRecursive().forEach(controller => controller.updateDisplay());
      });
    waterFolder.add(water, "smoothing", 0.2, 0.9, 0.01).name("Surface smoothing");
    waterFolder.add(water, "depthSigma", 0.1, 0.8, 0.01).name("Depth tolerance");
    const motion = this.gui.addFolder("Motion");
    motion.add(sphConfig, "viscosityMu", 0.02, 0.5, 0.01).name("Viscosity");
    motion.add(sphConfig, "damping", 0, 0.3, 0.01).name("Bulk damping");
    motion.close();
    const effects = this.gui.addFolder("Whitewater");
    effects.add(whitewater, "enabled").name("Spray & foam");
    effects.add(whitewater, "appearance", ["Refined", "Reference"]).name("Appearance");
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
