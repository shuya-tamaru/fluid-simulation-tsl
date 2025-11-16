import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";
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
import {
  coordToIndex,
  positionToCellCoord,
} from "../utils/positionToCellIndex";

export function computePressureForcePass(
  positionsBuffer: StorageBufferType,
  densitiesBuffer: StorageBufferType,
  pressuresBuffer: StorageBufferType,
  pressureForcesBuffer: StorageBufferType,
  cellStartIndicesBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType,
  mass: number,
  h: number,
  spiky: number,
  cellSize: number,
  cellCountX: number,
  cellCountY: number,
  cellCountZ: number,
  xMinCoord: number,
  yMinCoord: number,
  zMinCoord: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pressureForce_i = pressureForcesBuffer.element(instanceIndex);
    const pressure_i = pressuresBuffer.element(instanceIndex);
    const pos_i = positionsBuffer.element(instanceIndex);
    const density_i = max(
      densitiesBuffer.element(instanceIndex),
      float(1e-8)
    ).toVar();
    const pForce_i = vec3(0, 0, 0).toVar();

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
            const pos_j = positionsBuffer.element(j);
            const dir = pos_j.sub(pos_i).toVar();
            const r = dir.length().toVar();

            If(r.greaterThan(float(0.001)).and(r.lessThan(h)), () => {
              const t = float(h).sub(r).toVar();
              const density_j = densitiesBuffer.element(j);
              const _dir = dir.div(r).toVar();
              const gradW = float(spiky).mul(t.mul(t)).mul(_dir).toVar();
              const rhoj = max(density_j, float(1e-8)).toVar();
              const press_j = pressuresBuffer.element(j);
              const term = pressure_i
                .div(density_i.mul(density_i))
                .add(press_j.div(rhoj.mul(rhoj)))
                .toVar();
              const fi = float(mass)
                .mul(float(mass))
                .mul(term)
                .mul(gradW)
                .toVar();
              pForce_i.addAssign(fi);
            });
            // If(j.notEqual(instanceIndex), () => {
            //   If(r.lessThan(h), () => {
            //     const t = float(h).sub(r).toVar();
            //     If(t.greaterThan(float(0.0)), () => {
            //       const density_j = densitiesBuffer.element(j);
            //       const _dir = dir.div(r).toVar();
            //       const gradW = float(spiky).mul(t.mul(t)).mul(_dir).toVar();
            //       const rhoj = max(density_j, float(1e-8)).toVar();
            //       const press_j = pressuresBuffer.element(j);
            //       const term = pressure_i
            //         .div(density_i.mul(density_i))
            //         .add(press_j.div(rhoj.mul(rhoj)))
            //         .toVar();
            //       const fi = float(mass)
            //         .mul(float(mass))
            //         .mul(term)
            //         .mul(gradW)
            //         .toVar();
            //       pForce_i.addAssign(fi);
            //     });
            //   });
            // });
            j.addAssign(uint(1));
          });
        }
      }
    }

    // let j = uint(0).toVar();
    // Loop(j.lessThan(particleCount), () => {
    //   If(j.notEqual(instanceIndex), () => {
    //     const pos_j = positionsBuffer.element(j);

    //     const dir = pos_j.sub(pos_i).toVar();
    //     const r = dir.length().toVar();
    //     If(r.lessThan(h), () => {
    //       const t = float(h).sub(r).toVar();
    //       If(t.greaterThan(float(0.0)), () => {
    //         const density_j = densitiesBuffer.element(j);
    //         const _dir = dir.div(r).toVar();
    //         const gradW = float(spiky).mul(t.mul(t)).mul(_dir).toVar();
    //         const rhoj = max(density_j, float(1e-8)).toVar();
    //         const press_j = pressuresBuffer.element(j);
    //         const term = pressure_i
    //           .div(density_i.mul(density_i))
    //           .add(press_j.div(rhoj.mul(rhoj)))
    //           .toVar();
    //         const fi = float(mass)
    //           .mul(float(mass))
    //           .mul(term)
    //           .mul(gradW)
    //           .toVar();
    //         pForce_i.addAssign(fi);
    //       });
    //     });
    //   });
    //   j.assign(j.add(uint(1)));
    // });
    pressureForce_i.assign(pForce_i);
  });
}
