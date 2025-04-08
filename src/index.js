// File: src/index.js
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CameraManager } from "./rendering/cameraManager.js";
import { LightingManager } from "./rendering/LightingManager.js";
import { TextureLoader } from "./rendering/TextureLoader.js";
import { ComplexShape2D } from "./Geometry/ComplexShape2d.js";
import { stateStore } from "./state/stateStore.js";
import { logger } from "./utils/logger.js";
import { createPolynomialMapping, distanceMappingRegistry } from "./utils/DistanceMapping.js";
import { translateFace } from "./Geometry/FaceTransformations.js";
import * as dat from "dat.gui";

// Import derived primitives (Triangle and Arc)
import { TrianglePrimitive, ArcPrimitive } from "./Primitives/primaryDerivativePrimitives.js";

// 1. Create Scene
const scene = new THREE.Scene();

// 2. Camera Setup via CameraManager
const cameraManager = new CameraManager();
const camera = cameraManager.getCamera();

// 3. Renderer Setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("viewport").appendChild(renderer.domElement);

// 4. Controls
const controls = new OrbitControls(camera, renderer.domElement);

// 5. Lighting via LightingManager
const lightingManager = new LightingManager(scene);

// 6. Define a function to instantiate the chosen primitive
let currentPrimitive = null;  // Global variable for currently active primitive

function instantiatePrimitive(type) {
  // Remove current primitive from scene and clear stateStore if needed
  if (currentPrimitive) {
    // Remove its object from the scene
    scene.remove(currentPrimitive.object);
    // Optionally remove it from the stateStore (or clear the shapes array)
    stateStore.removeShape(currentPrimitive.id);
    currentPrimitive = null;
  }

  // Depending on type, instantiate the chosen primitive
  switch (type.toLowerCase()) {
    case "line":
      // Instantiate a base line-segment primitive with polynomial mapping
      const initialPolyCoeffs = [0, 1, 0.5];
      const polyMapping = createPolynomialMapping(initialPolyCoeffs);
      const lineSegmentShape = new ComplexShape2D({
        metric: { center: { x: 0.5, y: 0.5 }, scale: 1, polyCoeffs: initialPolyCoeffs },
        color: { h: 200, s: 0.8, l: 0.6, a: 1 },
        distanceMapper: polyMapping
      });
      stateStore.addShape(lineSegmentShape);
      logger.info("Line segment shape instantiated.");
      currentPrimitive = { instance: lineSegmentShape, type: "line" };
      // For consistency, we create its Three.js object using createLineObject
      currentPrimitive.object = lineSegmentShape.createLineObject();
      break;
    case "triangle":
      // Instantiate a TrianglePrimitive
      const triangle = new TrianglePrimitive({
        size: 1,
        rotation: 0,
        position: { x: -1, y: 0 },
        cornerRounding: 0,
        edgeSmoothness: [0, 0, 0],
        color: { h: 210, s: 0.8, l: 0.6, a: 1 },
        blendSmoothness: 8
      });
      triangle.registerWithStateStore(stateStore);
      stateStore.addShape(triangle);
      logger.info("Triangle primitive instantiated.");
      currentPrimitive = { instance: triangle, type: "triangle" };
      currentPrimitive.object = triangle.createObject();
      break;
    case "arc":
      // Instantiate an ArcPrimitive
      const arc = new ArcPrimitive({
        radius: 1.5,
        startAngle: 0,
        endAngle: Math.PI,
        segments: 8,
        position: { x: 1, y: 0 },
        thickness: 0,
        color: { h: 30, s: 0.9, l: 0.5, a: 1 },
        blendSmoothness: 8
      });
      arc.registerWithStateStore(stateStore);
      stateStore.addShape(arc);
      logger.info("Arc primitive instantiated.");
      currentPrimitive = { instance: arc, type: "arc" };
      currentPrimitive.object = arc.createObject();
      break;
    default:
      console.warn("Unknown primitive type. Defaulting to line.");
      instantiatePrimitive("line");
      return;
  }

  // Add the new primitive object to the scene
  scene.add(currentPrimitive.object);
}

// Initially, instantiate the line primitive
instantiatePrimitive("line");

// 7. (Existing code for line segment updating remains as fallback for time-based mapping)
// Function to update geometry for time-dependent mappings (used for the base line, if active)
function updateGeometry(time = 0) {
  if (currentPrimitive && currentPrimitive.type === "line") {
    scene.remove(currentPrimitive.object);
    currentPrimitive.object = currentPrimitive.instance.createLineObject(time);
    scene.add(currentPrimitive.object);
    logger.info("Line segment updated with new mapping parameters.");
  }
}

// Extend ComplexShape2D prototype to handle time parameter if needed
if (!ComplexShape2D.prototype.createLineObject) {
  ComplexShape2D.prototype.createLineObject = function(time = 0) {
    const mappedPoints = this.vertices.map(vertex => {
      const originalPos = vertex.position;
      const mappedDistance = this.distanceMapper(
        Math.sqrt((originalPos.x - 0.5) ** 2 + (originalPos.y - 0.5) ** 2),
        time
      );
      const angle = Math.atan2(originalPos.y - 0.5, originalPos.x - 0.5);
      const x = 0.5 + mappedDistance * Math.cos(angle);
      const y = 0.5 + mappedDistance * Math.sin(angle);
      return new THREE.Vector3(x, y, 0);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(mappedPoints);
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color().setHSL(this.color.h / 360, this.color.s, this.color.l)
    });
    return new THREE.Line(geometry, material);
  };
}

// Register visual update callback for the line segment (if active)
stateStore.onVisualUpdate((shapeId) => {
  if (currentPrimitive && shapeId === currentPrimitive.instance.id && currentPrimitive.type === "line") {
    updateGeometry();
  }
});

// Initialize stateStore with default mapping configuration
stateStore.updateMappingConfig({
  mappingType: "polynomial",
  polyCoeffs: [0, 1, 0.5],
  a: 1,
  b: 1,
  c: 0,
  e: 0,
  blendFactor: 0.5,
  frequency: 1.0,
  recursionLimit: 3
});

// 8. dat.GUI Setup for User Interaction
const gui = new dat.GUI();

// Primitive Selection Controls
const primitiveSelection = { primitive: "Line" }; // default selection
gui.add(primitiveSelection, "primitive", ["Line", "Triangle", "Arc"])
  .name("Select Primitive")
  .onChange((value) => {
    // When user changes the primitive type, instantiate the selected type
    instantiatePrimitive(value);
  });

// Lighting Controls
const lightingFolder = gui.addFolder("Lighting");
lightingFolder.add(lightingManager.ambientLight, "intensity", 0, 2).name("Ambient Intensity");
lightingFolder.add(lightingManager.directionalLight, "intensity", 0, 2).name("Directional Intensity");

// Distance Mapping Controls (for the line segment)
const mapperFolder = gui.addFolder("Distance Mapping");
const mappingParams = {
  a: 1,
  b: 1,
  c: 0,
  e: 0,
  polyCoeffs: [0, 1, 0.5].join(",")
};
mapperFolder.add(stateStore, "selectedMappingType", [
  "identity", "polynomial", "exponential", "logarithmic", 
  "sinusoidal", "power", "composite", "periodic", 
  "temporal", "recursive", "sequential", "blended"
])
.name("Mapping Type")
.onChange(() => {
  if (currentPrimitive && currentPrimitive.type === "line") {
    stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    logger.info(`Mapper type updated to: ${stateStore.selectedMappingType}`);
  }
});
mapperFolder.add(stateStore, "blendFactor", 0, 1).step(0.01)
  .name("Blend Factor")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ blendFactor: stateStore.blendFactor });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(stateStore, "timeFrequency", 0.1, 5).step(0.1)
  .name("Time Frequency")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ frequency: stateStore.timeFrequency });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(stateStore, "amplitude", 0, 2).step(0.1)
  .name("Amplitude")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ amplitude: stateStore.amplitude });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
      logger.info(`Amplitude updated to: ${stateStore.amplitude}`);
    }
  });
mapperFolder.add(stateStore, "recursionLimit", 1, 5).step(1)
  .name("Recursion Depth")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ recursionLimit: stateStore.recursionLimit });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(mappingParams, "polyCoeffs")
  .name("Poly Coeffs (comma-separated)")
  .onFinishChange(val => {
    const coeffs = val.split(",").map(Number);
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ polyCoeffs: coeffs });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
      logger.info(`Polynomial coefficients updated to: ${coeffs}`);
    }
  });
mapperFolder.add(mappingParams, "a", 0.1, 5).step(0.1)
  .name("Scale Factor (a)")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ a: mappingParams.a });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(mappingParams, "b", 0.1, 5).step(0.1)
  .name("Rate Factor (b)")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ b: mappingParams.b });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(mappingParams, "c", -2, 2).step(0.1)
  .name("Offset (c)")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ c: mappingParams.c });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(mappingParams, "e", -2, 2).step(0.1)
  .name("Additional Offset (e)")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ e: mappingParams.e });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.open();

// GUI Controls for Triangle Primitive (only shown when triangle is selected)
const triangleFolder = gui.addFolder("Triangle Controls");
const triangleParams = {
  size: 1,
  rotation: 0,
  cornerRounding: 0,
  posX: -1,
  posY: 0
};
triangleFolder.add(triangleParams, "size", 0.1, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "triangle") {
    currentPrimitive.instance.updateParameters({ size: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
triangleFolder.add(triangleParams, "rotation", 0, Math.PI * 2).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "triangle") {
    currentPrimitive.instance.updateParameters({ rotation: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
triangleFolder.add(triangleParams, "cornerRounding", 0, 2).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "triangle") {
    currentPrimitive.instance.updateParameters({ cornerRounding: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
triangleFolder.add(triangleParams, "posX", -5, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "triangle") {
    currentPrimitive.instance.updateParameters({ position: { x: value, y: triangleParams.posY } });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
triangleFolder.add(triangleParams, "posY", -5, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "triangle") {
    currentPrimitive.instance.updateParameters({ position: { x: triangleParams.posX, y: value } });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
triangleFolder.open();

// GUI Controls for Arc Primitive (only shown when arc is selected)
const arcFolder = gui.addFolder("Arc Controls");
const arcParams = {
  radius: 1.5,
  startAngle: 0,
  endAngle: Math.PI,
  segments: 8,
  thickness: 0,
  posX: 1,
  posY: 0
};
arcFolder.add(arcParams, "radius", 0.1, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ radius: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "startAngle", 0, Math.PI * 2).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ startAngle: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "endAngle", 0, Math.PI * 2).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ endAngle: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "segments", 3, 20).step(1).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ segments: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "thickness", 0, 2).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ thickness: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "posX", -5, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ position: { x: value, y: arcParams.posY } });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "posY", -5, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ position: { x: arcParams.posX, y: value } });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.open();

// 10. Animation Loop with time tracking
let startTime = performance.now();
function animate() {
  const currentTime = (performance.now() - startTime) / 1000.0; // Time in seconds
  
  // For the line primitive, update geometry with time-dependent mapping
  if (currentPrimitive && currentPrimitive.type === "line" && ["temporal", "sequential", "blended"].includes(stateStore.selectedMappingType)) {
    updateGeometry(currentTime);
  }
  
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Set initial camera position and start animation
camera.position.set(0, 0, 5);
controls.update();
animate();

// 11. Handle Window Resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cameraManager.updateAspect(window.innerWidth, window.innerHeight);
});
