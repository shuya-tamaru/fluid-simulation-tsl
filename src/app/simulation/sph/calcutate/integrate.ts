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
  damping: number,
  boxWidth: UniformTypeOf<number>,
  boxHeight: UniformTypeOf<number>,
  boxDepth: UniformTypeOf<number>,
  topCollision: UniformTypeOf<boolean>,
  xMin: number,
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
      // Mild bulk damping so standing waves and pressure jitter settle within
      // seconds, as in a real small tank; a splash barely notices it.
      newVel.mulAssign(float(Math.exp(-damping * delta)));
      const newPos = pos.add(newVel.mul(float(delta))).toVar();
      const esp = float(1e-2);

      // X walls are asymmetric: the left wall is fixed at xMin, the right
      // wall (xMin + width) is the piston driven by the width slider.
      const xMax = boxWidth.add(xMin);
      If(newPos.x.greaterThan(xMax.sub(esp)), () => {
        newPos.x.assign(xMax.sub(esp));
        newVel.x.mulAssign(float(-1.0).mul(float(1.0).sub(restitution)));
      });
      If(newPos.x.lessThan(float(xMin).add(esp)), () => {
        newPos.x.assign(float(xMin).add(esp));
        newVel.x.mulAssign(float(-1.0).mul(float(1.0).sub(restitution)));
      });

      If(newPos.y.lessThan(boxHeight.div(-2)), () => {
        newPos.y.assign(boxHeight.div(-2).add(esp));
        newVel.y.mulAssign(float(-1.0).mul(float(1.0).sub(restitution)));
      });
      If(topCollision.and(newPos.y.greaterThan(boxHeight.div(2))), () => {
        newPos.y.assign(boxHeight.div(2).sub(esp));
        newVel.y.mulAssign(float(-1.0).mul(float(1.0).sub(restitution)));
      });

      If(abs(newPos.z).greaterThan(boxDepth.div(2)), () => {
        newPos.z.assign(boxDepth.div(2).sub(esp).mul(sign(newPos.z)));
        newVel.z.mulAssign(float(-1.0).mul(float(1.0).sub(restitution)));
      });

      vel.assign(newVel);
      pos.assign(newPos);
    });
  });
}
