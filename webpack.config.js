// File: webpack.config.js
const path = require("path");

module.exports = {
  entry: "./src/index.js",
  mode: "development",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "/dist/"  // This makes the bundle available at /dist/bundle.js
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
        use: { loader: "babel-loader", options: { presets: ["@babel/preset-env"] } }
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
