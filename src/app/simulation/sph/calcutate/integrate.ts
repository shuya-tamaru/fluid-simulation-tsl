import { float, Fn, instanceIndex, max } from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeIntegratePass(
  positionsBuffer: StorageBufferType,
  velocitiesBuffer: StorageBufferType,
  pressureForcesBuffer: StorageBufferType,
  viscosityForcesBuffer: StorageBufferType,
  mass: number,
  delta: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pos = positionsBuffer.element(instanceIndex);
    const vel = velocitiesBuffer.element(instanceIndex);
    const pressureForce = pressureForcesBuffer.element(instanceIndex);
    const viscosityForce = viscosityForcesBuffer.element(instanceIndex);
    const invMass = float(1.0)
      .div(max(float(mass), float(1e-8)))
      .toVar();
    const acceleration = pressureForce.add(viscosityForce).mul(invMass).toVar();
    const newVel = vel.add(acceleration.mul(float(delta))).toVar();
    const newPos = pos.add(newVel.mul(float(delta))).toVar();
    vel.assign(newVel);
    pos.assign(newPos);
  });
}
