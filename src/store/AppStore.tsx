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
        if (d) setDati(d);
        // Bootstrap OneDrive: completa un eventuale login tornato via redirect e
        // ripristina la sessione (per l'auto-salvataggio). Carica MSAL solo se
        // serve davvero — client id noto o risposta di redirect nell'URL — cosi'
        // chi non usa OneDrive non paga nulla all'avvio.
        let cidLs: string | null = null;
        try {
          cidLs = localStorage.getItem("finanze.onedrive.clientId");
        } catch {
          /* localStorage non disponibile */
        }
        const cid = d?.parametri.oneDriveClientId ?? cidLs ?? null;
        const haRispostaRedirect = /[#?&](code|error)=/.test(
          window.location.href,
        );
        if (cid || haRispostaRedirect) {
          void onedrive()
            .then((m) => {
              const clientId = cid ?? m.clientIdRicordato();
              return clientId ? m.ripristinaSessione(clientId) : null;
            })
            .catch(() => {});
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
