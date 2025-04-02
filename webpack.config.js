// File: webpack.config.js
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  entry: "./src/index.js",
  mode: "development",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "/dist/" // Bundle available at /dist/bundle.js
  },
  devServer: {
    static: path.resolve(__dirname),
    hot: true,
    port: 8080
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: { 
          loader: "babel-loader", 
          options: { presets: ["@babel/preset-env"] } 
        }
      },
      {
        test: /\.(glsl|vs|fs)$/,
        use: "glslify-loader"
      }
    ]
  },
  resolve: {
    extensions: [".js", ".glsl"]
  }
};

export default config;
