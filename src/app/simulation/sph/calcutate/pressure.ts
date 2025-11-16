import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";
import { float, Fn, If, instanceIndex, max } from "three/tsl";

export function computePressurePass(
  densitiesBuffer: StorageBufferType,
  pressuresBuffer: StorageBufferType,
  restDensity: number,
  pressureStiffness: number,
  particleCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const i = instanceIndex.toVar();
    If(i.lessThan(particleCount), () => {
      const pressure_i = pressuresBuffer.element(instanceIndex);
      const density = densitiesBuffer.element(instanceIndex);
      const rho0 = max(density, float(1e-8));
      const pressure = max(
        float(pressureStiffness).mul(rho0.sub(restDensity)),
        float(0.0)
      );
      pressure_i.assign(pressure);
    });
  });
}
