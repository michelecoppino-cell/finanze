// Barriera di accesso con password (lato-client). Se non e' impostata alcuna
// password nei parametri, l'app e' accessibile direttamente.

import { useState } from "react";
import { useApp } from "../store/AppStore";
import { sha256 } from "../crypto";

export function Gate({ children }: { children: React.ReactNode }) {
  const { dati, caricato } = useApp();
  const [sbloccato, setSbloccato] = useState(false);
  const [pwd, setPwd] = useState("");
  const [errore, setErrore] = useState(false);

  if (!caricato) {
    return <div className="centro muted">Caricamento…</div>;
  }

  const hash = dati.parametri.passwordHash;
  if (!hash || sbloccato) {
    return <>{children}</>;
  }

  async function tenta(e: React.FormEvent) {
    e.preventDefault();
    const h = await sha256(pwd);
    if (h === hash) {
      setSbloccato(true);
      setErrore(false);
    } else {
      setErrore(true);
    }
  }

  return (
    <div className="centro">
      <form className="card gate" onSubmit={tenta}>
        <h1>Finanze</h1>
        <p className="muted">Inserisci il codice di accesso.</p>
        <input
          type="password"
          value={pwd}
          onChange={(e) => {
            setPwd(e.target.value);
            setErrore(false);
          }}
          autoFocus
          placeholder="Codice"
        />
        {errore && <div className="errore">Codice errato.</div>}
        <button type="submit" className="primario">
          Entra
        </button>
      </form>
    </div>
  );
}
