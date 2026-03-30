import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ProjectorView from "./components/ProjectorView";
import { PROJECTOR_VIEW_QUERY } from "./features/display/projectorSync";
import "./styles.css";

const isProjectorView = new URLSearchParams(window.location.search).get("view") === PROJECTOR_VIEW_QUERY;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isProjectorView ? <ProjectorView /> : <App />}
  </React.StrictMode>
);
