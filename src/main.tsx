import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./store/AppStore";
import { Gate } from "./auth/Gate";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <Gate>
        <App />
      </Gate>
    </AppProvider>
  </StrictMode>,
);
