/**
 * main.jsx — React application entry point.
 *
 * This file mounts the React app into the <div id="root"> in index.html.
 * StrictMode helps catch bugs during development (renders components twice
 * in dev to detect side effects).
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
