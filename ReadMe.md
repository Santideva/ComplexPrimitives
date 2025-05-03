Here’s an updated version of your `README.md` that includes the **save/load scene functionality**, as well as a cleaner organization of existing features. I've also added a **Persistence** section to the Features and Usage blocks and updated the Project Structure to reflect this new logic if it's housed in a `persistence/` folder.

---

````md
# Geometry Visualizer

## Overview

This project is a procedurally generated 2D geometry visualization tool built with Three.js. It allows users to interactively manipulate complex shapes using distance mapping functions, real-time shape transformations, and an intuitive GUI. The framework supports dynamic updates to geometry based on signed distance functions, making it ideal for exploring procedural design, computational geometry, and visual mathematics.

---

## Features

- **Customizable Distance Mapping**: Choose between polynomial, logarithmic, identity, and other mapping functions that affect how shapes deform.
- **Dynamic Shape Transformations**: Modify shape properties such as vertex displacement, face translation, rotation, and more.
- **Real-time Rendering**: Smooth visual updates using an efficient Three.js rendering pipeline.
- **Interactive GUI**: Adjust lighting, distance functions, shape parameters, and transformation options via `dat.GUI`.
- **Efficient State Management**: A centralized store handles all shape and session data, ensuring reactivity and modular interaction.
- **Persistence Support**: Save and reload scenes with full shape and transformation data, enabling session continuity and experimentation.
- **Modular Architecture**: Key components (CameraManager, LightingManager, DistanceMapping, etc.) are designed for easy extension and reuse.

---

## Persistence: Save and Load Scenes

You can now **save your current session** and **reload it later** with complete fidelity, including:

- Shape geometry and color
- Transformation state
- Distance mapping settings

### How it works

- When saving: The scene is serialized, and essential metadata is stored in `localStorage`.
- On load: If saved data exists, it is deserialized and rehydrated into fully functioning shapes.
- If no saved data is found, the app initializes with a default line primitive.

This behavior is handled automatically at startup.

---

## GUI Controls

- **Ambient Intensity Slider**: Adjusts the global scene lighting.
- **Directional Light Slider**: Controls the strength and directionality of the key light.
- **Distance Mapper Dropdown**: Switches between mapping functions (identity, polynomial, etc.).
- **Save Scene Button**: Stores the current visual state.
- **Load Scene Button**: Restores the most recently saved session.

---

## Installation

### Prerequisites

- Node.js (v16+ recommended)
- npm or yarn

### Setup

Clone the repository:

```sh
git clone https://github.com/your-username/geometry-visualizer.git
cd geometry-visualizer
```
````

Install dependencies:

```sh
npm install
# or
yarn install
```

Start the development server:

```sh
npm run dev
# or
yarn dev
```

Then open your browser at [http://localhost:8080](http://localhost:8080) (or the port shown in terminal).

---

## Usage

- **Modify Distance Mapping**: Use the GUI to choose your desired mapping function.
- **Adjust Lighting**: Ambient and directional lights can be fine-tuned.
- **Apply Transformations**: Move, rotate, or scale shape components.
- **Save a Scene**: Click the "Save" button to serialize your shapes.
- **Load a Scene**: Click the "Load" button to restore your previous session.

---

## Troubleshooting

### Fix for `FaceTransformations.js:17` Error

If you encounter:

```txt
FaceTransformations.js:17 Uncaught TypeError: Cannot read properties of null (reading 'vertices')
```

It likely means the transformation is being applied to an undefined face. Apply a guard in `translateFace()`:

```js
function translateFace(face, dx, dy) {
  if (!face || !face.vertices) {
    console.error("translateFace error: face is undefined or has no vertices.");
    return;
  }
  face.vertices.forEach((vertex) => {
    vertex.x += dx;
    vertex.y += dy;
  });
}
```

---

## Project Structure

```
📂 src/
├── 📂 geometry/               # Core shape and transformation logic
│   ├── Vertex.js
│   ├── Edge.js
│   ├── Face.js
│   ├── ComplexShape2D.js
│
├── 📂 primitives/             # Primitive definitions (line, triangle, etc.)
│   ├── ComplexPrimitive2D.js
│
├── 📂 rendering/
│   ├── CameraManager.js
│   ├── LightingManager.js
│   ├── TextureLoader.js
│
├── 📂 state/
│   ├── stateStore.js         # Centralized state manager
│
├── 📂 persistence/           # Save/load logic
│   ├── saveScene.js
│   ├── loadScene.js
│
├── 📂 utils/
│   ├── DistanceMapping.js
│   ├── logger.js
│
├── index.js                  # Main application logic and render loop
└── ...
```

---

## Contributing

We welcome contributions!

1. Fork the repository
2. Create a new branch: `git checkout -b feature-name`
3. Make changes and commit: `git commit -m "Add feature"`
4. Push: `git push origin feature-name`
5. Open a Pull Request

---

## License

MIT License — see the [LICENSE](./LICENSE) file for details.

---

## Acknowledgments

- Built with [Three.js](https://threejs.org)
- GUI powered by [dat.GUI](https://github.com/dataarts/dat.gui)

```

---

```
