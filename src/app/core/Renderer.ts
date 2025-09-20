import * as THREE from "three/webgpu";

export class RendererManager {
  public renderer: THREE.WebGPURenderer;

  constructor(width: number, height: number) {
    this.renderer = new THREE.WebGPURenderer();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    document.body.appendChild(this.renderer.domElement);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }

  async render(scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    await this.renderer.renderAsync(scene, camera);
  }
}
