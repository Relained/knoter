import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./workbench/App";
import { installGlobalConfigRuntime } from "./core/settings/runtime";
import { installIconRuntime } from "./shared/icons/runtime";
import { installThemeHarness } from "./shared/theming/runtime";
import "./shared/styles/index.css";

function Root() {
  useEffect(() => {
    installThemeHarness();
    installIconRuntime();
    installGlobalConfigRuntime();
  }, []);

  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
