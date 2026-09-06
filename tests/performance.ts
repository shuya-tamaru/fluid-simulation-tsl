import * as THREE from 'three/webgpu';
import { Particles } from '../src/app/simulation/sph/Particles';
import { SPHConfig } from '../src/app/simulation/sph/SPHConfig';
import { BoundaryConfig } from '../src/app/simulation/boundaries/BoundaryConfig';
import { FluidRenderer } from '../src/app/rendering/FluidRenderer';
import { defaultWaterSettings } from '../src/app/rendering/WaterRenderer';
import { SceneManager } from '../src/app/core/Scene';
import { CameraManager } from '../src/app/core/Camera';
const output = document.querySelector('#result')!;
const results: string[] = [];
async function run() {
  const renderer = new THREE.WebGPURenderer();
  renderer.setPixelRatio(1); renderer.setSize(1280, 720);
  document.body.append(renderer.domElement);
  const config = new SPHConfig();
  const particles = new Particles(renderer, config, new BoundaryConfig());
  await particles.initialize(); await particles.refreshSpatialData();
  const stage = new SceneManager();
  const camera = new CameraManager(1280 / 720).camera;
  camera.lookAt(0, 0, 0);
  const effects = new FluidRenderer(stage.scene, particles, config, new BoundaryConfig(),
    { enabled: true, amount: 1, appearance: 'Refined' }, defaultWaterSettings());
  const physics = () => particles.compute();
  const whitewater = () => effects.update(renderer, config.delta);
  const render = () => effects.render(renderer, stage.scene, camera);
  // Fixed workload, no RAF/catch-up, GPU completion included in each measurement.
  const measure = async (label: string, action: () => Promise<void>) => {
    for (let i = 0; i < 5; i++) await action();
    await renderer.waitForGPU();
    const start = performance.now();
    for (let i = 0; i < 60; i++) await action();
    await renderer.waitForGPU();
    const ms = (performance.now() - start) / 60;
    results.push(`${label}: ${ms.toFixed(2)} ms/iteration`);
    output.textContent = results.join('\n');
    console.info(results[results.length - 1]);
  };
  for (let i = 0; i < 60; i++) await physics();
  await particles.splash();
  for (let i = 0; i < 30; i++) { await physics(); await whitewater(); }
  await measure('Physics (2 substeps)', physics);
  await measure('Whitewater (frozen fluid)', whitewater);
  await measure('Water rendering (frozen particles)', render);
  await measure('Combined fixed frame', async () => { await physics(); await whitewater(); await render(); });
  output.textContent = results.join('\n') + '\nDONE (30,000 particles, 1280×720, DPR 1)';
  console.info(output.textContent);
  effects.dispose(); renderer.dispose();
}
run().catch(error => { output.textContent += `\nFAIL ${error.stack}`; console.error(error); });
