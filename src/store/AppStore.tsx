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

// MSAL e' pesante: lo carichiamo solo su richiesta (import dinamico), cosi' chi
// non usa OneDrive non paga il costo nel bundle iniziale.
const onedrive = () => import("./onedrive");

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
  const timerOneDrive = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    caricaDati()
      .then((d) => {
        if (d) {
          setDati(d);
          // Se c'e' una sessione OneDrive salvata, ripristinala in silenzio
          // cosi' l'auto-salvataggio riparte dopo un reload.
          if (d.parametri.oneDriveClientId) {
            void onedrive()
              .then((m) => m.ripristinaSessione(d.parametri.oneDriveClientId!))
              .catch(() => {});
          }
        }
      })
      .finally(() => setCaricato(true));
  }, []);

  // Auto-salvataggio su OneDrive (debounce piu' lungo del salvataggio locale,
  // per non moltiplicare le chiamate di rete). Silenzioso: gli errori non
  // bloccano l'uso dell'app (il dato locale e' comunque salvato).
  function sincronizzaOneDrive(d: DatiApp) {
    if (!d.parametri.oneDriveAutoSync || !d.parametri.oneDriveClientId) return;
    if (timerOneDrive.current) clearTimeout(timerOneDrive.current);
    timerOneDrive.current = setTimeout(() => {
      void onedrive()
        .then((m) => {
          if (!m.accountCollegato()) return;
          return m.salvaSuOneDrive(d.parametri.oneDriveClientId!, d);
        })
        .catch((e) => console.warn("Auto-salvataggio OneDrive non riuscito:", e));
    }, 3000);
  }

  // Persistenza con debounce per non scrivere su ogni tasto.
  function persisti(d: DatiApp) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void salvaDati(d);
    }, 300);
    sincronizzaOneDrive(d);
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
