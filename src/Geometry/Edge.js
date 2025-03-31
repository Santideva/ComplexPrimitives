// File: src/geometry/Edge.js

import { identityMapping } from "../utils/DistanceMapping.js";

let edgeCounter = 0;

export class Edge {
  constructor(vertexA, vertexB, distanceMapper = identityMapping) {
    this.id = ++edgeCounter;
    this.vertexA = vertexA;
    this.vertexB = vertexB;
    this.distanceMapper = distanceMapper;
  }

  getRawDistance() {
    const dx = this.vertexB.position.x - this.vertexA.position.x;
    const dy = this.vertexB.position.y - this.vertexA.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  getEffectiveDistance() {
    const rawDistance = this.getRawDistance();
    return this.distanceMapper(rawDistance);
  }
}
