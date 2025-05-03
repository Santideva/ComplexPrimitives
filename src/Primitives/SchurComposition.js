// File: src/primitives/SchurComposition.js

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
        // 1. Compute forward (T) and inverse (T⁻¹)
        this._T = makeAffine({ rotation: this.rotation, scale: this.scale, translate: this.position });
        
        // Check matrix invertibility before proceeding
        if (!isInvertible(this._T)) {
          console.warn("SchurComposition: Transformation matrix is not invertible. Using identity matrix instead.");
          this._T = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
        }
        
        this._Tinv = invertAffine(this._T);
  
        // 2. Clone & transform into blend-space
        this._cloneAndTransform();
  
        // 3. Blend according to strategy
        const blended = this._blendInBlendSpace();
        
        // Validate blending result
        if (!blended) {
          console.warn("SchurComposition: Blending operation failed to produce a valid result.");
          this.shapes = this.baseShapes.length > 0 ? [this.baseShapes[0].clone()] : [];
          return;
        }
  
        // 4. Inverse-transform and finalize
        this._inverseTransform(blended);
        
        // Reset update flag - only if we reach this point successfully
        this._needsUpdate = false;
      } catch (error) {
        console.error("SchurComposition: Composition error:", error);
        // Keep _needsUpdate true so we retry on next call
        
        // Set a fallback shape if possible
        if (this.baseShapes.length > 0) {
          try {
            this.shapes = [this.baseShapes[0].clone()];
          } catch (e) {
            console.error("SchurComposition: Fallback error:", e);
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
          // Transform each vertex
          if (Array.isArray(copy.vertices)) {
            copy.vertices.forEach(v => applyAffineToVertex(v, this._T));
          }
          // Transform face
          if (copy.face instanceof Face) {
            applyAffineToFace(copy.face, this._T);
          }
          return copy;
        } catch (error) {
          console.error("SchurComposition: Error during shape transformation:", error);
          return null;
        }
      }).filter(shape => shape !== null);
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
        result     = createBlendedPrimitive([result, shapes[i]], {
          smoothness: w,
          operation:  op,
          color:      this.color
        });
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
      return createBlendedPrimitive([left, right], {
        smoothness: this.weights[idx % this.weights.length],
        operation:  this.operations[idx % this.operations.length],
        color:      this.color
      });
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
        result = createBlendedPrimitive(pair, { smoothness: w, operation: op, color: this.color });
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
        // Finalize
        this.shapes = [blended];
        this.updateCompositeSDF();
      } catch (error) {
        console.error("SchurComposition: Error during inverse transformation:", error);
        this.shapes = [];
      }
    }
  
    /**
     * Override: create Three.js object for rendering.
     * @param {number} time - Animation time
     * @returns {Object} - Three.js object
     */
    createObject(time = 0) {
      if (this._needsUpdate) {
        this._initializeComposition();
      }
      
      // Early return if no valid shapes
      if (!this.shapes || this.shapes.length === 0) {
        return null;
      }
      
      // Guard against undefined shape
      const shape = this.shapes[0];
      if (!shape) {
        return null;
      }
      
      return shape.createObject(time);
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
        console.warn("SchurComposition: Detected recursive SDF computation. Returning Infinity.");
        return Infinity;
      }
      
      // Add this object to call stack
      callStack.push(this.id);
      
      try {
        return shape.computeSDF(point, callStack, time, depth);
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
          console.warn(`SchurComposition: Failed to clone shape: ${error.message}`);
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
        clone._needsUpdate = false;
      } else {
        // Force update for safety
        clone._needsUpdate = true;
      }
      
      return clone;
    }
  }
  
  export default SchurComposition;