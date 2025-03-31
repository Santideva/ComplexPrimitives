// File: src/rendering/CameraManager.js
import * as THREE from "three";

export class CameraManager {
  constructor(params = {}) {
    // Default perspective camera parameters
    const fov = params.fov || 75;
    const aspect = params.aspect || window.innerWidth / window.innerHeight;
    const near = params.near || 0.1;
    const far = params.far || 1000;

    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.camera.position.set(0, 0, 5);
  }

  getCamera() {
    return this.camera;
  }

  updateAspect(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
