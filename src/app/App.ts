import { FixedStepClock } from "./core/FixedStepClock";
import type { WhitewaterSettings } from "./rendering/WhitewaterRenderer";
import { defaultWaterSettings } from "./rendering/WaterRenderer";
import { FluidRenderer, type RenderMode } from "./rendering/FluidRenderer";
import { SceneManager } from "./core/Scene";
import { CameraManager } from "./core/Camera";
import { RendererManager } from "./core/Renderer";
import { ControlsManager } from "./core/Controls";
import { BoxBoundary } from "./simulation/boundaries/BoxBoundary";
import { Particles } from "./simulation/sph/Particles";
import { ParamsControls } from "./utils/ParamsControls";
import { SPHConfig } from "./simulation/sph/SPHConfig";
import { BoundaryConfig } from "./simulation/boundaries/BoundaryConfig";
import Stats from "three/addons/libs/stats.module.js";

export class App {
  private sceneManager!: SceneManager;
  private cameraManager!: CameraManager;
  private rendererManager!: RendererManager;
  private controlsManager!: ControlsManager;
  private boxBoundary!: BoxBoundary;
  private particles!: Particles;
  private paramsControls!: ParamsControls;
  private stats!: Stats;
  private fluidRenderer!: FluidRenderer;
  private renderMode: RenderMode = "water";
  private pendingParticleCount?: number;
  private pendingSplash = false;
  private whitewaterSettings: WhitewaterSettings = { enabled: true, amount: 1, appearance: "Refined" };
  private waterSettings = defaultWaterSettings();
  private disposed = false;
  private debugSelect!: HTMLSelectElement;
  private debugMode = 0;
  private modeButton!: HTMLButtonElement;
  private controlBar!: HTMLDivElement;
  private appTitle!: HTMLDivElement;


  private width: number;
  private height: number;
  private aspect: number;

  private animationId?: number;
  private clock = new FixedStepClock();

  //config
  private sphConfig!: SPHConfig;
  private boundaryConfig!: BoundaryConfig;

  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspect = this.width / this.height;

    this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    (window as unknown as { __fluidApp: App }).__fluidApp = this; // debug handle

    await this.initializeManagers();

    this.addObjectsToScene();
    this.initializeStats();
    this.initializeModeSwitch();
    this.setupEventListeners();
    this.startAnimation();
  }

  private async initializeManagers() {
    this.sceneManager = new SceneManager();
    this.cameraManager = new CameraManager(this.aspect);
    this.rendererManager = new RendererManager(this.width, this.height);
    this.controlsManager = new ControlsManager(
      this.cameraManager.camera,
      this.rendererManager.renderer.domElement
    );
    this.boundaryConfig = new BoundaryConfig();
    this.boxBoundary = new BoxBoundary(this.boundaryConfig);
    this.sphConfig = new SPHConfig();
    this.particles = new Particles(
      this.rendererManager.renderer,
      this.sphConfig,
      this.boundaryConfig
    );
    await this.particles.initialize();
    await this.particles.refreshSpatialData();
    this.paramsControls = new ParamsControls(
      this.boxBoundary,
      this.boundaryConfig,
      this.sphConfig,
      (count) => { this.pendingParticleCount = count; },
      this.whitewaterSettings,
      this.waterSettings
    );
  }

  private addObjectsToScene(): void {
    this.boxBoundary.addToScene(this.sceneManager.scene);
    this.boxBoundary.setWaterMode(this.renderMode === "water");
    this.fluidRenderer = new FluidRenderer(
      this.sceneManager.scene, this.particles, this.sphConfig, this.boundaryConfig,
      this.whitewaterSettings, this.waterSettings
    );
  }

  private initializeModeSwitch() {
    this.controlBar = document.createElement("div");
    this.controlBar.className = "control-bar";

    const splashButton = document.createElement("button");
    splashButton.className = "splash-button";
    splashButton.type = "button";
    splashButton.textContent = "💦 Splash";
    splashButton.setAttribute("aria-label", "Trigger a splash");
    splashButton.onclick = () => { this.pendingSplash = true; };
    this.controlBar.appendChild(splashButton);

    // Both mode names stay visible; a sliding knob shows which one is live.
    this.modeButton = document.createElement("button");
    this.modeButton.className = "render-mode-switch";
    this.modeButton.type = "button";
    this.modeButton.setAttribute("role", "switch");
    this.modeButton.setAttribute("aria-label", "Particles view");
    this.modeButton.title = "Switch between the shaded water and the raw particles";
    const waterLabel = document.createElement("span");
    waterLabel.className = "mode-label";
    waterLabel.textContent = "Water";
    const track = document.createElement("span");
    track.className = "mode-track";
    track.appendChild(document.createElement("span")).className = "mode-knob";
    const particlesLabel = document.createElement("span");
    particlesLabel.className = "mode-label";
    particlesLabel.textContent = "Particles";
    this.modeButton.append(waterLabel, track, particlesLabel);
    const syncModeSwitch = () => {
      const isWater = this.renderMode === "water";
      this.modeButton.setAttribute("aria-checked", String(!isWater));
      this.modeButton.classList.toggle("particles", !isWater);
      waterLabel.classList.toggle("active", isWater);
      particlesLabel.classList.toggle("active", !isWater);
      this.debugSelect.hidden = !isWater;
    };
    this.modeButton.onclick = () => {
      this.renderMode = this.renderMode === "particles" ? "water" : "particles";
      this.sceneManager.setWaterEnvironment(this.renderMode === "water");
      this.fluidRenderer.setMode(this.renderMode);
      this.boxBoundary.setWaterMode(this.renderMode === "water");
      this.fluidRenderer.setDebug(this.debugMode);
      syncModeSwitch();
    };
    this.controlBar.appendChild(this.modeButton);

    this.debugSelect = document.createElement("select");
    this.debugSelect.className = "water-debug";
    this.debugSelect.setAttribute("aria-label", "Water display");
    ["Surface", "Normals", "Depth", "Thickness"].forEach((label, index) => {
      this.debugSelect.add(new Option(label, String(index)));
    });
    this.debugSelect.onchange = () => {
      this.debugMode = Number(this.debugSelect.value);
      this.fluidRenderer.setDebug(this.debugMode);
    };
    this.controlBar.appendChild(this.debugSelect);
    syncModeSwitch();
    document.body.appendChild(this.controlBar);

    this.appTitle = document.createElement("div");
    this.appTitle.className = "app-title";
    const heading = document.createElement("span");
    heading.textContent = "SPH Fluid Simulation";
    const subheading = document.createElement("small");
    subheading.textContent = "Three.js TSL · WebGPU";
    this.appTitle.append(heading, subheading);
    document.body.appendChild(this.appTitle);
  }

  private initializeStats(): void {
    this.stats = new Stats();
    // 0: fps, 1: ms, 2: mb. デフォルト: 0
    this.stats.showPanel(0);
    Object.assign(this.stats.dom.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      zIndex: "10000",
    });
    document.body.appendChild(this.stats.dom);
  }

  private setupEventListeners(): void {
    window.addEventListener("resize", this.handleResize);
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  private handleResize = (): void => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspect = this.width / this.height;

    this.cameraManager.updateAspect(this.aspect);
    this.rendererManager.resize(this.width, this.height);
  };

  private handleVisibility = () => { this.clock.reset(); };

  private animate = async (timestamp: number): Promise<void> => {
    if (this.disposed) return;
    if (this.pendingParticleCount !== undefined) {
      const count = this.pendingParticleCount;
      this.pendingParticleCount = undefined;
      this.fluidRenderer.dispose();
      await this.particles.updateParticleCount(count);
      await this.particles.refreshSpatialData();
      this.clock.reset();
      this.fluidRenderer = new FluidRenderer(
        this.sceneManager.scene, this.particles, this.sphConfig, this.boundaryConfig,
        this.whitewaterSettings, this.waterSettings
      );
      this.sceneManager.setWaterEnvironment(this.renderMode === "water");
      this.fluidRenderer.setMode(this.renderMode);
      this.boxBoundary.setWaterMode(this.renderMode === "water");
      this.fluidRenderer.setDebug(this.debugMode);
      this.debugSelect.hidden = this.renderMode !== "water";
    }
    if (this.stats) this.stats.begin();
    this.controlsManager.update();
    const steps = document.hidden ? 0 : this.clock.advance(timestamp);
    for (let step = 0; step < steps; step++) {
      if (this.pendingSplash) {
        this.pendingSplash = false;
        await this.particles.splash();
      }
      await this.particles.compute();

    }
    if (steps > 0) await this.fluidRenderer.update(this.rendererManager.renderer, steps * this.sphConfig.delta);
    await this.fluidRenderer.render(
      this.rendererManager.renderer,
      this.sceneManager.scene,
      this.cameraManager.camera
    );
    if (this.stats) this.stats.end();
    if (!this.disposed) this.animationId = requestAnimationFrame(this.animate);
  };

  private startAnimation(): void {
    this.animationId = requestAnimationFrame(this.animate);
  }

  public dispose(): void {
    this.disposed = true;
    this.controlBar?.remove();
    this.appTitle?.remove();
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    if (this.stats && this.stats.dom && this.stats.dom.parentElement) {
      this.stats.dom.parentElement.removeChild(this.stats.dom);
    }
  }

  public getParamsControls(): ParamsControls {
    return this.paramsControls;
  }
}
