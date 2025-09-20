import * as THREE from "three/webgpu";

export class LightingManager {
  private directionalLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;

  constructor() {
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    this.directionalLight.position.set(10, 10, 10);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.directionalLight);
    scene.add(this.ambientLight);
  }

  setDirectionalLightPosition(x: number, y: number, z: number): void {
    this.directionalLight.position.set(x, y, z);
  }

  setAmbientLightIntensity(intensity: number): void {
    this.ambientLight.intensity = intensity;
  }
}
