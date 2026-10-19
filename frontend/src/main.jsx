import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return <main><h1>AgriPredict</h1><p>Crop prediction dashboard</p></main>;
}

createRoot(document.getElementById("root")).render(<App />);
