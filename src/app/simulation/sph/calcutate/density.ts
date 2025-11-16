import {
  atomicLoad,
  clamp,
  float,
  Fn,
  If,
  instanceIndex,
  int,
  Loop,
  pow,
  uint,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";
import {
  coordToIndex,
  positionToCellCoord,
} from "../utils/positionToCellIndex";

export function computeDensityPass(
  positionsBuffer: StorageBufferType,
  densitiesBuffer: StorageBufferType,
  cellStartIndicesBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType,
  poly6Kernel: number,
  h2: number,
  h6: number,
  mass: number,
  cellSize: number,
  cellCountX: number,
  cellCountY: number,
  cellCountZ: number,
  xMinCoord: number,
  yMinCoord: number,
  zMinCoord: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pos_i = positionsBuffer.element(instanceIndex);
    const density = densitiesBuffer.element(instanceIndex);
    const rho0 = float(0.0).toVar();

    const cc = positionToCellCoord(
      pos_i,
      cellSize,
      cellCountX,
      cellCountY,
      cellCountZ,
      xMinCoord,
      yMinCoord,
      zMinCoord
    )();

    for (var dz = -1; dz <= 1; dz = dz + 1) {
      const zc = clamp(cc.z.add(dz), int(0), int(cellCountZ).sub(int(1)));
      for (var dy = -1; dy <= 1; dy = dy + 1) {
        const yc = clamp(cc.y.add(dy), int(0), int(cellCountY).sub(int(1)));
        for (var dx = -1; dx <= 1; dx = dx + 1) {
          const xc = clamp(cc.x.add(dx), int(0), int(cellCountX).sub(int(1)));
          const cellIndex = coordToIndex(
            vec3(xc, yc, zc),
            cellCountX,
            cellCountY
          )();
          const start = cellStartIndicesBuffer.element(cellIndex).toVar();
          const count = atomicLoad(cellCountsBuffer.element(cellIndex)).toVar();
          const end = start.add(count).toVar();
          let j = uint(start).toVar();

          Loop(j.lessThan(end), () => {
            If(j.notEqual(instanceIndex), () => {
              const pos_j = positionsBuffer.element(j);
              const r = pos_j.sub(pos_i).toVar();
              const r2 = r.dot(r);
              If(r2.lessThan(h2), () => {
                const t = float(h2).sub(r2).toVar();
                const w = float(poly6Kernel).mul(pow(t, 3));
                rho0.addAssign(w.mul(mass));
              });
            });
            j.addAssign(uint(1));
          });
        }
      }
    }

    // let j = uint(0).toVar();
    // Loop(j.lessThan(particleCount), () => {
    //   If(j.notEqual(instanceIndex), () => {
    //     const pos_j = positionsBuffer.element(j);
    //     const r = pos_j.sub(pos_i).toVar();
    //     const r2 = r.dot(r);

    //     If(r2.lessThan(h2), () => {
    //       const t = float(h2).sub(r2).toVar();
    //       const w = float(poly6Kernel).mul(pow(t, 3));
    //       rho0.addAssign(w.mul(mass));
    //     });
    //   });

    //   j.assign(j.add(uint(1)));
    // });

    rho0.addAssign(float(mass).mul(float(poly6Kernel)).mul(float(h6)));
    density.assign(rho0);
  });
}
