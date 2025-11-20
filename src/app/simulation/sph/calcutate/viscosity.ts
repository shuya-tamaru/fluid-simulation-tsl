import {
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
        const zTarget = cc.z.add(dz);
        const dy = int(-1).toVar();
        Loop(dy.lessThanEqual(1), () => {
          const yTarget = cc.y.add(dy);
          const dx = int(-1).toVar();
          Loop(dx.lessThanEqual(1), () => {
            const xTarget = cc.x.add(dx);
            const isValidCell = xTarget
              .greaterThanEqual(0)
              .and(xTarget.lessThan(cellCountX))
              .and(yTarget.greaterThanEqual(0))
              .and(yTarget.lessThan(cellCountY))
              .and(zTarget.greaterThanEqual(0))
              .and(zTarget.lessThan(cellCountZ));

            If(isValidCell, () => {
              // @ts-ignore
              //prettier-ignore
              const cellIndex = coordToIndex(vec3(xTarget, yTarget, zTarget), cellCountX, cellCountY);
              const start = cellStartIndicesBuffer.element(cellIndex).toVar();
              const count = atomicLoad(cellCountsBuffer.element(cellIndex));
              const end = start.add(count).toVar();
              let j = int(start).toVar();

              Loop(j.lessThan(end), () => {
                If(j.notEqual(i), () => {
                  const pos_j = positionsBuffer.element(j);
                  const d = pos_i.sub(pos_j);
                  const r2 = dot(d, d);
                  If(r2.lessThan(h2), () => {
                    const invR = inverseSqrt(max(r2, float(1e-8).mul(h2)));
                    const r = float(1.0).div(invR);
                    const t = float(h).sub(r);
                    If(t.greaterThan(float(0.0)), () => {
                      const lapW = float(viscosity).mul(float(h).sub(r));
                      const density_j = densitiesBuffer.element(j);
                      const rho_j = max(density_j, float(1e-8));
                      const vel_j = velocitiesBuffer.element(j);
                      const invRhoAvg = float(2.0)
                        .div(rho_i.add(rho_j))
                        .toVar();
                      viscosityForce_i.addAssign(
                        float(viscosityMu)
                          .mul(mass)
                          .mul(vel_j.sub(vel_i))
                          .mul(invRhoAvg)
                          .mul(lapW)
                      );
                    });
                  });
                });
                j.addAssign(int(1));
              });
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
