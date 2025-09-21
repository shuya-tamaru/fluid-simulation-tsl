import { clamp, Fn, vec3 } from "three/tsl";
import * as THREE from "three/webgpu";

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

    return cxc.add(cyc.mul(cellCountX)).add(czc.mul(cellCountX * cellCountY));
  });
}
