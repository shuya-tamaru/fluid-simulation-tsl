import * as THREE from 'three/webgpu';
import { Fn, If, instanceIndex, vec3 } from 'three/tsl';
import { Particles } from '../src/app/simulation/sph/Particles';
import { SPHConfig } from '../src/app/simulation/sph/SPHConfig';
import { BoundaryConfig } from '../src/app/simulation/boundaries/BoundaryConfig';
import { WhitewaterRenderer } from '../src/app/rendering/WhitewaterRenderer';
import { WaterRenderer, defaultWaterSettings } from '../src/app/rendering/WaterRenderer';
import { SceneManager } from '../src/app/core/Scene';
async function main() {
 const renderer = new THREE.WebGPURenderer(); renderer.setPixelRatio(window.devicePixelRatio); renderer.setSize(1000,600); document.body.append(renderer.domElement);
 const config = new SPHConfig(); config.particleCount = 12;
 const boundary = new BoundaryConfig(); const particles = new Particles(renderer,config,boundary); await particles.initialize();
 const positions = [[-1.5,.5,0],[-.7,.5,0],[.05,.5,0],[.25,.5,-.2],[1,.5,0],[1.2,.5,0],[1.4,.5,0],[1.1,.7,0],[1.3,.7,0],[1.1,.3,0],[1.3,.3,0],[0,-.6,0]];
 const seed = Fn(()=> { positions.forEach((p,i)=> {If(instanceIndex.equal(i),()=> {particles.getPositionsBuffer().element(instanceIndex).assign(vec3(...p));});}); })().compute(12);
 await renderer.computeAsync(seed); await particles.refreshSpatialData();
 const whitewater = new WhitewaterRenderer(particles,config,boundary,{enabled:false,amount:0}); await whitewater.update(renderer);
 const water = new WaterRenderer(particles,whitewater,defaultWaterSettings()); const scene = new SceneManager().scene;
 const camera = new THREE.PerspectiveCamera(45,1000/600,.1,100); camera.position.set(0,0,4); camera.lookAt(0,0,0);
 const draw = async (debug:number)=> { water.setDebug(debug); await water.render(renderer,scene,camera); await renderer.waitForGPU(); console.info(`Rendered debug=${debug}`); };
 document.querySelector('#surface')!.addEventListener('click',()=>draw(0)); document.querySelector('#normals')!.addEventListener('click',()=>draw(1));
 await draw(0);
}
main().catch(console.error);
