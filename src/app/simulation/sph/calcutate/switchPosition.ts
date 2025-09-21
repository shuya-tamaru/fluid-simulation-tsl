import * as THREE from "three/webgpu";
import { Fn, instanceIndex } from "three/tsl";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeSwitchPositionPass(
  positionsBuffer: StorageBufferType,
  velocitiesBuffer: StorageBufferType,
  reorderedPositionsBuffer: StorageBufferType,
  reorderedVelocitiesBuffer: StorageBufferType
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const reorderedPos = reorderedPositionsBuffer.element(instanceIndex);
    const reorderedVel = reorderedVelocitiesBuffer.element(instanceIndex);
    const pos = positionsBuffer.element(instanceIndex);
    const vel = velocitiesBuffer.element(instanceIndex);
    pos.assign(reorderedPos);
    vel.assign(reorderedVel);
  });
}
