export class SPHConfig {
  particleCount = 30000;
  delta = 1 / 60;
  restitution = 0.3;
  mass = 0.2;
  h = 1;
  restDensity = 1;
  pressureStiffness = 100;
  viscosityMu = 0.22;
  maxSpeed = 20;

  get h2() {
    return Math.pow(this.h, 2);
  }
  get h3() {
    return Math.pow(this.h, 3);
  }
  get h6() {
    return Math.pow(this.h, 6);
  }
  get h9() {
    return Math.pow(this.h, 9);
  }
  get poly6Kernel() {
    return 315 / (64 * Math.PI * this.h9);
  }
  get spiky() {
    return -45 / (Math.PI * this.h6);
  }

  get viscosity() {
    return 45 / (Math.PI * this.h6);
  }
}
