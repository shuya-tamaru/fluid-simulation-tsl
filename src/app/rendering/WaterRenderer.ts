import * as THREE from "three/webgpu";
import {
  Fn, If, Discard, float, vec2, vec3, vec4, uv, uniform, texture,
  positionLocal, positionView, normalView, exp, max, abs, clamp, mix, pow, refract, reflect, min, smoothstep, floor, fract,
} from "three/tsl";
import { waterEnvironment } from "./WaterEnvironment";
import type { Particles } from "../simulation/sph/Particles";
import type { WhitewaterRenderer } from "./WhitewaterRenderer";

// The picked colour is what the water looks like at the reference thickness;
// extinction coefficients are derived from it, so the GUI colour is literal.
export interface WaterSettings { color: string; density: number; }
export const defaultWaterSettings = (): WaterSettings => ({ color: "#0273ac", density: 1 });
const REFERENCE_THICKNESS = 6;

/** Screen-space water: surface reconstruction, optical thickness and refraction. */
export class WaterRenderer {
  private scene = new THREE.Scene();
  private geometry = new THREE.SphereGeometry(0.32, 16, 12);
  private depthMaterial = new THREE.MeshBasicNodeMaterial();
  private mesh: THREE.InstancedMesh;
  private depthTarget = this.target(true);
  private horizontalTarget = this.target(false);
  private smoothTarget = this.target(false);
  private thicknessTarget = this.thicknessRenderTarget();
  private thicknessHorizontal = this.thicknessRenderTarget();
  private thicknessSmooth = this.thicknessRenderTarget();
  private thicknessMaterial = new THREE.MeshBasicNodeMaterial();
  private thicknessBlurMaterial = new THREE.NodeMaterial();
  private thicknessInput = texture(this.thicknessTarget.texture);
  private backgroundTarget = new THREE.RenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1),
  });
  // Whitewater billboards: (coverage, sun shading, linear view depth).
  private foamTarget = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType });
  private cameraWorld = uniform(new THREE.Matrix4());
  private input = texture(this.depthTarget.texture);
  private inverseSize = uniform(new THREE.Vector2(1, 1));
  private direction = uniform(new THREE.Vector2(1, 0));
  private projection = uniform(new THREE.Matrix4());
  private inverseProjection = uniform(new THREE.Matrix4());
  private focalPixels = uniform(1);
  private debug = uniform(0);
  private extinction = uniform(new THREE.Vector3(0.36, 0.11, 0.045));
  private inscatterTint = uniform(new THREE.Vector3(0.015, 0.1, 0.2));
  private settingsColor = new THREE.Color();
  private blurMaterial = new THREE.NodeMaterial();
  private surfaceMaterial = new THREE.NodeMaterial();
  private quad = new THREE.QuadMesh();
  private size = new THREE.Vector2();

  private whitewater: WhitewaterRenderer;
  private settings: WaterSettings;

  constructor(particles: Particles, whitewater: WhitewaterRenderer, settings: WaterSettings) {
    this.whitewater = whitewater;
    this.settings = settings;
    // Render nearest particle surfaces into linear view-space depth. Zero = empty.
    // Detached airborne particles (low density) shrink to droplet size, so
    // flying water reads as distinct drops instead of smoothed jelly blobs.
    const dropletScale = clamp(particles.getDensitiesBuffer().toAttribute().div(0.5), 0.45, 1);
    this.depthMaterial.positionNode = positionLocal.mul(dropletScale)
      .add(particles.getPositionsBuffer().toAttribute());
    this.depthMaterial.fragmentNode = vec4(positionView.z.negate(), 0, 0, 1);
    this.depthMaterial.toneMapped = false;
    this.mesh = new THREE.InstancedMesh(this.geometry, this.depthMaterial, particles.particleCount);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    // Sum approximate sphere chords along the viewing ray. The scale compensates
    // for overlapping SPH support volumes; it is an optical proxy, not a solid mesh.
    this.thicknessMaterial.positionNode = this.depthMaterial.positionNode;
    this.thicknessMaterial.fragmentNode = vec4(max(normalView.z, 0).mul(0.18), 0, 0, 1);
    this.thicknessMaterial.transparent = true;
    this.thicknessMaterial.blending = THREE.CustomBlending;
    this.thicknessMaterial.blendSrc = THREE.OneFactor;
    this.thicknessMaterial.blendDst = THREE.OneFactor;
    this.thicknessMaterial.blendEquation = THREE.AddEquation;
    this.thicknessMaterial.depthWrite = false;
    this.thicknessMaterial.depthTest = false;
    this.thicknessMaterial.toneMapped = false;

    this.blurMaterial.depthTest = false;
    this.blurMaterial.depthWrite = false;
    this.blurMaterial.toneMapped = false;
    this.blurMaterial.fragmentNode = Fn(() => {
      const center = this.input.sample(uv()).r.toVar();
      const result = float(0).toVar();
      If(center.greaterThan(0), () => {
        const sum = float(0).toVar();
        const weights = float(0).toVar();
        // A world-space footprint keeps the smoothing consistent while zooming.
        const radius = clamp(this.focalPixels.mul(0.65).div(center), 2, 16).toVar();
        for (let i = -8; i <= 8; i++) {
          const offset = this.direction.mul(this.inverseSize).mul(radius.mul(i / 8));
          const depth = this.input.sample(uv().add(offset)).r.toVar();
          If(depth.greaterThan(0), () => {
            const delta = depth.sub(center).div(0.55);
            const weight = exp(delta.mul(delta).mul(-0.5)).mul(Math.exp(-0.5 * (i / 4) ** 2));
            sum.addAssign(depth.mul(weight));
            weights.addAssign(weight);
          });
        }
        result.assign(sum.div(max(weights, 0.00001)));
      });
      return vec4(result, 0, 0, 1);
    })();

    const surface = texture(this.smoothTarget.texture);
    // Manual bilinear depth sampling works even without float32-filterable.
    // Keep the original mask at silhouettes so empty pixels never pull depth to zero.
    const sampleSurface = (coord: THREE.TSL.ShaderNodeObject<THREE.Node>) => {
      const pixel = coord.div(this.inverseSize).sub(0.5);
      const fraction = fract(pixel);
      const base = floor(pixel).add(0.5).mul(this.inverseSize);
      const a = surface.sample(base).r;
      const b = surface.sample(base.add(vec2(this.inverseSize.x, 0))).r;
      const c = surface.sample(base.add(vec2(0, this.inverseSize.y))).r;
      const d = surface.sample(base.add(this.inverseSize)).r;
      return min(min(a, b), min(c, d)).greaterThan(0).select(
        mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y),
        surface.sample(coord).r
      );
    };
    const opticalThickness = texture(this.thicknessSmooth.texture);
    const background = texture(this.backgroundTarget.texture);
    const backgroundDepth = texture(this.backgroundTarget.depthTexture!);
    this.thicknessBlurMaterial.depthTest = false;
    this.thicknessBlurMaterial.depthWrite = false;
    this.thicknessBlurMaterial.toneMapped = false;
    this.thicknessBlurMaterial.fragmentNode = Fn(() => {
      const center = surface.sample(uv()).r.toVar();
      const sum = float(0).toVar();
      const total = float(0).toVar();
      If(center.greaterThan(0), () => {
        for (let i = -6; i <= 6; i++) {
          const offset = this.direction.mul(this.inverseSize).mul(i);
          const sampleUV = uv().add(offset);
          const neighbour = surface.sample(sampleUV).r;
          const dz = neighbour.sub(center);
          const weight = exp(dz.mul(dz).mul(-2)).mul(Math.exp(-0.5 * (i / 3) ** 2))
            .mul(neighbour.greaterThan(0).select(1, 0));
          sum.addAssign(this.thicknessInput.sample(sampleUV).r.mul(weight));
          total.addAssign(weight);
        }
      });
      return vec4(sum.div(max(total, 0.00001)), 0, 0, 1);
    })();
    // Render-target UVs have their origin at the top in WebGPU.
    const viewPosition = (coord: THREE.TSL.ShaderNodeObject<THREE.Node>, depth: THREE.TSL.ShaderNodeObject<THREE.Node>) => {
      const ray = this.inverseProjection.mul(vec4(coord.x.mul(2).sub(1), coord.y.mul(-2).add(1), 0.5, 1));
      return ray.xyz.mul(depth.negate().div(ray.z));
    };
    const foam = texture(this.foamTarget.texture);
    // Lit whitewater tint: shadowed foam falls toward a cool ambient blue.
    // The stored shade is premultiplied by coverage, so unpack it against r.
    const foamTint = (data: THREE.TSL.ShaderNodeObject<THREE.Node>) =>
      mix(vec3(0.36, 0.46, 0.54), vec3(1.0, 0.99, 0.97), data.g.div(max(data.r, 0.001)));
    this.surfaceMaterial.fragmentNode = Fn(() => {
      const coord = uv();
      const depth = sampleSurface(coord).toVar();
      const foamData = foam.sample(coord).toVar();
      const hasFoam = foamData.b.greaterThan(0.001).and(foamData.r.greaterThan(0.003));
      const hasWater = depth.greaterThan(0);
      If(hasWater.not().and(hasFoam.not()), () => { Discard(); });
      // Clamp away from zero: foam-only pixels have no water depth, and a
      // zero view position would turn view/normal into NaN, which leaks into
      // the output even through mix() factors of zero.
      const center = viewPosition(coord, max(depth, 0.05)).toVar();
      const dx = vec2(this.inverseSize.x.mul(2), 0);
      const dy = vec2(0, this.inverseSize.y.mul(2));
      const left = sampleSurface(coord.sub(dx)).toVar();
      const right = sampleSurface(coord.add(dx)).toVar();
      const up = sampleSurface(coord.sub(dy)).toVar();
      const down = sampleSurface(coord.add(dy)).toVar();
      // Ignore empty neighbours and choose the less discontinuous one-sided slope.
      const useLeft = left.greaterThan(0).and(right.lessThanEqual(0).or(abs(left.sub(depth)).lessThan(abs(right.sub(depth)))));
      const useUp = up.greaterThan(0).and(down.lessThanEqual(0).or(abs(up.sub(depth)).lessThan(abs(down.sub(depth)))));
      const tangentX = useLeft.select(
        center.sub(viewPosition(coord.sub(dx), left)),
        viewPosition(coord.add(dx), right.greaterThan(0).select(right, depth)).sub(center)
      );
      const tangentY = useUp.select(
        center.sub(viewPosition(coord.sub(dy), up)),
        viewPosition(coord.add(dy), down.greaterThan(0).select(down, depth)).sub(center)
      );
      const view = center.negate().normalize().toVar();
      // Isolated droplet pixels have no valid neighbours: the cross product
      // degenerates and normalize() would return NaN (visible as black dots).
      const normalRaw = tangentY.cross(tangentX).toVar();
      const normal = normalRaw.dot(normalRaw).greaterThan(1e-12)
        .select(normalRaw.normalize(), view).toVar();
      const thickness = clamp(opticalThickness.sample(coord).r, 0, 20).toVar();
      const incident = view.negate();
      const refracted = refract(incident, normal, 1 / 1.333);
      const samplePoint = center.add(refracted.mul(min(thickness, 12)));
      const sampleClip = this.projection.mul(vec4(samplePoint, 1));
      const candidate = sampleClip.xy.div(max(sampleClip.w, 0.001)).mul(vec2(0.5, -0.5)).add(0.5);
      // Fade offsets at screen edges and reject samples from foreground geometry.
      const edge = min(min(coord.x, float(1).sub(coord.x)), min(coord.y, float(1).sub(coord.y)));
      const sampleUV = clamp(mix(coord, candidate, smoothstep(0, 0.06, edge)), vec2(0.002), vec2(0.998)).toVar();
      const sceneZ = backgroundDepth.sample(sampleUV).r;
      const scenePoint = this.inverseProjection.mul(vec4(sampleUV.x.mul(2).sub(1), sampleUV.y.mul(-2).add(1), sceneZ, 1));
      If(scenePoint.z.div(scenePoint.w).negate().lessThan(depth), () => { sampleUV.assign(coord); });
      // Beer-Lambert absorption: red attenuates faster than green and blue.
      // Tuned toward deep ocean blue rather than shallow-pool teal.
      const transmission = exp(this.extinction.mul(thickness).negate());
      const inscatter = vec3(this.inscatterTint);
      const throughWater = background.sample(sampleUV).rgb.mul(transmission)
        .add(inscatter.mul(vec3(1).sub(transmission)).mul(0.5)).toVar();
      // Whitewater behind the surface: sample along the refracted ray and
      // attenuate it by how deep under the surface it sits. Deep whitewater
      // melts into the water colour instead of mixing toward black.
      const foamRefracted = foam.sample(sampleUV);
      const foamDistance = clamp(foamRefracted.b.sub(depth), 0, 12);
      const behindAmount = foamRefracted.r
        .mul(foamRefracted.b.greaterThan(depth).select(1, 0))
        .mul(foamRefracted.b.greaterThan(0.001).select(1, 0))
        .mul(exp(foamDistance.mul(-0.2)));
      const foamTransmission = exp(this.extinction.mul(1.5).mul(foamDistance).negate());
      const foamBehindColor = foamTint(foamRefracted).mul(foamTransmission)
        .add(inscatter.mul(vec3(1).sub(foamTransmission)));
      throughWater.assign(mix(throughWater, foamBehindColor, behindAmount));
      const reflectionView = reflect(incident, normal);
      const reflectionWorld = this.cameraWorld.mul(vec4(reflectionView, 0)).xyz.normalize();
      const reflected = waterEnvironment(reflectionWorld);
      const fresnel = float(0.02037).add(pow(float(1).sub(clamp(normal.dot(view), 0, 1)), 5).mul(0.97963));
      const shaded = mix(throughWater, reflected, fresnel).toVar();
      // Whitewater in front of the surface covers reflections as well.
      const frontAmount = foamData.r.mul(hasFoam.select(1, 0))
        .mul(foamData.b.lessThan(depth).select(1, 0));
      shaded.assign(mix(shaded, foamTint(foamData), frontAmount));
      // Pixels with no water underneath: composite foam over the background,
      // unless scene geometry sits in front of it.
      const sceneRaw = backgroundDepth.sample(coord).r;
      const scenePos = this.inverseProjection.mul(vec4(coord.x.mul(2).sub(1), coord.y.mul(-2).add(1), sceneRaw, 1));
      const sceneLinear = scenePos.z.div(scenePos.w).negate();
      const foamHidden = foamData.b.greaterThan(sceneLinear).and(sceneRaw.lessThan(1));
      const airFoam = mix(background.sample(coord).rgb, foamTint(foamData),
        foamData.r.mul(foamHidden.select(0, 1)));
      shaded.assign(hasWater.select(shaded, airFoam));
      const depthColor = vec3(clamp(float(1).sub(depth.div(100)), 0, 1));
      // Branch with select instead of mix: mix would let NaN from unused
      // debug channels bleed into the default output.
      const diagnostic = this.debug.equal(1).select(normal.mul(0.5).add(0.5),
        this.debug.equal(2).select(depthColor,
          this.debug.equal(3).select(vec3(float(1).sub(exp(thickness.mul(-0.15)))), shaded)));
      return vec4(diagnostic, 1);
    })();
    // Composite against the existing scene depth, including the box's visible edges.
    this.surfaceMaterial.depthNode = Fn(() => {
      const depth = sampleSurface(uv());
      const foamDepth = foam.sample(uv()).b;
      const waterZ = depth.greaterThan(0).select(depth, float(1e5));
      const foamZ = foamDepth.greaterThan(0.001).select(foamDepth, float(1e5));
      const clip = this.projection.mul(vec4(0, 0, min(waterZ, foamZ).negate(), 1));
      return clip.z.div(clip.w);
    })();
  }

  private thicknessRenderTarget() {
    return new THREE.RenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: false,
    });
  }

  private target(depthBuffer: boolean) {
    return new THREE.RenderTarget(1, 1, {
      type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer, generateMipmaps: false,
    });
  }

  setDebug(value: number) { this.debug.value = value; }

  async render(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    renderer.getDrawingBufferSize(this.size);
    // Cap to CSS resolution on Retina screens to bound the multi-pass cost.
    const width = Math.max(1, Math.round(this.size.x / renderer.getPixelRatio()));
    const height = Math.max(1, Math.round(this.size.y / renderer.getPixelRatio()));
    this.depthTarget.setSize(width, height);
    this.horizontalTarget.setSize(width, height);
    this.smoothTarget.setSize(width, height);
    this.thicknessTarget.setSize(width, height);
    this.thicknessHorizontal.setSize(width, height);
    this.thicknessSmooth.setSize(width, height);
    this.foamTarget.setSize(width, height);
    this.backgroundTarget.setSize(this.size.x, this.size.y);
    // Water is also the first frame now: initialize WebGPU projection conventions
    // before copying matrices (the renderer normally does this during render()).
    if (camera.coordinateSystem !== THREE.WebGPUCoordinateSystem) {
      camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    this.cameraWorld.value.copy(camera.matrixWorld);
    this.inverseSize.value.set(1 / width, 1 / height);
    this.projection.value.copy(camera.projectionMatrix);
    this.inverseProjection.value.copy(camera.projectionMatrixInverse);
    this.focalPixels.value = height * camera.projectionMatrix.elements[5] * 0.5;
    // Derive optical coefficients from the picked colour every frame: the
    // settings object outlives renderer rebuilds on particle-count changes.
    this.settingsColor.set(this.settings.color);
    const minChannel = 1e-3;
    const strength = this.settings.density / REFERENCE_THICKNESS;
    this.extinction.value.set(
      -Math.log(Math.max(this.settingsColor.r, minChannel)) * strength,
      -Math.log(Math.max(this.settingsColor.g, minChannel)) * strength,
      -Math.log(Math.max(this.settingsColor.b, minChannel)) * strength
    );
    this.inscatterTint.value
      .set(this.settingsColor.r, this.settingsColor.g, this.settingsColor.b)
      .multiplyScalar(0.26);

    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousColor = renderer.getClearColor(Object.assign(new THREE.Color(), { a: 1 }));
    const previousAlpha = renderer.getClearAlpha();
    try {
      renderer.autoClear = true;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(this.depthTarget);
      await renderer.renderAsync(this.scene, camera);
      // Whitewater renders offscreen; dead particles collapse to zero radius.
      renderer.setRenderTarget(this.foamTarget);
      await renderer.renderAsync(this.whitewater.scene, camera);
      this.mesh.material = this.thicknessMaterial;
      renderer.setRenderTarget(this.thicknessTarget);
      await renderer.renderAsync(this.scene, camera);
      this.mesh.material = this.depthMaterial;
      this.quad.material = this.blurMaterial;
      for (let iteration = 0; iteration < 3; iteration++) {
        this.input.value = iteration === 0 ? this.depthTarget.texture : this.smoothTarget.texture;
        this.direction.value.set(1, 0);
        renderer.setRenderTarget(this.horizontalTarget);
        await this.quad.renderAsync(renderer);
        this.input.value = this.horizontalTarget.texture;
        this.direction.value.set(0, 1);
        renderer.setRenderTarget(this.smoothTarget);
        await this.quad.renderAsync(renderer);
      }
      this.quad.material = this.thicknessBlurMaterial;
      this.thicknessInput.value = this.thicknessTarget.texture;
      this.direction.value.set(1, 0);
      renderer.setRenderTarget(this.thicknessHorizontal);
      await this.quad.renderAsync(renderer);
      this.thicknessInput.value = this.thicknessHorizontal.texture;
      this.direction.value.set(0, 1);
      renderer.setRenderTarget(this.thicknessSmooth);
      await this.quad.renderAsync(renderer);
      renderer.setClearColor(previousColor, previousAlpha);
      renderer.setRenderTarget(this.backgroundTarget);
      await renderer.renderAsync(scene, camera);
      renderer.setRenderTarget(previousTarget);
      await renderer.renderAsync(scene, camera);
      renderer.autoClear = false;
      this.quad.material = this.surfaceMaterial;
      await this.quad.renderAsync(renderer);
    } finally {
      this.mesh.material = this.depthMaterial;
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(previousColor, previousAlpha);
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.depthMaterial.dispose();
    this.blurMaterial.dispose();
    this.surfaceMaterial.dispose();
    this.depthTarget.dispose();
    this.horizontalTarget.dispose();
    this.smoothTarget.dispose();
    this.thicknessTarget.dispose();
    this.thicknessHorizontal.dispose();
    this.thicknessSmooth.dispose();
    this.thicknessMaterial.dispose();
    this.thicknessBlurMaterial.dispose();
    this.foamTarget.dispose();
    this.backgroundTarget.dispose();
  }
}
