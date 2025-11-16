import { clamp, Fn, int, ivec3, vec3 } from "three/tsl";

// @ts-ignore
//prettier-ignore
export const positionToCellCoord = Fn(([position, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord]) => {
  const resolution = position
    .sub(vec3(xMinCoord, yMinCoord, zMinCoord))
    .div(vec3(cellSize))
    .toVar();
  const cx = resolution.x.floor().toInt();
  const cy = resolution.y.floor().toInt();
  const cz = resolution.z.floor().toInt();

  const cxc = clamp(cx, int(0), int(cellCountX).sub(int(1)));
  const cyc = clamp(cy, int(0), int(cellCountY).sub(int(1)));
  const czc = clamp(cz, int(0), int(cellCountZ).sub(int(1)));

  return ivec3(cxc, cyc, czc);
});

// @ts-ignore
//prettier-ignore
export const coordToIndex = Fn(([c, cellCountX, cellCountY]) => {
  return c.x.add(c.y.mul(cellCountX)).add(c.z.mul(cellCountX.mul(cellCountY)));
});

// @ts-ignore
//prettier-ignore
export const positionToCellIndex = Fn(([position, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord]) => {
  // @ts-ignore
  const c = positionToCellCoord(position, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord)
  
  // @ts-ignore
  return coordToIndex(c, cellCountX, cellCountY)
});
