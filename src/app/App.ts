import { SceneManager } from "./core/Scene";
import { CameraManager } from "./core/Camera";
import { RendererManager } from "./core/Renderer";
import { ControlsManager } from "./core/Controls";
import { BoxBoundary } from "./simulation/boundaries/BoxBoundary";
import { Particles } from "./simulation/sph/Particles";
import { ParamsControls } from "./utils/ParamsControls";
import { SPHConfig } from "./simulation/sph/SPHConfig";
import { BoundaryConfig } from "./simulation/boundaries/BoundaryConfig";

export class App {
  private sceneManager!: SceneManager;
  private cameraManager!: CameraManager;
  private rendererManager!: RendererManager;
  private controlsManager!: ControlsManager;
  private boxBoundary!: BoxBoundary;
  private particles!: Particles;
  private paramsControls!: ParamsControls;

  private width: number;
  private height: number;
  private aspect: number;

  private animationId?: number;

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
    await this.initializeManagers();

    this.addObjectsToScene();
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
    this.paramsControls = new ParamsControls(
      this.boxBoundary,
      this.particles,
      this.boundaryConfig,
      this.sphConfig
    );
  }

  private addObjectsToScene(): void {
    this.boxBoundary.addToScene(this.sceneManager.scene);
    this.particles.addToScene(this.sceneManager.scene);
  }

  private setupEventListeners(): void {
    window.addEventListener("resize", this.handleResize);
  }

  private handleResize = (): void => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspect = this.width / this.height;

    this.cameraManager.updateAspect(this.aspect);
    this.rendererManager.resize(this.width, this.height);
  };

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controlsManager.update();
    this.particles.compute();
    this.rendererManager.render(
      this.sceneManager.scene,
      this.cameraManager.camera
    );
  };

  private startAnimation(): void {
    this.animate();
  }

  public dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener("resize", this.handleResize);
  }

  public getParamsControls(): ParamsControls {
    return this.paramsControls;
  }
}
