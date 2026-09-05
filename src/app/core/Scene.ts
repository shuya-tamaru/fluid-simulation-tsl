import * as THREE from "three/webgpu";
import { floor, mix, mod, smoothstep, normalWorldGeometry, positionWorld, vec3 } from "three/tsl";
import { waterEnvironment } from "../rendering/WaterEnvironment";

export class SceneManager {
  public scene: THREE.Scene;
  private waterStage = new THREE.Group();
  private sky = waterEnvironment(normalWorldGeometry);

  constructor() {
    this.scene = new THREE.Scene();
    const floorMaterial = new THREE.MeshBasicNodeMaterial();
    // Bright, cool studio tiles: airy stage that lets the blue water pop.
    const checker = mod(floor(positionWorld.x.div(3)).add(floor(positionWorld.z.div(3))), 2);
    floorMaterial.colorNode = mix(
      mix(vec3(0.31, 0.36, 0.4), vec3(0.52, 0.57, 0.6), checker),
      vec3(0.42, 0.48, 0.53), smoothstep(20, 55, positionWorld.xz.length())
    );
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), floorMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -8.55;
    this.waterStage.add(ground);
    this.scene.add(this.waterStage);
    this.setWaterEnvironment(true);
  }

  setWaterEnvironment(enabled: boolean) {
    this.waterStage.visible = enabled;
    this.scene.backgroundNode = enabled ? this.sky : null;
    this.scene.background = enabled ? null : new THREE.Color(0x000000);
  }

  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  remove(object: THREE.Object3D): void {
    this.scene.remove(object);
  }
}
