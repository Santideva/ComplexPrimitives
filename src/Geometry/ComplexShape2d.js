// File: src/primitives/ComplexShape2D.js
import { Vertex } from "./Vertex.js";
import { Edge } from "./Edge.js";
import { Face } from "./Face.js";
import { ComplexPrimitive2D } from "../Primitives/ComplexPrimitive2d.js";
import { translateFace, rotateFace, bendFace} from "../Geometry/FaceTransformations.js";

let shapeCounter = 0;

export class ComplexShape2D extends ComplexPrimitive2D {
  constructor(params = {}) {
    super(params);
    this.id = ++shapeCounter;
    // Use vertices to define the shape.
    this.vertices = params.vertices || [
      new Vertex({ position: { x: 0, y: 0 }, color: this.color }),
      new Vertex({ position: { x: 1, y: 0 }, color: this.color }),
      new Vertex({ position: { x: 1, y: 1 }, color: this.color }),
      new Vertex({ position: { x: 0, y: 1 }, color: this.color }),
    ];
    // Define edges connecting the vertices.
    this.edges = params.edges || [
      new Edge(this.vertices[0], this.vertices[1], this.distanceMapper),
      new Edge(this.vertices[1], this.vertices[2], this.distanceMapper),
      new Edge(this.vertices[2], this.vertices[3], this.distanceMapper),
      new Edge(this.vertices[3], this.vertices[0], this.distanceMapper),
    ];
    // Define a face from these vertices.
    this.face = new Face(this.vertices);

    // Example: Log creation of a new shape.
    console.log(`Created ComplexShape2D with id: ${this.id}`);
  }

  // A simple SDF that finds the minimum effective edge distance.
  computeSDF(point) {
    return this.edges.reduce((min, edge) => {
      const d = Math.abs(edge.getEffectiveDistance() - edge.getRawDistance());
      return d < min ? d : min;
    }, Infinity);
  }
}
