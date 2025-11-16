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

    // @ts-ignore
    //prettier-ignore
    const cc = positionToCellCoord(pos_i, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord);

    const dz = int(-1).toVar();

    Loop(dz.lessThanEqual(1), () => {
      const zc = clamp(cc.z.add(dz), int(0), int(cellCountZ).sub(int(1)));
      // 各 z 反復の開始で dy をリセット
      const dy = int(-1).toVar();
      Loop(dy.lessThanEqual(1), () => {
        const yc = clamp(cc.y.add(dy), int(0), int(cellCountY).sub(int(1)));
        // 各 y 反復の開始で dx をリセット
        const dx = int(-1).toVar();
        Loop(dx.lessThanEqual(1), () => {
          const xc = clamp(cc.x.add(dx), int(0), int(cellCountX).sub(int(1)));

          // @ts-ignore
          //prettier-ignore
          const cellIndex = coordToIndex(vec3(xc, yc, zc), cellCountX, cellCountY)

          const start = cellStartIndicesBuffer.element(cellIndex).toVar();
          const count = atomicLoad(cellCountsBuffer.element(cellIndex)).toVar();
          const end = start.add(count).toVar();
          let j = int(start).toVar();

          Loop(j.lessThan(end).and(j.notEqual(instanceIndex)), () => {
            const pos_j = positionsBuffer.element(j);
            const r = pos_j.sub(pos_i).toVar();
            const r2 = r.dot(r);
            If(r2.lessThan(h2), () => {
              const t = float(h2).sub(r2).toVar();
              const w = float(poly6Kernel).mul(pow(t, 3));
              rho0.addAssign(w.mul(mass));
            });
            j.addAssign(int(1));
          });
          dx.addAssign(int(1));
        });
        dy.addAssign(int(1));
      });
      dz.addAssign(int(1));
    });

    rho0.addAssign(float(mass).mul(float(poly6Kernel)).mul(float(h6)));
    density.assign(rho0);
  });
}
