import { abs, float, Fn, If, instanceIndex, sign, vec3 } from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeGravityPass(
  positionsBuffer: StorageBufferType,
  velocitiesBuffer: StorageBufferType,
  delta: number,
  restitution: number,
  boxWidth: number,
  boxHeight: number,
  boxDepth: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pos = positionsBuffer.element(instanceIndex);
    const vel = velocitiesBuffer.element(instanceIndex);
    const gravity = vec3(0, -9.8, 0);

    const newPos = pos.add(vel.mul(float(delta))).toVar();
    const newVel = vel.add(gravity.mul(float(delta))).toVar();

    If(abs(newPos.x).greaterThan(float(boxWidth / 2)), () => {
      newPos.x.assign(float(boxWidth / 2).mul(sign(newPos.x)));
      const dumpVel = newVel.x.mul(-1.0).mul(float(1.0 - restitution));
      newVel.x.assign(dumpVel);
    });

    If(abs(newPos.y).greaterThan(float(boxHeight / 2)), () => {
      newPos.y.assign(float(boxHeight / 2).mul(sign(newPos.y)));
      const dumpVel = newVel.y.mul(-1.0).mul(float(1.0 - restitution));
      newVel.y.assign(dumpVel);
    });

    If(abs(newPos.z).greaterThan(float(boxDepth / 2)), () => {
      newPos.z.assign(float(boxDepth / 2).mul(sign(newPos.z)));
      const dumpVel = newVel.z.mul(-1.0).mul(float(1.0 - restitution));
      newVel.z.assign(dumpVel);
    });

    vel.assign(newVel);
    pos.assign(newPos);
  });
}
