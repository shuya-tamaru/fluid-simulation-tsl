import * as THREE from "three/webgpu";
import { Fn, If, instanceIndex } from "three/tsl";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeSwitchBuffersPass(
  positionsBuffer: StorageBufferType,
  velocitiesBuffer: StorageBufferType,
  reorderedPositionsBuffer: StorageBufferType,
  reorderedVelocitiesBuffer: StorageBufferType,
  particleCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const i = instanceIndex.toVar();
    If(i.lessThan(particleCount), () => {
      const pos = positionsBuffer.element(instanceIndex);
      const vel = velocitiesBuffer.element(instanceIndex);
      const reorderedPos = reorderedPositionsBuffer.element(instanceIndex);
      const reorderedVel = reorderedVelocitiesBuffer.element(instanceIndex);
      pos.assign(reorderedPos);
      vel.assign(reorderedVel);
    });
  });
}
