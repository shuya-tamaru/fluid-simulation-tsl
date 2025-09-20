import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";
import { float, Fn, If, instanceIndex, Loop, max, uint, vec3 } from "three/tsl";

export function computePressureForcePass(
  positionsBuffer: StorageBufferType,
  densitiesBuffer: StorageBufferType,
  pressuresBuffer: StorageBufferType,
  pressureForcesBuffer: StorageBufferType,
  particleCount: number,
  mass: number,
  h: number,
  spiky: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pressureForce_i = pressureForcesBuffer.element(instanceIndex);
    const pressure_i = pressuresBuffer.element(instanceIndex);
    const pos_i = positionsBuffer.element(instanceIndex);
    const density_i = densitiesBuffer.element(instanceIndex);
    const pForce_i = vec3(0, 0, 0).toVar();

    let j = uint(0).toVar();
    Loop(j.lessThan(particleCount), () => {
      If(j.notEqual(instanceIndex), () => {
        const pos_j = positionsBuffer.element(j);

        const dir = pos_j.sub(pos_i).toVar();
        const r = dir.length().toVar();
        If(r.lessThan(h), () => {
          const t = float(h).sub(r).toVar();
          If(t.greaterThan(float(0.0)), () => {
            const density_j = densitiesBuffer.element(j);
            const _dir = dir.div(r).toVar();
            const gradW = float(spiky).mul(t.mul(t)).mul(_dir).toVar();
            const rhoj = max(density_j, float(1e-8)).toVar();
            const press_j = pressuresBuffer.element(j);
            const term = pressure_i
              .div(density_i.mul(density_i))
              .add(press_j.div(rhoj.mul(rhoj)))
              .toVar();
            const fi = float(mass)
              .mul(float(mass))
              .mul(term)
              .mul(gradW)
              .toVar();
            pForce_i.addAssign(fi);
          });
        });
      });
      j.assign(j.add(uint(1)));
    });
    pressureForce_i.assign(pForce_i);
  });
}
