import { WhitewaterRenderer, type WhitewaterSettings } from "./WhitewaterRenderer";
import type { BoundaryConfig } from "../simulation/boundaries/BoundaryConfig";
import type * as THREE from "three/webgpu";
import type { Particles } from "../simulation/sph/Particles";
import type { SPHConfig } from "../simulation/sph/SPHConfig";
import { ParticleRenderer } from "./ParticleRenderer";
import { WaterRenderer, type WaterSettings } from "./WaterRenderer";

export type RenderMode = "particles" | "water";

export class FluidRenderer {
  private particles: ParticleRenderer;
  private water: WaterRenderer;
  private whitewater: WhitewaterRenderer;
  private mode: RenderMode = "water";

  constructor(scene: THREE.Scene, simulation: Particles, config: SPHConfig, boundary: BoundaryConfig, settings: WhitewaterSettings, waterSettings: WaterSettings) {
    this.particles = new ParticleRenderer(simulation, config);
    this.whitewater = new WhitewaterRenderer(simulation, config, boundary, settings);
    this.water = new WaterRenderer(simulation, this.whitewater, waterSettings);
    this.particles.addToScene(scene);
    this.setMode(this.mode);
  }

  setMode(mode: RenderMode) {
    this.mode = mode;
    this.particles.visible = mode === "particles";
  }

  setDebug(value: number) { this.water.setDebug(value); }

  async render(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    await this.whitewater.update(renderer);
    if (this.mode === "water") await this.water.render(renderer, scene, camera);
    else await renderer.renderAsync(scene, camera);
  }

  dispose() {
    this.particles.dispose();
    this.water.dispose();
    this.whitewater.dispose();
  }
}
