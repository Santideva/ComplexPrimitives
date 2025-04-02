// File: src/primitives/ComplexShape2D.js
import { Vertex } from "./Vertex.js";
import { Edge } from "./Edge.js";
// For a line-segment primitive, we do not need a full face, so we set it to null.
import { ComplexPrimitive2D } from "../Primitives/ComplexPrimitive2d.js";
import { translateFace, rotateFace, bendFace } from "../Geometry/FaceTransformations.js";
import { 
  createCompositeSDF, 
  blendMultipleSDFs, 
  weightedRUnion, 
  weightedRIntersection, 
  weightedRDifference 
} from "../utils/SDFBlending.js";

let shapeCounter = 0;

export class ComplexShape2D extends ComplexPrimitive2D {
  constructor(params = {}) {
    super(params);
    this.id = ++shapeCounter;

    // Set primitiveType to "line" (since we're now using a line-segment primitive).
    this.primitiveType = 'line';

    // Use vertices to define the line segment (2 vertices instead of 4).
    this.vertices = params.vertices || [
      new Vertex({ position: { x: 0, y: 0 }, color: this.color }),
      new Vertex({ position: { x: 1, y: 0 }, color: this.color })
    ];

    // Define a single edge connecting the two vertices.
    this.edges = params.edges || [
      new Edge(this.vertices[0], this.vertices[1], this.distanceMapper)
    ];

    // For a line segment, we won't define a face.
    this.face = null;

    // Blending parameters remain as before.
    this.blendParams = {
      smoothness: params.smoothness || 8,
      operation: params.operation || 'union',
      primitives: (params.primitives || []).filter(p => p !== this),
      basePrimitive: params.basePrimitive || null
    };

    // Initialize the composite SDF (if blending is used)
    this.updateCompositeSDF();

    console.log(`Created ComplexShape2D with id: ${this.id} as a line-segment primitive`);
  }

  // For a line segment, the base SDF is simply the distance from the point to the single edge.
  calculateBaseSDF(point) {
    // Use our helper method to compute the distance to the single edge.
    if (this.edges.length > 0) {
      return this.distanceToEdge(this.edges[0], point);
    }
    return Infinity;
  }

  // Helper method to calculate distance from a point to an edge (unchanged from before)
  distanceToEdge(edge, point) {
    const { x: x1, y: y1 } = edge.vertexA.position;
    const { x: x2, y: y2 } = edge.vertexB.position;
    const { x, y } = point;

    // Vector from edge start to point
    const dx = x - x1;
    const dy = y - y1;

    // Edge vector
    const edgeX = x2 - x1;
    const edgeY = y2 - y1;

    // Square of edge length
    const edgeLengthSquared = edgeX * edgeX + edgeY * edgeY;

    // If edge is effectively a point, return distance to that point
    if (edgeLengthSquared === 0) {
      return Math.sqrt(dx * dx + dy * dy);
    }

    // Project point onto edge line, clamped to [0,1]
    const t = Math.max(0, Math.min(1, (dx * edgeX + dy * edgeY) / edgeLengthSquared));

    // Closest point on edge
    const closestX = x1 + t * edgeX;
    const closestY = y1 + t * edgeY;

    // Distance to closest point
    return Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);
  }

  // Update the cached composite SDF function based on current blending parameters.
  updateCompositeSDF() {
    const primitives = (this.blendParams.primitives || []).filter(p => p !== this);
    
    // For a line-segment primitive, if there are no additional primitives, we won't update compositeSDF.
    if (primitives.length === 0) {
      this.compositeSDF = null;
      return;
    }
    
    // Handle difference operation specially.
    if (this.blendParams.operation.toLowerCase() === 'difference') {
      if (this.blendParams.basePrimitive) {
        const orderedPrimitives = [
          this.blendParams.basePrimitive,
          ...primitives.filter(p => p !== this.blendParams.basePrimitive)
        ];
        this.compositeSDF = createCompositeSDF(
          orderedPrimitives,
          this.blendParams.smoothness,
          'difference'
        );
      } else {
        this.compositeSDF = createCompositeSDF(
          primitives,
          this.blendParams.smoothness,
          'difference'
        );
      }
    } else {
      const operation = this.blendParams.operation.toLowerCase();
      if (operation !== 'union' && operation !== 'intersection') {
        console.warn(`Invalid blending operation: "${operation}". Defaulting to "union".`);
      }
      this.compositeSDF = createCompositeSDF(
        primitives,
        this.blendParams.smoothness,
        operation === 'intersection' ? 'intersection' : 'union'
      );
    }
  }

  // computeSDF: For a line segment, simply return the base SDF or blend if additional primitives exist.
  // We add a callStack to prevent infinite recursion.
  computeSDF(point, callStack = []) {
    if (callStack.includes(this.id)) {
      console.warn(`Detected recursive SDF calculation for shape ${this.id}`);
      return this.calculateBaseSDF(point);
    }
    
    const newCallStack = [...callStack, this.id];
    const baseSDF = this.calculateBaseSDF(point);
    
    if (!this.blendParams.primitives || this.blendParams.primitives.length === 0) {
      return baseSDF;
    }
    
    if (!this.compositeSDF) {
      console.warn("Composite SDF not initialized. Returning base SDF.");
      return baseSDF;
    }
    
    const compositeSdfValue = this.getCompositeSdfValue(point, newCallStack);
    const op = this.blendParams.operation.toLowerCase();
    const smoothness = this.blendParams.smoothness;
    
    if (op === 'union') {
      return weightedRUnion(baseSDF, compositeSdfValue, smoothness);
    } else if (op === 'intersection') {
      return weightedRIntersection(baseSDF, compositeSdfValue, smoothness);
    } else if (op === 'difference') {
      if (this.blendParams.basePrimitive) {
        return compositeSdfValue;
      } else {
        return weightedRDifference(baseSDF, compositeSdfValue, smoothness);
      }
    }
    return baseSDF;
  }

  // Helper method to safely get composite SDF value.
  getCompositeSdfValue(point, callStack = []) {
    try {
      if (typeof this.compositeSDF === 'function') {
        const primitives = this.blendParams.primitives.filter(p => p !== this);
        if (primitives.length === 0) return Infinity;
        if (primitives.length === 1) {
          return primitives[0].computeSDF ? 
            primitives[0].computeSDF(point, callStack) : 
            primitives[0].computeSDF(point);
        }
        return this.compositeSDF(point);
      }
      return Infinity;
    } catch (error) {
      console.error(`Error computing composite SDF: ${error}`);
      return Infinity;
    }
  }

  // Methods for managing blending parameters remain largely unchanged.
  addBlendPrimitive(primitive, operation = null) {
    if (!this.blendParams.primitives) {
      this.blendParams.primitives = [];
    }
    if (primitive !== this) {
      this.blendParams.primitives.push(primitive);
    } else {
      console.warn("Attempted to add self-reference to blend primitives. Ignoring.");
    }
    if (operation) {
      this.blendParams.operation = operation;
    }
    this.updateCompositeSDF();
    return this;
  }
  
  setBlendParams(params = {}) {
    const oldParams = JSON.stringify(this.blendParams);
    this.blendParams = {
      ...this.blendParams,
      ...params
    };
    if (this.blendParams.primitives) {
      this.blendParams.primitives = this.blendParams.primitives.filter(p => p !== this);
    }
    if (oldParams !== JSON.stringify(this.blendParams)) {
      this.updateCompositeSDF();
    }
    return this;
  }
  
  setBasePrimitive(primitive) {
    if (primitive === this) {
      console.warn("Cannot set self as base primitive. Ignoring.");
      return this;
    }
    this.blendParams.basePrimitive = primitive;
    if (this.blendParams.operation.toLowerCase() === 'difference') {
      this.updateCompositeSDF();
    }
    return this;
  }
  
  clearBlendPrimitives() {
    this.blendParams.primitives = [];
    this.updateCompositeSDF();
    return this;
  }
  
  // For a line segment, transform updates the two vertices and then the composite SDF.
  transform(matrix) {
    super.transform(matrix);
    for (const vertex of this.vertices) {
      if (vertex.transform) {
        vertex.transform(matrix);
      }
    }
    this.updateCompositeSDF();
    return this;
  }
}
