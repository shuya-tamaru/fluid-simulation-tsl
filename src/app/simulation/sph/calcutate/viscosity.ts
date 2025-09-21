import {
  atomicLoad,
  clamp,
  float,
  Fn,
  If,
  instanceIndex,
  int,
  Loop,
  max,
  uint,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";
import {
  coordToIndex,
  positionToCellCoord,
} from "../utils/positionToCellIndex";

export function computeViscosityPass(
  positionsBuffer: StorageBufferType,
  velocitiesBuffer: StorageBufferType,
  densitiesBuffer: StorageBufferType,
  viscosityForcesBuffer: StorageBufferType,
  cellStartIndicesBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType,
  viscosity: number,
  viscosityMu: number,
  h: number,
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
    const vel_i = velocitiesBuffer.element(instanceIndex);
    const viscosity_i = viscosityForcesBuffer.element(instanceIndex);
    const density_i = max(
      densitiesBuffer.element(instanceIndex),
      float(1e-8)
    ).toVar();
    const viscosityForce_i = vec3(0, 0, 0).toVar();
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
              const dist = pos_j.sub(pos_i).toVar();
              const r = dist.length().toVar();
              If(r.lessThan(h), () => {
                const lapW = float(viscosity).mul(float(h).sub(r)).toVar();
                const density_j = max(
                  densitiesBuffer.element(j),
                  float(1e-8)
                ).toVar();
                const vel_j = velocitiesBuffer.element(j);
                const invRhoAvg = float(2.0)
                  .div(density_i.add(density_j))
                  .toVar();
                viscosityForce_i.addAssign(
                  float(viscosityMu)
                    .mul(float(mass))
                    .mul(vel_j.sub(vel_i))
                    .mul(invRhoAvg)
                    .mul(lapW)
                    .toVar()
                );
              });
            });
            j.assign(j.add(uint(1)));
          });
        }
      }
    }
    viscosity_i.assign(viscosityForce_i);
  });
}
