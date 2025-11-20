import {
  abs,
  float,
  Fn,
  If,
  instanceIndex,
  max,
  sign,
  uint,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";
import type { UniformTypeOf } from "../../../types/UniformType";

export function computeIntegratePass(
  positionsBuffer: StorageBufferType,
  velocitiesBuffer: StorageBufferType,
  pressureForcesBuffer: StorageBufferType,
  viscosityForcesBuffer: StorageBufferType,
  mass: number,
  delta: number,
  restitution: number,
  boxWidth: UniformTypeOf<number>,
  boxHeight: UniformTypeOf<number>,
  boxDepth: UniformTypeOf<number>,
  particleCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const i = instanceIndex.toVar();
    If(i.lessThan(uint(particleCount)), () => {
      const pos = positionsBuffer.element(i);
      const vel = velocitiesBuffer.element(i);
      const pressureForce = pressureForcesBuffer.element(i);
      const viscosityForce = viscosityForcesBuffer.element(i);
      const invMass = float(1.0).div(max(float(mass), float(1e-8)));

      const gravity = vec3(0, -9.8, 0).toVar();
      const acceleration = pressureForce
        .add(viscosityForce)
        .mul(invMass)
        .add(gravity);

      const newVel = vel.add(acceleration.mul(float(delta))).toVar();
      const newPos = pos.add(newVel.mul(float(delta))).toVar();
      const esp = float(1e-2);

      If(abs(newPos.x).greaterThan(boxWidth.div(2)), () => {
        newPos.x.assign(boxWidth.div(2).sub(esp).mul(sign(newPos.x)));
        newVel.x.mulAssign(float(-1.0).mul(float(1.0).sub(restitution)));
      });

      If(abs(newPos.y).greaterThan(boxHeight.div(2)), () => {
        newPos.y.assign(boxHeight.div(2).sub(esp).mul(sign(newPos.y)));
        newVel.y.mulAssign(float(-1.0).mul(float(1.0).sub(restitution)));
      });

      If(abs(newPos.z).greaterThan(boxDepth.div(2)), () => {
        newPos.z.assign(boxDepth.div(2).mul(sign(newPos.z)));
        newVel.z.mulAssign(float(-1.0).mul(float(1.0).sub(restitution)));
      });

      vel.assign(newVel);
      pos.assign(newPos);
    });
  });
}
