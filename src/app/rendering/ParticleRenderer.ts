import * as THREE from "three/webgpu";
import { float, Fn, instanceIndex, positionLocal, normalLocal, clamp, If, mix, max, vec3 } from "three/tsl";
import type { Particles } from "../simulation/sph/Particles";
import type { SPHConfig } from "../simulation/sph/SPHConfig";

export class ParticleRenderer {
  protected particles: Particles;
  private sphConfig: SPHConfig;
  private sphereGeometry!: THREE.SphereGeometry;
  protected sphereMaterial!: THREE.MeshBasicNodeMaterial;
  private sphereMesh!: THREE.InstancedMesh;

  constructor(particles: Particles, config: SPHConfig) {
    this.particles = particles;
    this.sphConfig = config;
    this.createGeometry();
    this.createMaterial();
    this.createMesh();
  }

  set visible(value: boolean) { this.sphereMesh.visible = value; }

  dispose() {
    this.sphereMesh.removeFromParent();
    this.sphereMesh.dispose();
    this.sphereGeometry.dispose();
    this.sphereMaterial.dispose();
  }

  private createGeometry() {
    this.sphereGeometry = new THREE.SphereGeometry(0.2, 6, 6);
  }

  protected createMaterial() {
    this.sphereMaterial = new THREE.MeshBasicNodeMaterial({
      color: 0xff00ff,
      side: THREE.DoubleSide,
    });

    this.sphereMaterial.positionNode = positionLocal.add(
      this.particles.getPositionsBuffer().toAttribute()
    );
    this.updateMaterialColorNode();
  }

  // @ts-ignore
  private getColorByVelocity = Fn(([speed]) => {
    const t = clamp(
      speed.div(float(this.sphConfig.maxSpeed)),
      float(0.0),
      float(1.0)
    ).toVar();
    const deep = vec3(0.0, 0.05, 0.9);
    const mid = vec3(0.0, 0.6, 0.8);
    const foam = vec3(1.0, 1.0, 1.0);

    const color = vec3(0.0).toVar();

    If(t.lessThan(float(0.85)), () => {
      const k = t.div(float(0.85));
      color.assign(mix(deep, mid, k));
    }).Else(() => {
      const k = t.sub(float(0.85)).div(float(0.15));
      color.assign(mix(mid, foam, k));
    });

    return color;
  });

  private updateMaterialColorNode() {
    this.sphereMaterial.colorNode = Fn(() => {
      const normal = normalLocal.toVar();
      const lightDir = vec3(0.3, 1.0, 0.5).normalize().toVar();
      const ambient = float(0.2).toVar();
      const diffuse = max(normal.dot(lightDir), float(0.0)).toVar();
      const speed = this.particles.getVelocitiesBuffer()
        .element(instanceIndex)
        .length()
        .toVar();
      // @ts-ignore
      const baseColor = this.getColorByVelocity(speed);
      const shaded = baseColor
        .mul(ambient.add(diffuse.mul(float(3.2))))
        .toVar();
      return shaded;
    })();
  }

  private createMesh() {
    this.sphereMesh = new THREE.InstancedMesh(
      this.sphereGeometry,
      this.sphereMaterial,
      this.particles.particleCount
    );
    this.sphereMesh.frustumCulled = false;
  }

  public addToScene(scene: THREE.Scene) {
    scene.add(this.sphereMesh);
  }

}
