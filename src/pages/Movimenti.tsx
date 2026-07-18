import { useMemo, useState } from "react";
import { useApp } from "../store/AppStore";
import { Transazione } from "../types";
import { euro, annoMese, labelMese } from "../util";
import {
  parseCsv,
  indovinaMappatura,
  righeATransazioni,
  MappaturaCsv,
} from "../store/io";

export function Movimenti() {
  const { dati, aggiorna } = useApp();
  const [importCsv, setImportCsv] = useState<{
    righe: string[][];
    header: string[];
    mappa: MappaturaCsv;
    conHeader: boolean;
  } | null>(null);
  const [filtroTesto, setFiltroTesto] = useState("");
  const [filtroMese, setFiltroMese] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [mostraAI, setMostraAI] = useState(false);

  const categorie = dati.categorie.map((c) => c.nome);

  const mesiDisponibili = useMemo(() => {
    const s = new Set<string>();
    for (const t of dati.transazioni) s.add(annoMese(t.data));
    return [...s].sort().reverse();
  }, [dati.transazioni]);

  const filtrate = useMemo(() => {
    const txt = filtroTesto.toLowerCase();
    return dati.transazioni
      .filter((t) => {
        if (filtroMese && annoMese(t.data) !== filtroMese) return false;
        if (filtroCat) {
          if (filtroCat === "__vuote__" && t.categoria) return false;
          if (filtroCat !== "__vuote__" && t.categoria !== filtroCat)
            return false;
        }
        if (txt && !(t.causale ?? "").toLowerCase().includes(txt)) return false;
        return true;
      })
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [dati.transazioni, filtroTesto, filtroMese, filtroCat]);

  const nonCategorizzate = dati.transazioni.filter(
    (t) => t.uscite && !t.categoria,
  ).length;

  // ---------- Import CSV ----------

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const righe = parseCsv(String(reader.result));
      if (righe.length === 0) return;
      const header = righe[0];
      setImportCsv({
        righe,
        header,
        mappa: indovinaMappatura(header),
        conHeader: true,
      });
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  const anteprima = useMemo(() => {
    if (!importCsv) return [];
    const corpo = importCsv.conHeader
      ? importCsv.righe.slice(1)
      : importCsv.righe;
    return righeATransazioni(corpo, importCsv.mappa);
  }, [importCsv]);

  function confermaImport() {
    if (!importCsv) return;
    aggiorna((d) => ({
      ...d,
      transazioni: [...d.transazioni, ...anteprima],
    }));
    setImportCsv(null);
  }

  // ---------- Modifica riga ----------

  function modifica(id: string, patch: Partial<Transazione>) {
    aggiorna((d) => ({
      ...d,
      transazioni: d.transazioni.map((t) =>
        t.id === id ? { ...t, ...patch } : t,
      ),
    }));
  }

  function elimina(id: string) {
    aggiorna((d) => ({
      ...d,
      transazioni: d.transazioni.filter((t) => t.id !== id),
    }));
  }

  return (
    <>
      <div className="riga-azioni" style={{ marginBottom: 16 }}>
        <label className="secondario" style={{ display: "inline-block" }}>
          Importa CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            style={{ display: "none" }}
          />
        </label>
        <button
          className="secondario"
          onClick={() => setMostraAI((v) => !v)}
          disabled={nonCategorizzate === 0}
        >
          Categorizza con Claude{" "}
          {nonCategorizzate > 0 && (
            <span className="chip">{nonCategorizzate}</span>
          )}
        </button>
        <span className="muted">
          {dati.transazioni.length} movimenti · {nonCategorizzate} da
          categorizzare
        </span>
      </div>

      {importCsv && (
        <MappaturaImport
          stato={importCsv}
          anteprima={anteprima}
          onCambia={(m) => setImportCsv({ ...importCsv, ...m })}
          onConferma={confermaImport}
          onAnnulla={() => setImportCsv(null)}
        />
      )}

      {mostraAI && <PannelloAI onChiudi={() => setMostraAI(false)} />}

      <div className="riga-azioni" style={{ marginBottom: 12 }}>
        <input
          placeholder="Cerca causale…"
          value={filtroTesto}
          onChange={(e) => setFiltroTesto(e.target.value)}
          style={{ minWidth: 200 }}
        />
        <select value={filtroMese} onChange={(e) => setFiltroMese(e.target.value)}>
          <option value="">Tutti i mesi</option>
          {mesiDisponibili.map((m) => (
            <option key={m} value={m}>
              {labelMese(m)}
            </option>
          ))}
        </select>
        <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}>
          <option value="">Tutte le categorie</option>
          <option value="__vuote__">Da categorizzare</option>
          {categorie.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {dati.transazioni.length === 0 ? (
        <div className="card vuoto">
          Nessun movimento. Importa un CSV del tuo conto per iniziare, oppure
          carica un backup JSON da <b>Impostazioni</b>.
        </div>
      ) : (
        <TabellaMovimenti
          righe={filtrate}
          categorie={categorie}
          onModifica={modifica}
          onElimina={elimina}
        />
      )}
    </>
  );
}

// ---------- Tabella ----------

function TabellaMovimenti({
  righe,
  categorie,
  onModifica,
  onElimina,
}: {
  righe: Transazione[];
  categorie: string[];
  onModifica: (id: string, patch: Partial<Transazione>) => void;
  onElimina: (id: string) => void;
}) {
  const LIMITE = 400;
  const visibili = righe.slice(0, LIMITE);
  return (
    <>
      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Causale</th>
              <th className="num">Entrate</th>
              <th className="num">Uscite</th>
              <th>Categoria</th>
              <th>Fatt.</th>
              <th>Tasse</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibili.map((t) => (
              <tr key={t.id}>
                <td>{t.data}</td>
                <td title={t.causale}>
                  {(t.causale ?? "").slice(0, 46) || (
                    <span className="muted">{t.tipologia}</span>
                  )}
                </td>
                <td className="num entrata">
                  {t.entrate ? euro(t.entrate, true) : ""}
                </td>
                <td className="num uscita">
                  {t.uscite ? euro(t.uscite, true) : ""}
                </td>
                <td>
                  <select
                    value={t.categoria ?? ""}
                    onChange={(e) =>
                      onModifica(t.id, {
                        categoria: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">—</option>
                    {categorie.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!t.fattura}
                    onChange={(e) =>
                      onModifica(t.id, { fattura: e.target.checked })
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!t.tasse}
                    onChange={(e) =>
                      onModifica(t.id, { tasse: e.target.checked })
                    }
                  />
                </td>
                <td>
                  <button
                    className="secondario"
                    style={{ padding: "2px 8px" }}
                    onClick={() => onElimina(t.id)}
                    title="Elimina"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {righe.length > LIMITE && (
        <p className="muted" style={{ marginTop: 8 }}>
          Mostrate {LIMITE} di {righe.length}. Usa i filtri per restringere.
        </p>
      )}
    </>
  );
}

// ---------- Mappatura import ----------

function MappaturaImport({
  stato,
  anteprima,
  onCambia,
  onConferma,
  onAnnulla,
}: {
  stato: { righe: string[][]; header: string[]; mappa: MappaturaCsv; conHeader: boolean };
  anteprima: Transazione[];
  onCambia: (m: Partial<typeof stato>) => void;
  onConferma: () => void;
  onAnnulla: () => void;
}) {
  const colonne = stato.header.map((h, i) => ({
    i,
    nome: stato.conHeader ? h || `Col ${i + 1}` : `Col ${i + 1}`,
  }));
  const set = (campo: keyof MappaturaCsv, val: number) =>
    onCambia({ mappa: { ...stato.mappa, [campo]: val } });

  const Selettore = ({
    campo,
    label,
    consentiVuoto,
  }: {
    campo: keyof MappaturaCsv;
    label: string;
    consentiVuoto?: boolean;
  }) => (
    <label className="campo">
      {label}
      <select
        value={stato.mappa[campo] ?? -1}
        onChange={(e) => set(campo, Number(e.target.value))}
      >
        {consentiVuoto && <option value={-1}>— nessuna —</option>}
        {colonne.map((c) => (
          <option key={c.i} value={c.i}>
            {c.nome}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="card">
      <h3>Importazione CSV — controlla le colonne</h3>
      <label
        className="campo"
        style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}
      >
        <input
          type="checkbox"
          checked={stato.conHeader}
          onChange={(e) => onCambia({ conHeader: e.target.checked })}
        />
        La prima riga è un'intestazione
      </label>
      <div className="form-griglia">
        <Selettore campo="data" label="Data" />
        <Selettore campo="entrate" label="Entrate" consentiVuoto />
        <Selettore campo="uscite" label="Uscite" consentiVuoto />
        <Selettore campo="importo" label="Importo unico (con segno)" consentiVuoto />
        <Selettore campo="causale" label="Causale" consentiVuoto />
        <Selettore campo="tipologia" label="Tipologia" consentiVuoto />
      </div>

      <p className="muted" style={{ marginTop: 14 }}>
        Anteprima ({anteprima.length} movimenti riconosciuti):
      </p>
      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Causale</th>
              <th className="num">Entrate</th>
              <th className="num">Uscite</th>
            </tr>
          </thead>
          <tbody>
            {anteprima.slice(0, 5).map((t) => (
              <tr key={t.id}>
                <td>{t.data}</td>
                <td>{(t.causale ?? "").slice(0, 40)}</td>
                <td className="num">{t.entrate ? euro(t.entrate, true) : ""}</td>
                <td className="num">{t.uscite ? euro(t.uscite, true) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="riga-azioni" style={{ marginTop: 14 }}>
        <button
          className="primario"
          onClick={onConferma}
          disabled={anteprima.length === 0}
        >
          Importa {anteprima.length} movimenti
        </button>
        <button className="secondario" onClick={onAnnulla}>
          Annulla
        </button>
      </div>
    </div>
  );
}

// ---------- Pannello categorizzazione con Claude ----------

function PannelloAI({ onChiudi }: { onChiudi: () => void }) {
  const { dati, aggiorna } = useApp();
  const [risultato, setRisultato] = useState("");
  const [esito, setEsito] = useState("");

  const daFare = dati.transazioni.filter((t) => t.uscite && !t.categoria);
  const categorie = dati.categorie.map((c) => c.nome).join(", ");

  const prompt =
    `Categorizza questi movimenti bancari usando SOLO queste categorie: ${categorie}.\n` +
    `Rispondi con un CSV senza intestazione, una riga per movimento, formato: id;categoria\n` +
    `Non aggiungere altro testo.\n\n` +
    `id;data;importo;causale\n` +
    daFare
      .map(
        (t) =>
          `${t.id};${t.data};${t.uscite};${(t.causale ?? "").replace(/;/g, ",")}`,
      )
      .join("\n");

  function copia() {
    void navigator.clipboard.writeText(prompt);
    setEsito("Prompt copiato negli appunti. Incollalo su Claude.");
  }

  function applica() {
    const perId = new Map(dati.transazioni.map((t) => [t.id, t]));
    let n = 0;
    const patch = new Map<string, string>();
    for (const riga of risultato.split(/\r?\n/)) {
      const [id, cat] = riga.split(/[;,\t]/).map((s) => s?.trim());
      if (id && cat && perId.has(id)) {
        patch.set(id, cat);
        n++;
      }
    }
    if (n > 0) {
      aggiorna((d) => ({
        ...d,
        transazioni: d.transazioni.map((t) =>
          patch.has(t.id) ? { ...t, categoria: patch.get(t.id) } : t,
        ),
      }));
    }
    setEsito(`Applicate ${n} categorie.`);
    setRisultato("");
  }

  return (
    <div className="card">
      <div className="riga-azioni" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Categorizzazione con Claude</h3>
        <button className="secondario" onClick={onChiudi}>
          Chiudi
        </button>
      </div>
      <p className="muted">
        {daFare.length} movimenti da categorizzare. Copia il prompt, incollalo
        su claude.ai, poi incolla qui sotto il CSV che ottieni.
      </p>
      <div className="riga-azioni">
        <button className="primario" onClick={copia}>
          Copia prompt
        </button>
      </div>
      <textarea
        style={{
          width: "100%",
          minHeight: 120,
          marginTop: 12,
          fontFamily: "monospace",
          fontSize: 12,
          padding: 10,
          borderRadius: 8,
          border: "1px solid var(--bordo)",
          background: "var(--bg-card)",
          color: "var(--testo)",
        }}
        placeholder="Incolla qui il risultato di Claude (righe id;categoria)…"
        value={risultato}
        onChange={(e) => setRisultato(e.target.value)}
      />
      <div className="riga-azioni" style={{ marginTop: 10 }}>
        <button
          className="primario"
          onClick={applica}
          disabled={!risultato.trim()}
        >
          Applica categorie
        </button>
        {esito && <span className="muted">{esito}</span>}
      </div>
    </div>
  );
}
