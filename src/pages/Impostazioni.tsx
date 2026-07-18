import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/AppStore";
import { esportaJson, importaJson } from "../store/io";
import { sha256 } from "../crypto";
import { datiVuoti } from "../types";

// MSAL/OneDrive caricato on-demand per non appesantire il bundle iniziale.
const onedrive = () => import("../store/onedrive");

export function Impostazioni() {
  const { dati, aggiorna, sostituisci } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nuovaCat, setNuovaCat] = useState("");
  const [pwd1, setPwd1] = useState("");
  const [esitoPwd, setEsitoPwd] = useState("");
  const [esitoImport, setEsitoImport] = useState("");

  const p = dati.parametri;

  // ---------- OneDrive ----------
  const [odClient, setOdClient] = useState(p.oneDriveClientId ?? "");
  const [odUtente, setOdUtente] = useState<string | null>(null);
  const [odMsg, setOdMsg] = useState("");
  const [odBusy, setOdBusy] = useState(false);

  // All'apertura, se c'e' un client id salvato, verifica se siamo gia' collegati.
  useEffect(() => {
    if (!p.oneDriveClientId) return;
    void onedrive().then((m) => setOdUtente(m.accountCollegato()));
  }, [p.oneDriveClientId]);

  async function odAzione(fn: () => Promise<void>) {
    setOdBusy(true);
    setOdMsg("");
    try {
      await fn();
    } catch (err) {
      setOdMsg("Errore: " + (err as Error).message);
    } finally {
      setOdBusy(false);
    }
  }

  function odCollega() {
    const cid = odClient.trim();
    if (!cid) {
      setOdMsg("Inserisci prima l'Application (client) ID di Azure.");
      return;
    }
    if (cid !== p.oneDriveClientId) setParam({ oneDriveClientId: cid });
    void odAzione(async () => {
      const u = await (await onedrive()).collega(cid);
      setOdUtente(u);
      setOdMsg(`Collegato come ${u}.`);
    });
  }

  function odScollega() {
    const cid = (p.oneDriveClientId ?? odClient).trim();
    void odAzione(async () => {
      await (await onedrive()).scollega(cid);
      setOdUtente(null);
      setParam({ oneDriveAutoSync: false });
      setOdMsg("Scollegato da OneDrive.");
    });
  }

  function odSalva() {
    const cid = (p.oneDriveClientId ?? odClient).trim();
    void odAzione(async () => {
      await (await onedrive()).salvaSuOneDrive(cid, dati);
      setOdMsg("Backup salvato su OneDrive.");
    });
  }

  function odCarica() {
    const cid = (p.oneDriveClientId ?? odClient).trim();
    void odAzione(async () => {
      const testo = await (await onedrive()).scaricaTestoDaOneDrive(cid);
      if (!testo) {
        setOdMsg("Nessun backup trovato su OneDrive.");
        return;
      }
      const d = importaJson(testo);
      sostituisci(d);
      setOdClient(d.parametri.oneDriveClientId ?? cid);
      setOdMsg(`Caricati ${d.transazioni.length} movimenti da OneDrive.`);
    });
  }

  function setParam(patch: Partial<typeof p>) {
    aggiorna((d) => ({ ...d, parametri: { ...d.parametri, ...patch } }));
  }

  // ---------- Categorie ----------
  function aggiungiCat() {
    const nome = nuovaCat.trim();
    if (!nome || dati.categorie.some((c) => c.nome === nome)) return;
    aggiorna((d) => ({
      ...d,
      categorie: [...d.categorie, { nome, tipo: "spesa" }],
    }));
    setNuovaCat("");
  }
  function rimuoviCat(nome: string) {
    aggiorna((d) => ({
      ...d,
      categorie: d.categorie.filter((c) => c.nome !== nome),
    }));
  }

  // ---------- Backup ----------
  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = importaJson(String(reader.result));
        sostituisci(d);
        setEsitoImport(`Importati ${d.transazioni.length} movimenti.`);
      } catch (err) {
        setEsitoImport("Errore: " + (err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function svuota() {
    if (confirm("Cancellare TUTTI i dati? Esporta prima un backup.")) {
      sostituisci(datiVuoti());
    }
  }

  // ---------- Password ----------
  async function impostaPwd() {
    if (!pwd1) {
      setParam({ passwordHash: undefined });
      setEsitoPwd("Password rimossa.");
    } else {
      const h = await sha256(pwd1);
      setParam({ passwordHash: h });
      setEsitoPwd("Password impostata. Sarà chiesta al prossimo avvio.");
    }
    setPwd1("");
  }

  return (
    <>
      <div className="card">
        <h3>Backup dati</h3>
        <p className="muted">
          I dati restano solo in questo browser. Esporta un file JSON per fare
          backup o spostarli su un altro dispositivo (es. cartella OneDrive).
        </p>
        <div className="riga-azioni">
          <button className="primario" onClick={() => esportaJson(dati)}>
            Esporta JSON
          </button>
          <button
            className="secondario"
            onClick={() => fileRef.current?.click()}
          >
            Importa JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={onImport}
            style={{ display: "none" }}
          />
          <button className="secondario" onClick={svuota}>
            Svuota tutto
          </button>
          {esitoImport && <span className="muted">{esitoImport}</span>}
        </div>
      </div>

      <div className="card">
        <h3>Sincronizza con OneDrive</h3>
        <p className="muted">
          Salva il backup direttamente nel tuo OneDrive (cartella dedicata{" "}
          <b>Apps/Finanze</b>), così è disponibile su ogni dispositivo senza
          passare file a mano. L'accesso avviene con il tuo account Microsoft e
          l'app vede <b>solo</b> la propria cartella. Serve una registrazione
          gratuita dell'app su Azure per ottenere un <b>Application (client) ID</b>{" "}
          (istruzioni nel README).
        </p>
        <label className="campo" style={{ maxWidth: 420 }}>
          Application (client) ID
          <input
            placeholder="es. 00000000-0000-0000-0000-000000000000"
            value={odClient}
            onChange={(e) => setOdClient(e.target.value)}
          />
        </label>
        <div className="riga-azioni" style={{ marginTop: 12 }}>
          {odUtente ? (
            <>
              <button
                className="secondario"
                onClick={odScollega}
                disabled={odBusy}
              >
                Scollega ({odUtente})
              </button>
              <button className="primario" onClick={odSalva} disabled={odBusy}>
                Salva su OneDrive
              </button>
              <button
                className="secondario"
                onClick={odCarica}
                disabled={odBusy}
              >
                Carica da OneDrive
              </button>
            </>
          ) : (
            <button className="primario" onClick={odCollega} disabled={odBusy}>
              Collega OneDrive
            </button>
          )}
          {odMsg && <span className="muted">{odMsg}</span>}
        </div>
        {odUtente && (
          <label
            className="riga-azioni"
            style={{ marginTop: 12, alignItems: "center", gap: 8 }}
          >
            <input
              type="checkbox"
              checked={p.oneDriveAutoSync ?? false}
              onChange={(e) => setParam({ oneDriveAutoSync: e.target.checked })}
              style={{ width: "auto" }}
            />
            Salva automaticamente su OneDrive a ogni modifica
          </label>
        )}
      </div>

      <div className="card">
        <h3>Parametri</h3>
        <div className="form-griglia">
          <label className="campo">
            Saldo iniziale — data
            <input
              type="date"
              value={p.saldoInizialeData}
              onChange={(e) => setParam({ saldoInizialeData: e.target.value })}
            />
          </label>
          <label className="campo">
            Saldo iniziale — valore (€)
            <input
              type="number"
              value={p.saldoInizialeValore}
              onChange={(e) =>
                setParam({ saldoInizialeValore: Number(e.target.value) })
              }
            />
          </label>
          <label className="campo">
            Data di nascita
            <input
              type="date"
              value={p.dataNascita}
              onChange={(e) => setParam({ dataNascita: e.target.value })}
            />
          </label>
          <label className="campo">
            Inflazione annua (es. 0.02 = 2%)
            <input
              type="number"
              step="0.005"
              value={p.inflazione}
              onChange={(e) => setParam({ inflazione: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h3>Categorie</h3>
        <div className="riga-azioni" style={{ marginBottom: 12 }}>
          <input
            placeholder="Nuova categoria…"
            value={nuovaCat}
            onChange={(e) => setNuovaCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && aggiungiCat()}
          />
          <button className="secondario" onClick={aggiungiCat}>
            Aggiungi
          </button>
        </div>
        <div className="riga-azioni">
          {dati.categorie.map((c) => (
            <span key={c.nome} className="chip" style={{ padding: "4px 6px 4px 10px" }}>
              {c.nome}{" "}
              <button
                onClick={() => rimuoviCat(c.nome)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--muted)",
                  padding: "0 2px",
                }}
                title="Rimuovi"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Codice di accesso</h3>
        <p className="muted">
          Barriera per l'interfaccia (lascia vuoto e salva per rimuoverla). Per
          proteggere davvero i dati usa il login Microsoft della sezione
          OneDrive qui sopra.
        </p>
        <div className="riga-azioni">
          <input
            type="password"
            placeholder={p.passwordHash ? "Nuovo codice…" : "Imposta codice…"}
            value={pwd1}
            onChange={(e) => setPwd1(e.target.value)}
          />
          <button className="secondario" onClick={impostaPwd}>
            Salva codice
          </button>
          {esitoPwd && <span className="muted">{esitoPwd}</span>}
        </div>
      </div>
    </>
  );
}
