import { clamp, Fn, vec3 } from "three/tsl";
import * as THREE from "three/webgpu";

export function positionToCellCoord(
  position: THREE.TSL.ShaderNodeObject<THREE.StorageArrayElementNode>,
  cellSize: number,
  cellCountX: number,
  cellCountY: number,
  cellCountZ: number,
  xMinCoord: number,
  yMinCoord: number,
  zMinCoord: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const resolution = position
      .sub(vec3(xMinCoord, yMinCoord, zMinCoord))
      .div(cellSize)
      .toVar();
    const cx = resolution.x.floor();
    const cy = resolution.y.floor();
    const cz = resolution.z.floor();

    const cxc = clamp(cx, 0, cellCountX - 1);
    const cyc = clamp(cy, 0, cellCountY - 1);
    const czc = clamp(cz, 0, cellCountZ - 1);
    const c = vec3(cxc, cyc, czc);

    return c;
  });
}

export function coordToIndex(
  c: THREE.TSL.ShaderNodeObject<THREE.TSL.ShaderCallNodeInternal>,
  cellCountX: number,
  cellCountY: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    return c.x.add(c.y.mul(cellCountX)).add(c.z.mul(cellCountX * cellCountY));
  });
}

export function positionToCellIndex(
  position: THREE.TSL.ShaderNodeObject<THREE.StorageArrayElementNode>,
  cellSize: number,
  cellCountX: number,
  cellCountY: number,
  cellCountZ: number,
  xMinCoord: number,
  yMinCoord: number,
  zMinCoord: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const c = positionToCellCoord(
      position,
      cellSize,
      cellCountX,
      cellCountY,
      cellCountZ,
      xMinCoord,
      yMinCoord,
      zMinCoord
    )();
    const index = coordToIndex(c, cellCountX, cellCountY)();

    return index;
  });
}
