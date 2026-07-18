// Contesto React che tiene lo stato dell'app e lo persiste su IndexedDB.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { DatiApp, datiVuoti } from "../types";
import { caricaDati, salvaDati } from "./db";

interface Ctx {
  dati: DatiApp;
  caricato: boolean;
  /** Aggiorna lo stato (immutabile) e persiste su IndexedDB. */
  aggiorna: (mut: (d: DatiApp) => DatiApp) => void;
  /** Sostituisce integralmente lo stato (import). */
  sostituisci: (d: DatiApp) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [dati, setDati] = useState<DatiApp>(datiVuoti);
  const [caricato, setCaricato] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    caricaDati()
      .then((d) => {
        if (d) setDati(d);
      })
      .finally(() => setCaricato(true));
  }, []);

  // Persistenza con debounce per non scrivere su ogni tasto.
  function persisti(d: DatiApp) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void salvaDati(d);
    }, 300);
  }

  function aggiorna(mut: (d: DatiApp) => DatiApp) {
    setDati((prev) => {
      const next = mut(prev);
      persisti(next);
      return next;
    });
  }

  function sostituisci(d: DatiApp) {
    setDati(d);
    void salvaDati(d);
  }

  return (
    <AppCtx.Provider value={{ dati, caricato, aggiorna, sostituisci }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fuori da AppProvider");
  return c;
}
