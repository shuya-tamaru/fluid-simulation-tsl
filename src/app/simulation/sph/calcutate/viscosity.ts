import {
  clamp,
  float,
  Fn,
  If,
  instanceIndex,
  Loop,
  vec3,
  int,
  atomicLoad,
  max,
  dot,
  inverseSqrt,
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
  h2: number,
  mass: number,
  cellSize: number,
  cellCountX: number,
  cellCountY: number,
  cellCountZ: number,
  xMinCoord: number,
  yMinCoord: number,
  zMinCoord: number,
  particleCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const i = instanceIndex.toVar();
    If(i.lessThan(particleCount), () => {
      const pos_i = positionsBuffer.element(i);
      const vel_i = velocitiesBuffer.element(i);
      const viscosity_i = viscosityForcesBuffer.element(i);
      const density_i = densitiesBuffer.element(i);
      const rho_i = max(density_i, float(1e-8)).toVar();
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
            const count = atomicLoad(cellCountsBuffer.element(cellIndex));
            const end = start.add(count).toVar();
            let j = int(start).toVar();

            Loop(j.lessThan(end), () => {
              If(j.notEqual(i), () => {
                const pos_j = positionsBuffer.element(j);
                const dist = pos_i.sub(pos_j).toVar();
                const r2 = dot(dist, dist);
                If(r2.lessThan(h2), () => {
                  const invR = inverseSqrt(max(r2, float(1e-8).mul(h2)));
                  const r = float(1.0).div(invR).toVar();
                  const lapW = float(viscosity).mul(float(h).sub(r)).toVar();
                  const density_j = densitiesBuffer.element(j);
                  const rho_j = max(density_j, float(1e-8)).toVar();
                  const vel_j = velocitiesBuffer.element(j);
                  const invRhoAvg = float(2.0).div(rho_i.add(rho_j)).toVar();
                  viscosityForce_i.addAssign(
                    float(viscosityMu)
                      .mul(mass)
                      .mul(vel_j.sub(vel_i))
                      .mul(invRhoAvg)
                      .mul(lapW)
                      .toVar()
                  );
                });
              });
              j.addAssign(int(1));
            });
            dx.addAssign(int(1));
          });
          dy.addAssign(int(1));
        });
        dz.addAssign(int(1));
      });

      viscosity_i.assign(viscosityForce_i);
    });
  });
}
