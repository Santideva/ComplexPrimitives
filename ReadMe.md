Overview
This project is a procedurally generated 2D geometry visualization built with Three.js. It allows users to interactively manipulate complex shapes using distance mapping functions, real-time shape transformations, and an intuitive GUI. The framework supports dynamic updates to geometry based on distance functions, making it ideal for exploring procedural design and computational geometry.

Features
Customizable Distance Mapping: Choose between polynomial, logarithmic, identity, and other distance mappings.

Dynamic Shape Transformations: Modify shape properties such as vertex distances and face translations.

Real-time Rendering: Utilizes Three.js for smooth visual updates.

Interactive GUI: Control lighting intensity, distance functions, and shape parameters via dat.GUI.

Efficient State Management: Uses a centralized state store for managing shape data and transformations.

Modular Design: Components such as the CameraManager, LightingManager, and TextureLoader allow for easy extension and modification.

GUI Controls
Ambient Intensity Slider: Adjusts the strength of ambient lighting, which affects overall scene brightness.

Directional Light Slider: Controls the primary light source’s intensity, influencing shading and depth perception.

Distance Mapper Dropdown: Switches between different distance mapping functions (identity, polynomial, logarithmic, etc.), affecting vertex positioning dynamically.

Installation
Prerequisites
Node.js (Recommended: v16+)

npm or yarn

Setup
Clone the repository:

sh
Copy
Edit
git clone https://github.com/your-username/geometry-visualizer.git
cd geometry-visualizer
Install dependencies:

sh
Copy
Edit
npm install

# or

yarn install
Start the development server:

sh
Copy
Edit
npm run dev

# or

yarn dev
Open in browser: The application should be running at http://localhost:8080/ (or another available port).

Usage
Modify Distance Mapping: Use the dropdown in the GUI to switch between different distance metrics.

Adjust Lighting: Change ambient and directional light intensity using GUI sliders.

Apply Transformations: Modify vertex distances, translate faces, or change color properties dynamically.

Fix for FaceTransformations.js:17 Error
If you encounter the error:

javascript
Copy
Edit
FaceTransformations.js:17 Uncaught TypeError: Cannot read properties of null (reading 'vertices')
This likely means that a transformation is being applied to an undefined face. A fix involves checking if the face exists before applying transformations:

Modify translateFace() in FaceTransformations.js:

js
Copy
Edit
function translateFace(face, dx, dy) {
if (!face || !face.vertices) {
console.error("translateFace error: face is undefined or has no vertices.");
return;
}
face.vertices.forEach(vertex => {
vertex.x += dx;
vertex.y += dy;
});
}
Project Structure
perl
Copy
Edit
📂 src/
├── 📂 geometry/ # Core shape and transformation logic
│ ├── Vertex.js # Defines a vertex: position & color
│ ├── Edge.js # Defines edges between vertices
│ ├── Face.js # Defines a surface formed by multiple vertices
│ ├── ComplexShape2D.js # High-level 2D shape with transformations
│
├── 📂 primitives/
│ ├── ComplexPrimitive2D.js # Base class for 2D primitives
│
├── 📂 rendering/
│ ├── CameraManager.js # Camera setup and controls
│ ├── LightingManager.js # Scene lighting management
│ ├── TextureLoader.js # Texture handling (optional)
│
├── 📂 state/
│ ├── stateStore.js # Centralized state management
│
├── 📂 utils/
│ ├── DistanceMapping.js # Defines different distance mapping functions
│ ├── logger.js # Utility for logging events
│
├── index.js # Main application logic & render loop
└── ...
Contributing
We welcome contributions! To contribute:

Fork the repository

Create a new branch (git checkout -b feature-name)

Commit your changes (git commit -m "Add new feature")

Push to the branch (git push origin feature-name)

Open a Pull Request

License
This project is licensed under the MIT License - see the LICENSE file for details.

Acknowledgments
Built with Three.js

GUI powered by dat.GUI
