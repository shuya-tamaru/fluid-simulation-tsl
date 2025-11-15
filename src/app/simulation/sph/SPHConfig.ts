export class SPHConfig {
  particleCount = 10000;
  delta = 1 / 60;
  restitution = 0.1;
  mass = 0.3;
  h = 1.0;
  restDensity = 1.0;
  pressureStiffness = 100;
  viscosityMu = 0.22;
  maxSpeed = 15;

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
