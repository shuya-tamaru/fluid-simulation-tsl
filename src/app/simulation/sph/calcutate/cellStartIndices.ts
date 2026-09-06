import type { StorageBufferType } from "../../../types/BufferType";
import * as THREE from "three/webgpu";
import { Fn, If, Loop, atomicLoad, instanceIndex, int, min, uint } from "three/tsl";

export function computeCellStartIndicesPass(
  cellStartIndicesBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType,
  totalCellCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const acc = int(0).toVar();

    const i = uint(0).toVar();
    Loop(i.lessThan(uint(totalCellCount)), () => {
      const startIndex = cellStartIndicesBuffer.element(i);
      startIndex.assign(acc);

      const count = atomicLoad(cellCountsBuffer.element(i));
      acc.addAssign(count);
      i.addAssign(uint(1));
    });
  });
}

// Each lane scans a short contiguous block; a second dispatch sees all block
// totals and writes the exact exclusive prefix. No workgroup-wide barriers or
// ordering assumptions between GPU workgroups are needed.
export const CELL_SCAN_BLOCK_SIZE = 256;
export function computeCellBlockSumsPass(
  cellCounts: StorageBufferType, blockSums: StorageBufferType, count: number
): THREE.TSL.ShaderNodeFn<[]> {
  const blocks = Math.ceil(count / CELL_SCAN_BLOCK_SIZE);
  return Fn(() => {
    If(instanceIndex.lessThan(blocks), () => {
      const sum = int(0).toVar();
      const i = instanceIndex.mul(CELL_SCAN_BLOCK_SIZE).toVar();
      const end = min(i.add(CELL_SCAN_BLOCK_SIZE), uint(count)).toVar();
      Loop(i.lessThan(end), () => {
        sum.addAssign(atomicLoad(cellCounts.element(i)));
        i.addAssign(1);
      });
      blockSums.element(instanceIndex).assign(sum);
    });
  });
}

export function computeBlockedCellStartsPass(
  starts: StorageBufferType, counts: StorageBufferType,
  blockSums: StorageBufferType, count: number
): THREE.TSL.ShaderNodeFn<[]> {
  const blocks = Math.ceil(count / CELL_SCAN_BLOCK_SIZE);
  return Fn(() => {
    If(instanceIndex.lessThan(blocks), () => {
      const sum = int(0).toVar();
      const block = uint(0).toVar();
      Loop(block.lessThan(instanceIndex), () => {
        sum.addAssign(blockSums.element(block));
        block.addAssign(1);
      });
      const i = instanceIndex.mul(CELL_SCAN_BLOCK_SIZE).toVar();
      const end = min(i.add(CELL_SCAN_BLOCK_SIZE), uint(count)).toVar();
      Loop(i.lessThan(end), () => {
        starts.element(i).assign(sum);
        sum.addAssign(atomicLoad(counts.element(i)));
        i.addAssign(1);
      });
    });
  });
}
