import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";
import { float, Fn, instanceIndex, max } from "three/tsl";

export function computePressurePass(
  densitiesBuffer: StorageBufferType,
  pressuresBuffer: StorageBufferType,
  restDensity: number,
  pressureStiffness: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pressure_i = pressuresBuffer.element(instanceIndex);
    const density = densitiesBuffer.element(instanceIndex);
    const rho0 = max(density, float(1e-8));
    const pressure = float(pressureStiffness).mul(
      rho0.sub(restDensity).toVar()
    );
    pressure_i.assign(pressure);
  });
}
