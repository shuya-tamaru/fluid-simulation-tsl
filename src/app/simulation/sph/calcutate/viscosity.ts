import {
  clamp,
  float,
  Fn,
  If,
  instanceIndex,
  Loop,
  uint,
  vec3,
  int,
  atomicLoad,
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
    const density_i = densitiesBuffer.element(instanceIndex);
    const viscosityForce_i = vec3(0, 0, 0).toVar();

    // @ts-ignore
    //prettier-ignore
    const cc = positionToCellCoord(pos_i, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord);

    const dz = int(-1).toVar();
    Loop(dz.lessThanEqual(1), () => {
      const zc = clamp(cc.z.add(dz), int(0), int(cellCountZ).sub(int(1)));
      const dy = int(-1).toVar();
      Loop(dy.lessThanEqual(1), () => {
        const yc = clamp(cc.y.add(dy), int(0), int(cellCountY).sub(int(1)));
        const dx = int(-1).toVar();
        Loop(dx.lessThanEqual(1), () => {
          const xc = clamp(cc.x.add(dx), int(0), int(cellCountX).sub(int(1)));
          // @ts-ignore
          //prettier-ignore
          const cellIndex = coordToIndex(vec3(xc, yc, zc), cellCountX, cellCountY)
          const start = cellStartIndicesBuffer.element(cellIndex).toVar();
          const count = atomicLoad(cellCountsBuffer.element(cellIndex)).toVar();
          const end = start.add(count).toVar();
          let j = uint(start).toVar();

          Loop(j.lessThan(end), () => {
            If(j.notEqual(instanceIndex), () => {
              const pos_j = positionsBuffer.element(j);
              const dist = pos_j.sub(pos_i).toVar();
              const r = dist.length().toVar();
              If(r.greaterThan(float(0.001)).and(r.lessThan(h)), () => {
                const lapW = float(viscosity).mul(float(h).sub(r)).toVar();
                const density_j = densitiesBuffer.element(j);
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
            j.addAssign(uint(1));
          });
          dx.addAssign(int(1));
        });
        dy.addAssign(int(1));
      });
      dz.addAssign(int(1));
    });

    viscosity_i.assign(viscosityForce_i);
  });
}
