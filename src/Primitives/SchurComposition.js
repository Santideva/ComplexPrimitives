// File: src/primitives/SchurComposition.js
import { stateStore } from "../state/stateStore.js";
import { logger } from "../utils/logger.js";
import {
    composeAffine,
    invertAffine,
    makeAffine,
    applyAffineToVertex,
    applyAffineToFace,
    isInvertible
  } from "../utils/affine.js";
  import { createBlendedPrimitive } from "../utils/SDFBlending.js";
  import { DerivativePrimitive } from "./primaryDerivativePrimitives.js";
  import { ComplexPrimitive2D } from "./ComplexPrimitive2d.js";
  import { Vertex } from "../Geometry/Vertex.js";
  import { Face } from "../Geometry/Face.js";
  import * as THREE from 'three';

  
  /**
   * SchurComposition
   *
   * Implements a "Schur-style" similarity transform composition:
   *  1. Forward-transform base primitives into a common blend-space (T)
   *  2. Blend their SDFs via R-functions in that space
   *  3. Inverse-transform the result back to world-space (T⁻¹)
   *
   * @extends DerivativePrimitive
   */
  export class SchurComposition extends DerivativePrimitive {
    /**
     * @param {Object} params
     * @param {ComplexPrimitive2D[]} params.shapes        - Primitives to compose
     * @param {number}             params.rotation      - Rotation in radians
     * @param {number}             params.scale         - Uniform scale
     * @param {{x:number,y:number}} params.position      - Translation vector
     * @param {string[]}           [params.operations]  - Blend operations (union, intersection, difference)
     * @param {number[]}           [params.weights]     - Smoothness weights per operation
     * @param {'sequential'|'balanced'|'nested'} [params.compositeFn] - Blend strategy
     */
    constructor(params = {}) {
      super(params);
      this.type = 'schur-composition';
  
      // Parameters
      this.baseShapes    = params.shapes       || [];
      this.rotation      = params.rotation     || 0;
      this.scale         = params.scale        || 1;
      this.position      = params.position     || { x: 0, y: 0 };
      this.operations    = params.operations   || ['union'];
      this.weights       = params.weights      || [this.blendSmoothness];
      this.compositeFn   = params.compositeFn  || 'sequential';
  
      // Internal
      this.transformedShapes = [];
      this._T                = null;
      this._Tinv             = null;
      this._needsUpdate      = true;
      this._scaleFactor      = 1;  // Add scaleFactor to track determinant
      this._sdfOffset        = 0;  // Add offset to ensure SDF crosses zero
  
      // Build composite
      this._initializeComposition();
    }
  
    /**
     * Updates transformation parameters and marks for recomposition
     * @param {Object} params Parameters to update
     */
    updateParameters(params = {}) {
      let changed = false;
      
      if (params.rotation !== undefined && params.rotation !== this.rotation) {
        this.rotation = params.rotation;
        changed = true;
      }
      
      if (params.scale !== undefined && params.scale !== this.scale) {
        this.scale = params.scale;
        changed = true;
      }
      
      if (params.position !== undefined) {
        if (params.position.x !== this.position.x || params.position.y !== this.position.y) {
          this.position = params.position;
          changed = true;
        }
      }
      
      if (params.operations !== undefined) {
        this.operations = params.operations;
        changed = true;
      }
      
      if (params.weights !== undefined) {
        this.weights = params.weights;
        changed = true;
      }
      
      if (params.compositeFn !== undefined && params.compositeFn !== this.compositeFn) {
        this.compositeFn = params.compositeFn;
        changed = true;
      }
      
      if (params.shapes !== undefined) {
        this.baseShapes = params.shapes;
        changed = true;
      }
      
      if (changed) {
        // Register updated dependencies for cycle detection
        const childIds = this.baseShapes.map(s => s.id);
        stateStore._updateDependencies(this.id, childIds);
        this._needsUpdate = true;
        this._initializeComposition();
      }
        
      return changed;
    }
  
    /**
     * Initializes transforms, clones, blends, and restores.
     * @private
     */
    _initializeComposition() {
      // Skip if nothing to compose
      if (this.baseShapes.length === 0) {
        this.shapes = [];
        return;
      }
      
      // Skip recomputation if not needed
      if (!this._needsUpdate && this._T && this._Tinv) {
        return;
      }
  
      try {
        // Validate scale to prevent degenerate transformations
        const safeScale = Math.max(Math.abs(this.scale), 0.0001);
        
        logger.info(`[${this.id}] SchurComposition: Initializing composition with ${this.baseShapes.length} shapes`);
        
        // 1. Compute forward (T) and inverse (T⁻¹)
        this._T = makeAffine({ 
          rotation: this.rotation, 
          scale: safeScale, 
          translate: this.position 
        });
        
        // Check matrix invertibility before proceeding
        if (!isInvertible(this._T)) {
          logger.warn(`[${this.id}] SchurComposition: Transformation matrix is not invertible. Using identity matrix instead.`);
          this._T = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
          this._scaleFactor = 1;
        } else {
          // Calculate the scale factor from the determinant
          this._scaleFactor = Math.sqrt(Math.abs(this._T.a * this._T.d - this._T.b * this._T.c));
          logger.info(`[${this.id}] SchurComposition: Calculated scale factor: ${this._scaleFactor}`);
        }
        
        this._Tinv = invertAffine(this._T);
  
        // 2. Clone & transform into blend-space
        this._cloneAndTransform();
  
        // 3. Blend according to strategy
        const blended = this._blendInBlendSpace();
        
        // Validate blending result
        if (!blended) {
          logger.warn(`[${this.id}] SchurComposition: Blending operation failed to produce a valid result.`);
          this.shapes = this.baseShapes.length > 0 ? [this.baseShapes[0].clone()] : [];
          return;
        }
  
        // 4. Inverse-transform and finalize
        this._inverseTransform(blended);
        
        // 5. Calculate SDF bounds to find appropriate offset
        this._calculateSDFOffset();
        
        // 6. Ensure SDF is properly updated
        if (this.shapes && this.shapes.length > 0 && this.shapes[0]) {
          if (typeof this.shapes[0].updateSDF === 'function') {
            this.shapes[0].updateSDF();
          }
          
          // Force regeneration of contours with multiple resolution attempts
          if (typeof this.shapes[0].generateContours === 'function') {
            // Try standard resolution first
            const result = this.shapes[0].generateContours(150);
            if (!result || (result.vertices && result.vertices.length === 0)) {
              logger.info(`[${this.id}] SchurComposition: No contours found at standard resolution, trying higher resolution`);
              this.shapes[0].generateContours(250);
              
              // If still no contours, try even higher resolution
              if (!result || (result.vertices && result.vertices.length === 0)) {
                logger.info(`[${this.id}] SchurComposition: Still no contours, trying very high resolution`);
                this.shapes[0].generateContours(350);
              }
            }
          }
        }
        
        logger.info(`[${this.id}] SchurComposition: Composition completed successfully`);
        
        // Reset update flag - only if we reach this point successfully
        this._needsUpdate = false;
      } catch (error) {
        logger.error(`[${this.id}] SchurComposition: Composition error:`, error);
        // Keep _needsUpdate true so we retry on next call
        
        // Set a fallback shape if possible
        if (this.baseShapes.length > 0) {
          try {
            this.shapes = [this.baseShapes[0].clone()];
          } catch (e) {
            logger.error(`[${this.id}] SchurComposition: Fallback error:`, e);
            this.shapes = [];
          }
        } else {
          this.shapes = [];
        }
      }
    }
  
    /**
     * Clone base shapes and apply forward transform.
     * @private
     */
    _cloneAndTransform() {
      this.transformedShapes = this.baseShapes.map(shape => {
        if (!shape) return null;
        
        try {
          const copy = shape.clone();
          
          // Ensure we have a valid shape with necessary methods
          if (!copy || !copy.vertices || !Array.isArray(copy.vertices)) {
            logger.warn(`[${this.id}] SchurComposition: Invalid shape detected during transform`);
            return null;
          }
          
          // Transform each vertex
          if (Array.isArray(copy.vertices)) {
            copy.vertices.forEach(v => applyAffineToVertex(v, this._T));
          }
          // Transform face
          if (copy.face instanceof Face) {
            applyAffineToFace(copy.face, this._T);
          }
          
          // Ensure SDF is updated after transformation
          if (typeof copy.updateSDF === 'function') {
            copy.updateSDF();
          }
          
          return copy;
        } catch (error) {
          logger.error(`[${this.id}] SchurComposition: Error during shape transformation:`, error);
          return null;
        }
      }).filter(shape => shape !== null);
      
      logger.info(`[${this.id}] SchurComposition: Transformed ${this.transformedShapes.length} shapes`);
    }
  
    /**
     * Blend shapes in blend-space using the configured strategy.
     * @returns {ComplexPrimitive2D}
     * @private
     */
    _blendInBlendSpace() {
      // Handle edge cases
      if (this.transformedShapes.length === 0) return null;
      if (this.transformedShapes.length === 1) return this.transformedShapes[0];
      
      logger.info(`[${this.id}] SchurComposition: Blending ${this.transformedShapes.length} shapes using ${this.compositeFn} strategy`);
      
      switch (this.compositeFn) {
        case 'balanced':
          return this._createBalanced(this.transformedShapes, 0, this.transformedShapes.length - 1);
        case 'nested':
          return this._createNested(this.transformedShapes);
        case 'sequential':
        default:
          return this._createSequential(this.transformedShapes);
      }
    }
  
    /**
     * Sequential blend of shapes: left-to-right.
     * @param {Array<ComplexPrimitive2D>} shapes - Shapes to blend
     * @returns {ComplexPrimitive2D} - The blended result
     * @private
     */
    _createSequential(shapes) {
      if (shapes.length === 0) return null;
      let result = shapes[0];
      for (let i = 1, opIdx = 0; i < shapes.length; i++, opIdx++) {
        const op   = this.operations[opIdx % this.operations.length];
        const w    = this.weights[opIdx % this.weights.length];
        
        // Ensure both shapes are valid
        if (!result || !shapes[i]) {
          logger.warn(`[${this.id}] SchurComposition: Invalid shape in sequential blend at index ${i}`);
          continue;
        }
        
        result = createBlendedPrimitive([result, shapes[i]], {
          smoothness: w,
          operation: op,
          color: this.color
        });
        
        // Ensure SDF is updated after each blend
        if (result && typeof result.updateSDF === 'function') {
          result.updateSDF();
        }
      }
      return result;
    }
  
    /**
     * Balanced binary-tree blend of shapes.
     * @param {Array<ComplexPrimitive2D>} shapes - Shapes to blend
     * @param {number} start - Start index
     * @param {number} end - End index
     * @returns {ComplexPrimitive2D} - The blended result
     * @private
     */
    _createBalanced(shapes, start, end) {
      if (start > end) return null;
      if (start === end) return shapes[start];
      
      const mid = Math.floor((start + end) / 2);
      const left  = this._createBalanced(shapes, start, mid);
      const right = this._createBalanced(shapes, mid + 1, end);
      
      // Handle case where one side is null
      if (!left) return right;
      if (!right) return left;
      
      const idx   = Math.floor(Math.log2(end - start + 1)) % this.operations.length;
      const result = createBlendedPrimitive([left, right], {
        smoothness: this.weights[idx % this.weights.length],
        operation:  this.operations[idx % this.operations.length],
        color:      this.color
      });
      
      // Ensure SDF is updated after blend
      if (result && typeof result.updateSDF === 'function') {
        result.updateSDF();
      }
      
      return result;
    }
  
    /**
     * Nested (matryoshka) blend of shapes.
     * @param {Array<ComplexPrimitive2D>} shapes - Shapes to blend
     * @returns {ComplexPrimitive2D} - The blended result
     * @private
     */
    _createNested(shapes) {
      if (shapes.length === 0) return null;
      let result = shapes[0];
      for (let i = 1; i < shapes.length; i++) {
        const idx = (i - 1) % this.operations.length;
        const op  = this.operations[idx];
        const w   = this.weights[idx % this.weights.length];
        // For difference, swap order
        const pair = op === 'difference' ? [shapes[i], result] : [result, shapes[i]];
        
        // Ensure both shapes are valid
        if (!pair[0] || !pair[1]) {
          logger.warn(`[${this.id}] SchurComposition: Invalid shape in nested blend at index ${i}`);
          continue;
        }
        
        result = createBlendedPrimitive(pair, { 
          smoothness: w, 
          operation: op, 
          color: this.color 
        });
        
        // Ensure SDF is updated after each blend
        if (result && typeof result.updateSDF === 'function') {
          result.updateSDF();
        }
      }
      return result;
    }
  
    /**
     * Apply inverse transform, set `shapes`, and update SDF.
     * @param {ComplexPrimitive2D} blended - The blended shape to transform
     * @private
     */
    _inverseTransform(blended) {
      if (!blended) {
        this.shapes = [];
        return;
      }
      
      try {
        // Inverse-transform vertices
        if (Array.isArray(blended.vertices)) {
          blended.vertices.forEach(v => applyAffineToVertex(v, this._Tinv));
        }
        // Inverse-transform face
        if (blended.face instanceof Face) {
          applyAffineToFace(blended.face, this._Tinv);
        }
        
        // Special check: attach the scaling factor for SDF adjustments
        blended._transformScaleFactor = this._scaleFactor;
        
        // Finalize
        // 1️⃣ Inverse-transform the blended ComplexShape2D
        if (typeof blended.updateCompositeSDF === 'function') {
          blended.updateCompositeSDF();
        } else if (typeof blended.updateSDF === 'function') {
          blended.updateSDF();
        }
        
        // 2️⃣ Now install it as our single output shape
        this.shapes = [blended];
        
        logger.info(`[${this.id}] SchurComposition: Inverse transform complete`);
      } catch (error) {
        logger.error(`[${this.id}] SchurComposition: Error during inverse transformation:`, error);
        this.shapes = [];
      }
    }

    /**
     * Calculate SDF offset to ensure zero-crossing
     * @private
     */
    _calculateSDFOffset() {
      if (!this.shapes || this.shapes.length === 0 || !this.shapes[0]) {
        return;
      }

      // Sample SDF at various points to find min/max values
      const samplePoints = [];
      const boundSize = 5; // Sample in a 10x10 grid
      const steps = 10;
      
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps; j++) {
          const x = -boundSize + (2 * boundSize * i / steps);
          const y = -boundSize + (2 * boundSize * j / steps);
          samplePoints.push({x, y});
        }
      }
      
      try {
        // Compute SDF values at sample points
        const sdfValues = samplePoints.map(point => 
          this.shapes[0].computeSDF(point, [], 0, 0)
        );
        
        // Find min and max SDF values
        const minSDF = Math.min(...sdfValues.filter(v => isFinite(v)));
        const maxSDF = Math.max(...sdfValues.filter(v => isFinite(v)));
        
        logger.info(`[${this.id}] SchurComposition: SDF range: [${minSDF}, ${maxSDF}]`);
        
        // If all values are positive or all values are negative,
        // we need to offset to ensure zero crossing
        if (minSDF > 0) {
          this._sdfOffset = -minSDF - 0.1; // Slightly more to ensure crossing
          logger.info(`[${this.id}] SchurComposition: All SDF values positive, offsetting by ${this._sdfOffset}`);
        } else if (maxSDF < 0) {
          this._sdfOffset = -maxSDF + 0.1; // Slightly more to ensure crossing
          logger.info(`[${this.id}] SchurComposition: All SDF values negative, offsetting by ${this._sdfOffset}`);
        } else {
          // We have zero crossings already
          this._sdfOffset = 0;
        }
        
        // If we have a very small range, expand it
        if (Math.abs(maxSDF - minSDF) < 0.1) {
          this._scaleFactor *= 10;
          logger.info(`[${this.id}] SchurComposition: SDF range too small, boosting scale factor to ${this._scaleFactor}`);
        }
        
        // Apply the offset by creating a custom distance mapper for the shape
        if (this._sdfOffset !== 0 && this.shapes[0]) {
          const originalComputeSDF = this.shapes[0].computeSDF.bind(this.shapes[0]);
          this.shapes[0].computeSDF = (point, callStack = [], time = 0, depth = 0) => {
            const originalValue = originalComputeSDF(point, callStack, time, depth);
            return originalValue + this._sdfOffset;
          };
        }
      } catch (error) {
        logger.error(`[${this.id}] SchurComposition: Error calculating SDF offset: ${error}`);
      }
    }
  
    /**
     * Override: create Three.js object for rendering.
     * @param {number} time - Animation time
     * @returns {Object} - Three.js object
     */
    createObject(time = 0) {
      if (this._needsUpdate) this._initializeComposition();
      const shape = (this.shapes && this.shapes[0]);
      // 1) If it really knows how to render itself:
      if (shape && typeof shape.createObject === "function") {
        return shape.createObject(time);
      }
      // 2) Otherwise try the "line" fallback:
      if (shape && typeof shape.createLineObject === "function") {
        return shape.createLineObject(time);
      }
      // 3) Last-ditch: give Three.js an empty container, not null:
      return new THREE.Group();
    }
    
  
/**
 * Override: compute SDF for CPU queries.
 * @param {Object} point - Point to evaluate
 * @param {Array} callStack - Call stack for recursion prevention
 * @param {number} time - Animation time
 * @param {number} depth - Recursion depth
 * @returns {number} - SDF value
 */
computeSDF(point, callStack = [], time = 0, depth = 0) {
  if (this._needsUpdate) {
    this._initializeComposition();
  }
  
  // Early return for empty shapes
  if (!this.shapes || this.shapes.length === 0) {
    return Infinity;
  }
  
  // Guard against undefined shape
  const shape = this.shapes[0];
  if (!shape) {
    return Infinity;
  }
  
  // Prevent infinite recursion
  if (callStack.includes(this.id)) {
    logger.warn(`[${this.id}] SchurComposition: Detected recursive SDF computation. Returning Infinity.`);
    return Infinity;
  }
  
  // Add this object to call stack
  callStack.push(this.id);
  
  try {
    // Apply the transformation to the input point
    const transformedPoint = {
      x: this._Tinv.a * point.x + this._Tinv.c * point.y + this._Tinv.tx,
      y: this._Tinv.b * point.x + this._Tinv.d * point.y + this._Tinv.ty
    };
    
    // Use the transformed point for SDF computation
    let sdfValue = shape.computeSDF(transformedPoint, callStack, time, depth);
    
    // Scale the SDF value by the determinant-based scale factor
    // This ensures that distances are properly scaled back to world space
    sdfValue = sdfValue / this._scaleFactor;
    
    // Apply a constant offset to ensure zero-crossing
    // Subtract 0.5 to make interior points negative
    sdfValue = sdfValue - 0.5;
    
    return sdfValue;
  } finally {
    // Always remove from call stack
    const idx = callStack.indexOf(this.id);
    if (idx >= 0) callStack.splice(idx, 1);
  }
}
    /**
     * Clone this SchurComposition.
     * @returns {SchurComposition} - A new instance with the same parameters
     */
    clone() {
      // Clone base shapes with careful error handling
      const clonedShapes = this.baseShapes.map(shape => {
        if (!shape) return null;
        
        try {
          const clone = shape.clone();
          
          // Preserve custom distance mappers if present
          if (shape.distanceMapper && typeof shape.distanceMapper === 'function') {
            clone.distanceMapper = shape.distanceMapper;
          }
          
          return clone;
        } catch (error) {
          logger.warn(`SchurComposition: Failed to clone shape: ${error.message}`);
          return null;
        }
      }).filter(shape => shape !== null);
      
      // Create new instance with same parameters
      const clone = new SchurComposition({
        shapes: clonedShapes,
        rotation: this.rotation,
        scale: this.scale,
        position: { x: this.position.x, y: this.position.y },
        operations: [...this.operations],
        weights: [...this.weights],
        compositeFn: this.compositeFn,
        // Preserve color and other base properties
        color: { ...this.color },
        blendSmoothness: this.blendSmoothness
      });
      
      // Preserve internal state for efficiency if valid
      if (this._T && this._Tinv && !this._needsUpdate) {
        clone._T = { ...this._T };
        clone._Tinv = { ...this._Tinv };
        clone._scaleFactor = this._scaleFactor;
        clone._sdfOffset = this._sdfOffset;
        clone._needsUpdate = false;
      } else {
        // Force update for safety
        clone._needsUpdate = true;
      }
      
      return clone;
    }
  }
  
  export default SchurComposition;