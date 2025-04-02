// File: src/primitives/ComplexPrimitive2D.js (Updated)

import { identityMapping, distanceMappingRegistry } from "../utils/DistanceMapping.js";

/**
 * Base class for 2D primitives defined on the complex plane.
 * Each primitive has:
 *  - A "metric" (real) component: describes spatial properties.
 *  - A "color" (imaginary) component: represented in HSLA.
 * The effective metric distance is computed by applying a configurable mapping
 * function to the raw Euclidean distance.
 */
export class ComplexPrimitive2D {
  constructor(params = {}) {
    // Real (metric) properties.
    this.metric = {
      center: (params.metric && params.metric.center) || { x: 0, y: 0 },
      scale: (params.metric && params.metric.scale) || 1,
    };

    // Imaginary (color) properties: HSLA.
    this.color = params.color || { h: 0, s: 1, l: 0.5, a: 1 };

    // Set the distance mapping function.
    // Options:
    // 1. Directly provide a function
    // 2. Provide a registered mapper name and its parameters
    // 3. Provide a configuration for a polynomial mapping
    if (params.distanceMapper && typeof params.distanceMapper === 'function') {
      this.distanceMapper = params.distanceMapper;
    } else if (params.distanceMapper && typeof params.distanceMapper === 'string') {
      // Use a registered mapper
      const mapperName = params.distanceMapper;
      const mapperParams = params.distanceMapperParams || {};
      
      if (distanceMappingRegistry[mapperName]) {
        // Check if this is a factory function or direct mapper
        if (typeof distanceMappingRegistry[mapperName] === 'function' && 
            distanceMappingRegistry[mapperName].length > 0) {
          // It's a factory function, call it with params
          this.distanceMapper = distanceMappingRegistry[mapperName](
            mapperParams.a, mapperParams.b, mapperParams.c, mapperParams.e
          );
        } else {
          // It's a direct mapper function
          this.distanceMapper = distanceMappingRegistry[mapperName];
        }
      } else {
        console.warn(`Mapper "${mapperName}" not found, using identity mapping`);
        this.distanceMapper = identityMapping;
      }
    } else if (params.metric && params.metric.polyCoeffs) {
      this.distanceMapper = distanceMappingRegistry.polynomial(params.metric.polyCoeffs);
    } else {
      this.distanceMapper = identityMapping;
    }
  }

  /**
   * Computes the raw Euclidean distance from a point to the primitive's center.
   * @param {Object} point - { x, y } coordinate.
   * @returns {number}
   */
  getRawDistance(point) {
    const dx = point.x - this.metric.center.x;
    const dy = point.y - this.metric.center.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Computes the effective metric distance by applying the distance mapping.
   * @param {Object} point - { x, y } coordinate.
   * @returns {number} Effective (mapped) distance.
   */
  getMetricDistance(point) {
    const rawDistance = this.getRawDistance(point);
    return this.distanceMapper(rawDistance);
  }

  /**
   * Computes the signed distance from a given point to the boundary of the primitive.
   * Subclasses should implement this, typically using getMetricDistance.
   * @param {Object} point - { x, y } coordinate.
   * @returns {number}
   */
  computeSDF(point) {
    throw new Error("computeSDF() must be implemented in the subclass");
  }

  /**
   * Maps the SDF value to an HSLA color.
   * Modulates lightness and alpha based on the SDF value.
   * @param {number} sdfValue - The SDF value at a point.
   * @returns {Object} Color in HSLA format.
   */
  getColor(sdfValue) {
    const intensity = Math.exp(-Math.abs(sdfValue));
    return {
      h: this.color.h,
      s: this.color.s,
      l: this.color.l * intensity,
      a: this.color.a * intensity,
    };
  }

  /**
   * Applies a 2D affine transformation to the metric (real) component.
   * @param {Object} matrix - { a, b, c, d, tx, ty }.
   */
  transform(matrix) {
    const { x, y } = this.metric.center;
    const newX = matrix.a * x + matrix.b * y + (matrix.tx || 0);
    const newY = matrix.c * x + matrix.d * y + (matrix.ty || 0);
    this.metric.center = { x: newX, y: newY };

    // Adjust the scale if the matrix includes uniform scaling.
    this.metric.scale *= Math.sqrt((matrix.a ** 2 + matrix.d ** 2) / 2);
  }
}