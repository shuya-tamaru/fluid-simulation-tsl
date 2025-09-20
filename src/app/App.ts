import { SceneManager } from "./core/Scene";
import { CameraManager } from "./core/Camera";
import { RendererManager } from "./core/Renderer";
import { ControlsManager } from "./core/Controls";
import { LightingManager } from "./core/Lighting";
import { BoxBoundary } from "./simulation/boundaries/BoxBoundary";
import { Particles } from "./simulation/sph/Particles";

export class App {
  private sceneManager!: SceneManager;
  private cameraManager!: CameraManager;
  private rendererManager!: RendererManager;
  private controlsManager!: ControlsManager;
  private lightingManager!: LightingManager;
  private boxBoundary!: BoxBoundary;
  private particles!: Particles;

  private width: number;
  private height: number;
  private aspect: number;

  private animationId?: number;

  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspect = this.width / this.height;

    this.initializeApp();
  }

  private initializeApp(): void {
    this.initializeManagers();
    this.setupScene();
    this.setupEventListeners();
    this.startAnimation();
  }

  private initializeManagers() {
    this.sceneManager = new SceneManager();
    this.cameraManager = new CameraManager(this.aspect);
    this.rendererManager = new RendererManager(this.width, this.height);
    this.controlsManager = new ControlsManager(
      this.cameraManager.camera,
      this.rendererManager.renderer.domElement
    );
    this.lightingManager = new LightingManager();
    this.boxBoundary = new BoxBoundary();
    this.particles = new Particles(
      this.boxBoundary.getSizes().width,
      this.boxBoundary.getSizes().height,
      this.boxBoundary.getSizes().depth,
      this.rendererManager.renderer
    );
    this.particles.initialize();
  }

  private setupScene(): void {
    this.lightingManager.addToScene(this.sceneManager.scene);
    this.boxBoundary.addToScene(this.sceneManager.scene);
    this.particles.addToScene(this.sceneManager.scene);
  }

  private setupEventListeners(): void {
    window.addEventListener("resize", this.handleResize.bind(this));
  }

  private handleResize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspect = this.width / this.height;

    this.cameraManager.updateAspect(this.aspect);
    this.rendererManager.resize(this.width, this.height);
  }

  private animate = async (): Promise<void> => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controlsManager.update();
    await this.particles.compute();
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
}
