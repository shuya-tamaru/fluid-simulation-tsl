import * as THREE from 'three/webgpu';
import { Fn, If, instanceIndex, instancedArray, vec3, vec4 } from 'three/tsl';
import { BoundaryConfig } from '../src/app/simulation/boundaries/BoundaryConfig';
import { computeIntegratePass } from '../src/app/simulation/sph/calcutate/integrate';
import { SPHConfig } from '../src/app/simulation/sph/SPHConfig';
import { Particles } from '../src/app/simulation/sph/Particles';
import { WhitewaterRenderer } from '../src/app/rendering/WhitewaterRenderer';
import type { StorageBufferType } from '../src/app/types/BufferType';
const output = document.querySelector('#result')!;
async function run() {
  const renderer = new THREE.WebGPURenderer(); await renderer.init();
  const boundary = new BoundaryConfig();
  const p = instancedArray(3, 'vec3'), v = instancedArray(3, 'vec3');
  const force = instancedArray(3, 'vec3');
  const seed = (positions: StorageBufferType, velocities: StorageBufferType, states?: StorageBufferType) => Fn(() => {
    If(instanceIndex.lessThan(3), () => {
      const top = instanceIndex.equal(0), bottom = instanceIndex.equal(1);
      positions.element(instanceIndex).assign(vec3(top.or(bottom).select(0, 7.99), top.select(7.99, bottom.select(-7.99, 0)), 0));
      velocities.element(instanceIndex).assign(vec3(top.or(bottom).select(0, 10), top.select(10, bottom.select(-10, 0)), 0));
      if (states) states.element(instanceIndex).assign(vec4(5, 5, 1, 1));
    });
  })().compute(3);
  const init = seed(p, v);
  const integrate = computeIntegratePass(p, v, force, force, 1, 1 / 60, 0.5, 0,
    boundary.width, boundary.height, boundary.depth, boundary.topCollision, boundary.xMin, 3)().compute(3);
  const messages: string[] = [];
  const verify = async (label: string, positions: StorageBufferType, enabled: boolean) => {
    const data = new Float32Array(await renderer.getArrayBufferAsync(positions.value));
    const valid = (enabled ? data[1] < 8 : data[1] > 8) && data[5] > -8 && data[8] < 8;
    if (!valid) throw new Error(`${label}: ${[...data]}`);
    messages.push(`PASS ${label}: top ${enabled ? 'closed' : 'open'}, floor and sides retained`);
    console.info(messages[messages.length - 1]); output.textContent = messages.join('\n');
  };
  for (const enabled of [true, false, true]) {
    boundary.topCollision.value = enabled;
    await renderer.computeAsync([init, integrate]);
    await verify('Fluid', p, enabled);
  }
  const config = new SPHConfig(); config.particleCount = 1;
  const particles = new Particles(renderer, config, boundary);
  await particles.initialize(); await particles.refreshSpatialData();
  const effects = new WhitewaterRenderer(particles, config, boundary, { enabled: true, amount: 0 });
  // Test-only access for a deterministic crossing fixture; production has no readback.
  const buffers = effects as unknown as { positions: StorageBufferType; velocities: StorageBufferType; states: StorageBufferType };
  const seedEffects = seed(buffers.positions, buffers.velocities, buffers.states);
  for (const enabled of [true, false, true]) {
    boundary.topCollision.value = enabled;
    await renderer.computeAsync(seedEffects);
    await effects.update(renderer);
    await verify('Whitewater', buffers.positions, enabled);
  }
  effects.dispose(); renderer.dispose();
  output.textContent += '\nAll boundary checks passed.';
  console.info('All boundary checks passed.');
}
run().catch(error => { output.textContent += `\nFAIL ${error}`; console.error(error); });
