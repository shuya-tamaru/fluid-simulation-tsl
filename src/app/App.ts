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
import * as THREE from "three/webgpu";
import { float, Fn, texture, uv, vec2 } from "three/tsl";
import { gaussianBlur } from "three/examples/jsm/tsl/display/GaussianBlurNode.js";

export class App {
  private sceneManager!: SceneManager;
  private cameraManager!: CameraManager;
  private rendererManager!: RendererManager;
  private controlsManager!: ControlsManager;
  private boxBoundary!: BoxBoundary;
  private particles!: Particles;
  private paramsControls!: ParamsControls;
  private stats!: Stats;

  private width: number;
  private height: number;
  private aspect: number;

  private animationId?: number;

  //config
  private sphConfig!: SPHConfig;
  private boundaryConfig!: BoundaryConfig;

  private debugScene!: THREE.Scene;
  private debugCamera!: THREE.OrthographicCamera;
  private debugQuad!: THREE.Mesh;

  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspect = this.width / this.height;

    this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    await this.initializeManagers();
    this.setupDebugView();

    this.addObjectsToScene();
    this.initializeStats();
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
      this.boundaryConfig,
      this.aspect
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
  }

  private handleResize = (): void => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspect = this.width / this.height;

    this.cameraManager.updateAspect(this.aspect);
    this.rendererManager.resize(this.width, this.height);
    this.updateDebugView();
  };

  private setupDebugView() {
    this.debugScene = new THREE.Scene();

    this.debugCamera = new THREE.OrthographicCamera(
      -this.aspect,
      this.aspect,
      1,
      -1,
      0,
      10
    );
    this.debugCamera.position.z = 2;

    const mat = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
    });
    mat.fragmentNode = Fn(() => {
      let texUV = uv().toVar();
      texUV.y = float(1.0).sub(texUV.y);
      const tex = texture(this.particles.getRenderTexture(), texUV);
      const direction = vec2(1.0, 1.0); // ブラー方向（1,0）→横 / (0,1)→縦 / (1,1)→全体
      return gaussianBlur(tex, direction, 3);
    })();

    this.debugQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * this.aspect, 2),
      mat
    );

    this.debugScene.add(this.debugQuad);
  }

  private updateDebugView(): void {
    // Update debug camera for new aspect ratio
    this.debugCamera.left = -this.aspect;
    this.debugCamera.right = this.aspect;
    this.debugCamera.updateProjectionMatrix();

    // Update debug quad geometry for new aspect ratio
    this.debugQuad.geometry.dispose();
    this.debugQuad.geometry = new THREE.PlaneGeometry(2 * this.aspect, 2);
  }

  private animate = async (): Promise<void> => {
    this.animationId = requestAnimationFrame(this.animate);
    if (this.stats) this.stats.begin();
    // this.controlsManager.update();
    await this.particles.renderParticlesToRT();
    await this.particles.compute();
    // this.rendererManager.render(
    //   this.sceneManager.scene,
    //   this.cameraManager.camera
    // );
    this.rendererManager.render(this.debugScene, this.debugCamera);

    if (this.stats) this.stats.end();
  };

  private startAnimation(): void {
    this.animate();
  }

  public dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener("resize", this.handleResize);
    if (this.stats && this.stats.dom && this.stats.dom.parentElement) {
      this.stats.dom.parentElement.removeChild(this.stats.dom);
    }
  }

  public getParamsControls(): ParamsControls {
    return this.paramsControls;
  }
}
