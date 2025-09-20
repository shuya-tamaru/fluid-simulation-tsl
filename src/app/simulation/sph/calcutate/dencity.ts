import { float, Fn, If, instanceIndex, Loop, pow, uint } from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeDensityPass(
  positionsBuffer: StorageBufferType,
  densitiesBuffer: StorageBufferType,
  particleCount: number,
  poly6Kernel: number,
  h2: number,
  h6: number,
  mass: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pos_i = positionsBuffer.element(instanceIndex);
    const density = densitiesBuffer.element(instanceIndex);
    const rho0 = float(0.0).toVar();

    let j = uint(0).toVar();
    Loop(j.lessThan(particleCount), () => {
      If(j.notEqual(instanceIndex), () => {
        const pos_j = positionsBuffer.element(j);
        const r = pos_j.sub(pos_i).toVar();
        const r2 = r.dot(r);

        If(r2.lessThan(h2), () => {
          const t = float(h2).sub(r2).toVar();
          const w = float(poly6Kernel).mul(pow(t, 3));
          rho0.addAssign(w.mul(mass));
        });
      });

      j.assign(j.add(uint(1)));
    });

    rho0.addAssign(float(mass).mul(float(poly6Kernel)).mul(float(h6)));
    density.assign(rho0);
  });
}
