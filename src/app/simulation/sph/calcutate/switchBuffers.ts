import * as THREE from "three/webgpu";
import { Fn, instanceIndex } from "three/tsl";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeSwitchBuffersPass(
  positionsBuffer: StorageBufferType,
  velocitiesBuffer: StorageBufferType,
  reorderedPositionsBuffer: StorageBufferType,
  reorderedVelocitiesBuffer: StorageBufferType
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pos = positionsBuffer.element(instanceIndex);
    const vel = velocitiesBuffer.element(instanceIndex);
    const reorderedPos = reorderedPositionsBuffer.element(instanceIndex);
    const reorderedVel = reorderedVelocitiesBuffer.element(instanceIndex);
    pos.assign(reorderedPos);
    vel.assign(reorderedVel);
  });
}
