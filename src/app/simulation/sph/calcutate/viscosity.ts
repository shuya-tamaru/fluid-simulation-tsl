import { float, Fn, If, instanceIndex, Loop, uint, vec3 } from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeViscosityPass(
  positionsBuffer: StorageBufferType,
  velocitiesBuffer: StorageBufferType,
  densitiesBuffer: StorageBufferType,
  viscosityForcesBuffer: StorageBufferType,
  particleCount: number,
  viscosity: number,
  viscosityMu: number,
  h: number,
  mass: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pos_i = positionsBuffer.element(instanceIndex);
    const vel_i = velocitiesBuffer.element(instanceIndex);
    const viscosity_i = viscosityForcesBuffer.element(instanceIndex);
    const density_i = densitiesBuffer.element(instanceIndex);
    const viscosityForce_i = vec3(0, 0, 0).toVar();

    let j = uint(0).toVar();
    Loop(j.lessThan(particleCount), () => {
      If(j.notEqual(instanceIndex), () => {
        const pos_j = positionsBuffer.element(j);
        const dist = pos_j.sub(pos_i).toVar();
        const r = dist.length().toVar();
        If(r.lessThan(h), () => {
          const lapW = float(viscosity).mul(float(h).sub(r)).toVar();
          const density_j = densitiesBuffer.element(j);
          const vel_j = velocitiesBuffer.element(j);
          const invRhoAvg = float(2.0).div(density_i.add(density_j)).toVar();
          viscosityForce_i.addAssign(
            float(viscosityMu)
              .mul(float(mass))
              .mul(vel_j.sub(vel_i))
              .mul(invRhoAvg)
              .mul(lapW)
              .toVar()
          );
        });
      });
      j.assign(j.add(uint(1)));
    });
    viscosity_i.assign(viscosityForce_i);
  });
}
