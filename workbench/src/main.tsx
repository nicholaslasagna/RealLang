import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "../styles.css";
import { ensureMockData } from "./data/workbench-data";

ensureMockData();

const root = document.getElementById("root");
if (!root) throw new Error("Workbench root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
