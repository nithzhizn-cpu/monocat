import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MonoCatGame from "./MonoCatGame";
import "./style.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <MonoCatGame />
  </StrictMode>,
);
