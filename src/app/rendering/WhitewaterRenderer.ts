import * as THREE from "three/webgpu";
import {
  Fn, If, Loop, atomicAdd, clamp, cross, dot, float, hash,
  instanceIndex, instancedArray, int, max, min, mix, normalLocal, pow,
  positionLocal, positionView, sign, sqrt, uint, uniform, vec3, vec4, cos, sin, abs,
} from "three/tsl";
import type { Particles } from "../simulation/sph/Particles";
import type { StorageBufferType } from "../types/BufferType";
import type { SPHConfig } from "../simulation/sph/SPHConfig";
import type { BoundaryConfig } from "../simulation/boundaries/BoundaryConfig";
import {
  coordToIndex,
  positionToCellCoord,
} from "../simulation/sph/utils/positionToCellIndex";

type Node = THREE.TSL.ShaderNodeObject<THREE.Node>;
export interface WhitewaterSettings { enabled: boolean; amount: number; }

// Ihmsen-style whitewater (after Sebastian Lague's Fluid-Sim): fluid particles
// with converging neighbours and high kinetic energy trap air and emit white
// particles, which are then re-classified every frame from the local fluid
// density as ballistic spray, surface-riding foam, or buoyant bubbles.
export class WhitewaterRenderer {
  // Ihmsen et al. use ~10-30x as many diffuse particles as fluid particles,
  // each an order of magnitude smaller: density of tiny particles is what
  // reads as whitewater rather than as attached ornaments.
  private readonly capacity = 65536;
  // Local fluid density (from fluid neighbours only) drives classification.
  private readonly sprayDensity = 0.12;
  private readonly bubbleDensity = 0.55;
  private readonly trappedAirRate = 110; // k_ta
  private readonly waveCrestRate = 240; // k_wc
  private readonly wallImpactRate = 55; // k_wall
  private readonly airborneRate = 30; // k_air: mist trail of detached droplets
  private surfaceNormals: StorageBufferType;
  private computeNormals: THREE.ComputeNode;
  private positions = instancedArray(this.capacity, "vec3");
  private velocities = instancedArray(this.capacity, "vec3");
  // x = remaining lifetime, y = initial lifetime, z = class (0 dead, 1 spray, 2 foam, 3 bubble), w = scale
  private states = instancedArray(this.capacity, "vec4");
  private spawnCursor = instancedArray(1, "uint").toAtomic();
  private tick = uniform(0, "uint");
  private amount = uniform(1);
  private dt = uniform(1 / 60);
  private spawnParticles: THREE.ComputeNode;
  private updateParticles: THREE.ComputeNode;
  private clearParticles: THREE.ComputeNode;
  private geometry = new THREE.SphereGeometry(1, 6, 4);
  private material = new THREE.MeshBasicNodeMaterial();
  private mesh: THREE.InstancedMesh;
  public readonly scene = new THREE.Scene();
  private wasEnabled = true;
  private settings: WhitewaterSettings;
  private config: SPHConfig;

  constructor(particles: Particles, config: SPHConfig, boundary: BoundaryConfig, settings: WhitewaterSettings) {
    this.settings = settings;
    this.config = config;
    const sourcePositions = particles.getPositionsBuffer();
    const sourceVelocities = particles.getVelocitiesBuffer();
    const cellStarts = particles.getCellStartIndicesBuffer();
    const grid = particles.getGridParams();
    const totalCells = grid.cellCountX * grid.cellCountY * grid.cellCountZ;
    const h = config.h;
    const h2 = config.h2;

    // Walk the 27 spatial-hash cells around a position, invoking the callback
    // with each fluid neighbour index. Mirrors the loop idiom in density.ts.
    const forEachNeighbour = (pos: Node, body: (j: Node) => void) => {
      // @ts-ignore
      // prettier-ignore
      const cc = positionToCellCoord(pos, grid.cellSize, grid.cellCountX, grid.cellCountY, grid.cellCountZ, grid.xMinCoord, grid.yMinCoord, grid.zMinCoord);
      const dz = int(-1).toVar();
      Loop(dz.lessThanEqual(1), () => {
        const zTarget = cc.z.add(dz);
        const dy = int(-1).toVar();
        Loop(dy.lessThanEqual(1), () => {
          const yTarget = cc.y.add(dy);
          const dx = int(-1).toVar();
          Loop(dx.lessThanEqual(1), () => {
            const xTarget = cc.x.add(dx);
            const isValidCell = xTarget.greaterThanEqual(0).and(xTarget.lessThan(grid.cellCountX))
              .and(yTarget.greaterThanEqual(0)).and(yTarget.lessThan(grid.cellCountY))
              .and(zTarget.greaterThanEqual(0)).and(zTarget.lessThan(grid.cellCountZ));
            If(isValidCell, () => {
              // @ts-ignore
              // prettier-ignore
              const cellIndex = coordToIndex(vec3(xTarget, yTarget, zTarget), grid.cellCountX, grid.cellCountY);
              // Cell starts are an exclusive prefix sum, so the next cell's
              // start is this cell's end. Avoids binding the atomic counts
              // buffer, which would exceed WebGPU's 8-storage-buffer limit.
              const start = cellStarts.element(cellIndex).toVar();
              const end = int(particles.particleCount).toVar();
              If(int(cellIndex).lessThan(int(totalCells - 1)), () => {
                end.assign(cellStarts.element(int(cellIndex).add(1)));
              });
              const j = int(start).toVar();
              Loop(j.lessThan(end), () => {
                body(j);
                j.addAssign(int(1));
              });
            });
            dx.addAssign(int(1));
          });
          dy.addAssign(int(1));
        });
        dz.addAssign(int(1));
      });
    };

    const boxLimit = (axis: "width" | "height" | "depth") => boundary[axis].mul(0.5).sub(0.02);

    this.clearParticles = Fn(() => {
      this.states.element(instanceIndex).assign(vec4(0));
    })().compute(this.capacity);

    // ---- Surface normals of fluid particles (Ihmsen et al. eq. 4-7) ----
    // The centre-of-mass deficit points out of the free surface; interior
    // particles (symmetric neighbourhoods, high density) store a zero normal
    // so the wave-crest potential ignores them.
    const sourceDensities = particles.getDensitiesBuffer();
    this.surfaceNormals = instancedArray(particles.particleCount, "vec4");
    this.computeNormals = Fn(() => {
      const pos = sourcePositions.element(instanceIndex).toVar();
      const outward = vec3(0).toVar();
      forEachNeighbour(pos, (j) => {
        If(j.notEqual(int(instanceIndex)), () => {
          const offset = pos.sub(sourcePositions.element(j)).toVar();
          const distSq = offset.dot(offset);
          If(distSq.lessThan(h2).and(distSq.greaterThan(1e-8)), () => {
            const dist = sqrt(distSq);
            const influence = float(1).sub(min(dist.div(h), 1));
            outward.addAssign(offset.div(dist).mul(influence));
          });
        });
      });
      // xyz: surface normal (zero when interior), w: fluid density. Packing
      // the density here keeps the spawn pass within WebGPU's 8-buffer limit.
      const density = sourceDensities.element(instanceIndex);
      const nearSurface = density.lessThan(0.9)
        .and(outward.dot(outward).greaterThan(0.25));
      this.surfaceNormals.element(instanceIndex).assign(
        vec4(nearSurface.select(outward.normalize(), vec3(0)), density)
      );
    })().compute(particles.particleCount);

    // ---- Emission from fluid particles ----
    // n_d = I_k * (k_ta * I_ta + k_wc * I_wc) * dt  (Ihmsen et al. eq. 8):
    // trapped air fires where flows converge, wave crests fire on convex,
    // fast-moving surface regions - the lip of a breaking splash.
    this.spawnParticles = Fn(() => {
      const pos = sourcePositions.element(instanceIndex).toVar();
      const vel = sourceVelocities.element(instanceIndex).toVar();
      const normal = this.surfaceNormals.element(instanceIndex).toVar();
      const weightedVelocityDifference = float(0).toVar();
      const curvature = float(0).toVar();
      forEachNeighbour(pos, (j) => {
        If(j.notEqual(int(instanceIndex)), () => {
          const neighbourPos = sourcePositions.element(j);
          const offset = neighbourPos.sub(pos).toVar();
          const distSq = offset.dot(offset).toVar();
          If(distSq.lessThan(h2).and(distSq.greaterThan(1e-8)), () => {
            const dist = sqrt(distSq);
            const dirToNeighbour = offset.div(dist).toVar();
            const relativeVelocity = vel.sub(sourceVelocities.element(j)).toVar();
            const relativeSpeed = relativeVelocity.length();
            const relativeDir = relativeVelocity.div(max(relativeSpeed, 1e-6));
            // 0 when separating, up to 2 when moving head-on into each other.
            const converge = float(1).sub(dot(relativeDir, dirToNeighbour.negate()));
            const influence = float(1).sub(min(dist.div(h), 1));
            weightedVelocityDifference.addAssign(relativeSpeed.mul(converge).mul(influence));
            // Wave crest: count diverging surface normals, convex side only.
            const neighbourNormal = this.surfaceNormals.element(j);
            const convex = dirToNeighbour.dot(normal.xyz).lessThan(0);
            const bothOnSurface = neighbourNormal.xyz.dot(neighbourNormal.xyz).greaterThan(0.5)
              .and(normal.xyz.dot(normal.xyz).greaterThan(0.5));
            If(convex.and(bothOnSurface), () => {
              curvature.addAssign(float(1).sub(normal.xyz.dot(neighbourNormal.xyz)).mul(influence));
            });
          });
        });
      });
      const trappedAir = clamp(weightedVelocityDifference.sub(3).div(14), 0, 1);
      const kinetic = clamp(vel.dot(vel).sub(9).div(40), 0, 1);
      // Crests only fire while the surface moves outward along its normal.
      const movingOutward = vel.normalize().dot(normal.xyz).greaterThanEqual(0.6)
        .and(normal.xyz.dot(normal.xyz).greaterThan(0.5)).select(1, 0);
      const waveCrest = clamp(curvature.sub(2).div(6), 0, 1).mul(movingOutward);
      // Wall-impact potential: a wave front slams a side wall as one body,
      // so fluid-fluid relative velocities (trapped air) stay near zero at
      // the very moment a real wave throws most of its spray. Detect fluid
      // rushing into a nearby wall and emit there directly.
      const wallNormal = vec3(0).toVar();
      const wallSpeed = float(0).toVar();
      const nearWall = h * 0.9;
      const considerWall = (dist: Node, inwardX: number, inwardZ: number) => {
        const inward = vec3(inwardX, 0, inwardZ);
        const speedIn = dot(vel, inward).negate();
        If(dist.lessThan(nearWall).and(speedIn.greaterThan(wallSpeed)), () => {
          wallSpeed.assign(speedIn);
          wallNormal.assign(inward);
        });
      };
      considerWall(boundary.width.add(boundary.xMin).sub(pos.x), -1, 0);
      considerWall(pos.x.sub(boundary.xMin), 1, 0);
      considerWall(boundary.depth.mul(0.5).sub(pos.z), 0, -1);
      considerWall(pos.z.add(boundary.depth.mul(0.5)), 0, 1);
      const wallImpact = clamp(wallSpeed.mul(wallSpeed).sub(9).div(40), 0, 1);
      // Detached airborne fluid (no neighbours to converge against) sheds a
      // mist trail purely from its own speed.
      const airborne = normal.w.lessThan(0.35).select(1, 0);
      const airEmission = kinetic.mul(airborne).mul(this.airborneRate);
      const flowEmission = kinetic
        .mul(trappedAir.mul(this.trappedAirRate).add(waveCrest.mul(this.waveCrestRate)));
      const wallEmission = wallImpact.mul(this.wallImpactRate);
      const spawnFactor = flowEmission.add(wallEmission).add(airEmission)
        .mul(this.amount).mul(this.dt);
      // Wall spray leaves deflected off the wall and upward, like run-up.
      const wallDominant = wallEmission.greaterThan(flowEmission);
      const deflected = vel.sub(wallNormal.mul(dot(vel, wallNormal).mul(1.7)))
        .add(vec3(0, 1, 0).mul(wallSpeed.mul(0.7)));
      const seed = instanceIndex.mul(uint(197)).add(this.tick.mul(uint(719)));
      const spawnCount = int(spawnFactor.floor()).toVar();
      If(hash(seed).lessThan(spawnFactor.fract()), () => { spawnCount.addAssign(int(1)); });
      spawnCount.assign(min(spawnCount, int(6)));
      If(spawnCount.greaterThan(0), () => {
        // Spawn inside a cylinder swept along the velocity over this step.
        const axisA = cross(vel, vec3(0, 1, 0)).toVar();
        If(axisA.dot(axisA).lessThan(1e-6), () => { axisA.assign(vec3(1, 0, 0)); });
        axisA.assign(axisA.normalize());
        const axisB = cross(axisA, vel.normalize());
        const s = int(0).toVar();
        Loop(s.lessThan(spawnCount), () => {
          const slotSeed = seed.add(uint(s).mul(uint(7919)));
          const slot = atomicAdd(this.spawnCursor.element(0), uint(1)).mod(uint(this.capacity));
          // Recycle only dead slots and short-lived surface foam. Airborne
          // spray and bubbles are never overwritten: a heavy burst used to
          // wrap the ring and erase its own spray in mid-flight.
          const occupant = this.states.element(slot).z;
          const recyclable = occupant.lessThan(0.5)
            .or(occupant.greaterThan(1.5).and(occupant.lessThan(2.5)));
          If(recyclable, () => {
            const angle = hash(slotSeed.add(1)).mul(Math.PI * 2);
            const radial = axisA.mul(cos(angle)).add(axisB.mul(sin(angle)));
            const baseOffset = radial.mul(sqrt(hash(slotSeed.add(2))).mul(h * 0.5));
            const alongVel = vel.mul(this.dt).mul(hash(slotSeed.add(3)));
            this.positions.element(slot).assign(pos.add(baseOffset).add(alongVel));
            const baseVelocity = wallDominant.select(deflected, vel);
            this.velocities.element(slot).assign(baseVelocity.add(baseOffset.mul(2)));
            // Energetic regions produce longer-lived whitewater (paper sec 3.2).
            const energy = clamp(kinetic.mul(trappedAir.add(waveCrest)).add(wallImpact), 0, 1);
            const lifetime = hash(slotSeed.add(4)).mul(2).add(1.5).add(energy.mul(4));
            this.states.element(slot).assign(vec4(lifetime, lifetime, 1, 1));
          });
          s.addAssign(int(1));
        });
      });
    })().compute(particles.particleCount);

    // ---- Advection and classification of white particles ----
    this.updateParticles = Fn(() => {
      const state = this.states.element(instanceIndex);
      If(state.z.greaterThan(0.5), () => {
        const position = this.positions.element(instanceIndex);
        const velocity = this.velocities.element(instanceIndex);
        const density = float(0).toVar();
        const velocitySum = vec3(0).toVar();
        const weightSum = float(0).toVar();
        forEachNeighbour(position, (j) => {
          const offset = sourcePositions.element(j).sub(position).toVar();
          const distSq = offset.dot(offset);
          If(distSq.lessThan(h2), () => {
            const w = pow(float(h2).sub(distSq), 3).mul(config.poly6Kernel);
            density.addAssign(w.mul(config.mass));
            velocitySum.addAssign(sourceVelocities.element(j).mul(w));
            weightSum.addAssign(w);
          });
        });
        const fluidVelocity = velocitySum.div(max(weightSum, 1e-6));
        const decay = float(1).toVar();
        If(density.lessThan(this.sprayDensity), () => {
          // Spray: ballistic with quadratic drag.
          state.z.assign(1);
          decay.assign(0.1);
          const drag = velocity.mul(velocity.length()).mul(-0.04);
          velocity.addAssign(vec3(0, -9.8, 0).add(drag).mul(this.dt));
        }).ElseIf(density.greaterThan(this.bubbleDensity), () => {
          // Bubble: buoyancy plus acceleration toward the surrounding fluid.
          state.z.assign(3);
          decay.assign(0.25);
          const buoyancy = vec3(0, 9.8 * 0.7, 0);
          const towardFluid = fluidVelocity.sub(velocity).mul(3);
          velocity.addAssign(buoyancy.add(towardFluid).mul(this.dt));
        }).Else(() => {
          // Foam: carried by the fluid while it dissolves.
          state.z.assign(2);
          decay.assign(1.1);
          velocity.assign(fluidVelocity);
        });
        state.x.subAssign(this.dt.mul(decay));
        // Bubbles shrink; spray and foam relax back to full size.
        const targetScale = state.z.greaterThan(2.5).select(float(0.55), float(1));
        state.w.assign(mix(state.w, targetScale, min(this.dt.mul(7), 1)));
        position.addAssign(velocity.mul(this.dt));
        // X bounds mirror the piston: fixed left wall, moving right wall.
        const xLow = boundary.xMin + 0.02;
        const xHigh = boundary.width.add(boundary.xMin).sub(0.02);
        const limitY = boxLimit("height");
        const limitZ = boxLimit("depth");
        If(position.x.greaterThan(xHigh), () => {
          position.x.assign(xHigh);
          velocity.x.mulAssign(-0.2);
        });
        If(position.x.lessThan(xLow), () => {
          position.x.assign(xLow);
          velocity.x.mulAssign(-0.2);
        });
        If(abs(position.y).greaterThan(limitY), () => {
          position.y.assign(limitY.mul(sign(position.y)));
          velocity.y.mulAssign(-0.2);
        });
        If(abs(position.z).greaterThan(limitZ), () => {
          position.z.assign(limitZ.mul(sign(position.z)));
          velocity.z.mulAssign(-0.2);
        });
        If(state.x.lessThanEqual(0), () => { state.z.assign(0); });
      });
    })().compute(this.capacity);

    // ---- Offscreen foam pass: (coverage, sun shading, view depth) ----
    const state = this.states.toAttribute();
    const alive = state.z.greaterThan(0.5);
    const dissolve = clamp(state.x.div(1.2), 0, 1);
    const sizeVariation = hash(instanceIndex.add(uint(613))).mul(0.6).add(0.7);
    const isFoam = state.z.greaterThan(1.5).and(state.z.lessThan(2.5));
    // Spray reads sharpest, foam largest and softest (paper sec. 3.3).
    const classRadius = isFoam.select(float(0.085),
      state.z.greaterThan(2.5).select(float(0.055), float(0.05)));
    const radius = classRadius.mul(state.w).mul(dissolve).mul(sizeVariation)
      .mul(alive.select(1, 0));
    // Surface foam flattens into floating patches; spray and bubbles stay round.
    const flatten = isFoam.select(float(0.5), float(1));
    this.material.positionNode = positionLocal.mul(vec3(radius, radius.mul(flatten), radius))
      .add(this.positions.toAttribute());
    const sunDirection = vec3(-0.45, 0.75, 0.48).normalize();
    const shade = max(normalLocal.dot(sunDirection), 0).mul(0.75).add(0.25);
    const coverage = state.z.greaterThan(2.5).select(float(0.7), float(0.95))
      .mul(clamp(state.x.mul(2), 0, 1));
    // Shade is premultiplied by coverage: the render target's bilinear filter
    // then fades both together at silhouettes instead of pulling the shade
    // toward zero (which showed up as dark speckles around every particle).
    this.material.fragmentNode = vec4(coverage, shade.mul(coverage), positionView.z.negate(), 1);
    this.material.toneMapped = false;
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  get enabled() { return this.settings.enabled; }

  async update(renderer: THREE.WebGPURenderer) {
    if (!this.settings.enabled) {
      if (this.wasEnabled) await renderer.computeAsync(this.clearParticles);
      this.wasEnabled = false;
      return;
    }
    this.wasEnabled = true;
    this.dt.value = this.config.delta;
    this.amount.value = this.settings.amount;
    this.tick.value++;
    await renderer.computeAsync(this.updateParticles);
    await renderer.computeAsync(this.computeNormals);
    await renderer.computeAsync(this.spawnParticles);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.positions.dispose();
    this.velocities.dispose();
    this.states.dispose();
    this.surfaceNormals.dispose();
    this.spawnCursor.dispose();
    this.computeNormals.dispose();
    this.spawnParticles.dispose();
    this.updateParticles.dispose();
    this.clearParticles.dispose();
  }
}
