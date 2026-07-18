import { useMemo, useState } from "react";
import { useApp } from "../store/AppStore";
import { Transazione } from "../types";
import { euro } from "../util";
import {
  parseCsv,
  indovinaMappatura,
  righeATransazioni,
  scartaDuplicati,
  MappaturaCsv,
} from "../store/io";

type Tipo = "" | "entrate" | "uscite" | "trasferimenti";

export function Movimenti() {
  const { dati, aggiorna } = useApp();
  const [importCsv, setImportCsv] = useState<{
    righe: string[][];
    header: string[];
    mappa: MappaturaCsv;
    conHeader: boolean;
  } | null>(null);

  // Filtri: uno per "colonna" (data, causale, importo) + tipo e categoria.
  const [filtroTesto, setFiltroTesto] = useState("");
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");
  const [importoMin, setImportoMin] = useState("");
  const [importoMax, setImportoMax] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<Tipo>("");
  const [filtroCat, setFiltroCat] = useState("");

  const [mostraAI, setMostraAI] = useState(false);
  const [esitoImport, setEsitoImport] = useState("");

  const categorie = dati.categorie.map((c) => c.nome);

  const filtrate = useMemo(() => {
    const txt = filtroTesto.toLowerCase().trim();
    const min = importoMin === "" ? undefined : Number(importoMin);
    const max = importoMax === "" ? undefined : Number(importoMax);
    return dati.transazioni
      .filter((t) => {
        if (dataDa && t.data < dataDa) return false;
        if (dataA && t.data > dataA) return false;
        if (filtroTipo === "entrate" && !t.entrate) return false;
        if (filtroTipo === "uscite" && !(t.uscite && !t.trasferimento))
          return false;
        if (filtroTipo === "trasferimenti" && !t.trasferimento) return false;
        if (filtroCat) {
          if (filtroCat === "__vuote__" && (t.categoria || t.trasferimento))
            return false;
          if (
            filtroCat !== "__vuote__" &&
            filtroCat !== "__trasf__" &&
            t.categoria !== filtroCat
          )
            return false;
          if (filtroCat === "__trasf__" && !t.trasferimento) return false;
        }
        if (min !== undefined || max !== undefined) {
          const imp = t.entrate ?? t.uscite ?? 0;
          if (min !== undefined && imp < min) return false;
          if (max !== undefined && imp > max) return false;
        }
        if (txt && !(t.causale ?? "").toLowerCase().includes(txt)) return false;
        return true;
      })
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [
    dati.transazioni,
    filtroTesto,
    dataDa,
    dataA,
    importoMin,
    importoMax,
    filtroTipo,
    filtroCat,
  ]);

  const nonCategorizzate = dati.transazioni.filter(
    (t) => t.uscite && !t.categoria && !t.trasferimento,
  ).length;

  const filtriAttivi =
    filtroTesto ||
    dataDa ||
    dataA ||
    importoMin ||
    importoMax ||
    filtroTipo ||
    filtroCat;

  function azzeraFiltri() {
    setFiltroTesto("");
    setDataDa("");
    setDataA("");
    setImportoMin("");
    setImportoMax("");
    setFiltroTipo("");
    setFiltroCat("");
  }

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
    const { unici, duplicati } = scartaDuplicati(anteprima, dati.transazioni);
    aggiorna((d) => ({
      ...d,
      transazioni: [...d.transazioni, ...unici],
    }));
    setEsitoImport(
      `Importati ${unici.length} movimenti` +
        (duplicati > 0 ? ` · ${duplicati} duplicati saltati` : ""),
    );
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
        {esitoImport && <span className="chip">{esitoImport}</span>}
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

      <div className="filtri">
        <input
          placeholder="Cerca nella causale…"
          value={filtroTesto}
          onChange={(e) => setFiltroTesto(e.target.value)}
          style={{ minWidth: 190, flex: "1 1 190px" }}
        />
        <label className="filtro-campo">
          <span>Da</span>
          <input
            type="date"
            value={dataDa}
            onChange={(e) => setDataDa(e.target.value)}
          />
        </label>
        <label className="filtro-campo">
          <span>A</span>
          <input
            type="date"
            value={dataA}
            onChange={(e) => setDataA(e.target.value)}
          />
        </label>
        <input
          type="number"
          placeholder="€ min"
          value={importoMin}
          onChange={(e) => setImportoMin(e.target.value)}
          style={{ width: 92 }}
        />
        <input
          type="number"
          placeholder="€ max"
          value={importoMax}
          onChange={(e) => setImportoMax(e.target.value)}
          style={{ width: 92 }}
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as Tipo)}
        >
          <option value="">Tutti i tipi</option>
          <option value="entrate">Entrate</option>
          <option value="uscite">Uscite</option>
          <option value="trasferimenti">Trasferimenti</option>
        </select>
        <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}>
          <option value="">Tutte le categorie</option>
          <option value="__vuote__">Da categorizzare</option>
          <option value="__trasf__">Trasferimenti (giroconti)</option>
          {categorie.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {filtriAttivi && (
          <button className="secondario" onClick={azzeraFiltri}>
            Azzera filtri
          </button>
        )}
      </div>

      {dati.transazioni.length === 0 ? (
        <div className="card vuoto">
          Nessun movimento. Importa un CSV del tuo conto per iniziare, oppure
          carica un backup JSON da <b>Impostazioni</b>.
        </div>
      ) : (
        <TabellaMovimenti
          righe={filtrate}
          totale={dati.transazioni.length}
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
  totale,
  categorie,
  onModifica,
  onElimina,
}: {
  righe: Transazione[];
  totale: number;
  categorie: string[];
  onModifica: (id: string, patch: Partial<Transazione>) => void;
  onElimina: (id: string) => void;
}) {
  const LIMITE = 400;
  const visibili = righe.slice(0, LIMITE);
  return (
    <>
      <p className="muted" style={{ margin: "0 0 8px" }}>
        {righe.length === totale
          ? `${totale} movimenti`
          : `${righe.length} di ${totale} movimenti (filtrati)`}
      </p>
      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Causale</th>
              <th className="num">Entrate</th>
              <th className="num">Uscite</th>
              <th>Categoria</th>
              <th title="Giroconto / trasferimento su altro conto (es. PAC)">
                Giro
              </th>
              <th>Fatt.</th>
              <th>Tasse</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibili.map((t) => (
              <tr key={t.id} className={t.trasferimento ? "riga-trasf" : ""}>
                <td>{t.data}</td>
                <td title={t.causale}>
                  {(t.causale ?? "").slice(0, 46) || (
                    <span className="muted">{t.tipologia}</span>
                  )}
                </td>
                <td className="num entrata">
                  {t.entrate ? euro(t.entrate, true) : ""}
                </td>
                <td
                  className={"num " + (t.trasferimento ? "muted" : "uscita")}
                  title={t.trasferimento ? "Trasferimento (non è una spesa)" : ""}
                >
                  {t.uscite ? euro(t.uscite, true) : ""}
                </td>
                <td>
                  <select
                    value={t.categoria ?? ""}
                    disabled={t.trasferimento}
                    onChange={(e) =>
                      onModifica(t.id, {
                        categoria: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">{t.trasferimento ? "—" : "—"}</option>
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
                    checked={!!t.trasferimento}
                    title="Segna come trasferimento/giroconto (es. PAC su Scalable)"
                    onChange={(e) =>
                      onModifica(t.id, {
                        trasferimento: e.target.checked || undefined,
                        // un trasferimento non è una categoria di spesa
                        categoria: e.target.checked ? undefined : t.categoria,
                      })
                    }
                  />
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

  // I trasferimenti non sono spese: fuori dalla categorizzazione.
  const daFare = dati.transazioni.filter(
    (t) => t.uscite && !t.categoria && !t.trasferimento,
  );

  const prompt = buildPromptCategorizzazione(dati.categorie, daFare);

  function copia() {
    void navigator.clipboard.writeText(prompt);
    setEsito("Prompt copiato negli appunti. Incollalo su Claude.");
  }

  function applica() {
    const perId = new Map(dati.transazioni.map((t) => [t.id, t]));
    const nomiValidi = new Set(dati.categorie.map((c) => c.nome));
    let n = 0;
    let ignorate = 0;
    const patch = new Map<string, string>();
    for (const riga of risultato.split(/\r?\n/)) {
      const [id, ...resto] = riga.split(/[;,\t]/);
      const idT = id?.trim();
      const cat = resto.join(",").trim();
      if (!idT || !cat || !perId.has(idT)) continue;
      // Accetta solo categorie esistenti (match case-insensitive).
      const nome =
        [...nomiValidi].find((v) => v.toLowerCase() === cat.toLowerCase()) ??
        null;
      if (!nome) {
        ignorate++;
        continue;
      }
      patch.set(idT, nome);
      n++;
    }
    if (n > 0) {
      aggiorna((d) => ({
        ...d,
        transazioni: d.transazioni.map((t) =>
          patch.has(t.id) ? { ...t, categoria: patch.get(t.id) } : t,
        ),
      }));
    }
    setEsito(
      `Applicate ${n} categorie.` +
        (ignorate > 0 ? ` ${ignorate} righe ignorate (categoria non valida).` : ""),
    );
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
        {daFare.length} movimenti da categorizzare. Copia il prompt (contiene le
        categorie con le loro descrizioni), incollalo su claude.ai, poi incolla
        qui sotto le righe <code>id;categoria</code> che ottieni. Per migliorare
        i risultati, arricchisci le descrizioni delle categorie in{" "}
        <b>Impostazioni</b>.
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

/** Costruisce un prompt strutturato per far categorizzare i movimenti a Claude. */
function buildPromptCategorizzazione(
  categorie: { nome: string; descrizione?: string }[],
  daFare: Transazione[],
): string {
  const elencoCategorie = categorie
    .map((c) => (c.descrizione ? `- ${c.nome}: ${c.descrizione}` : `- ${c.nome}`))
    .join("\n");

  const righe = daFare
    .map((t) =>
      [
        t.id,
        t.data,
        (t.tipologia ?? "").replace(/;/g, ","),
        t.uscite ?? "",
        (t.causale ?? "").replace(/;/g, ",").replace(/\s+/g, " ").trim(),
      ].join(";"),
    )
    .join("\n");

  return (
    `Sei un contabile che classifica movimenti bancari italiani per una contabilità personale. ` +
    `Assegna a OGNI movimento una sola categoria tra quelle elencate, scegliendo la più probabile ` +
    `in base a causale, tipologia e importo.\n\n` +
    `CATEGORIE DISPONIBILI (usa ESATTAMENTE questi nomi, senza varianti né categorie inventate):\n` +
    `${elencoCategorie}\n\n` +
    `INDIZI UTILI:\n` +
    `- La "tipologia" aiuta: pagamento POS/carta = acquisto in negozio; addebito SEPA/RID o bonifico ricorrente = spesso abbonamenti o utenze; prelievo/ATM = Contanti.\n` +
    `- Nomi noti nella causale indirizzano la categoria (es. Esselunga→Spesa/casa, Q8→Benzina, Netflix→Abbonamenti, Telepass→Auto).\n` +
    `- Se un movimento non combacia con nessuna categoria, usa "Extra". Se è dubbio ma verificabile, usa "Da fare".\n\n` +
    `REGOLE DI RISPOSTA:\n` +
    `- Rispondi SOLO con righe nel formato "id;categoria", una per movimento.\n` +
    `- Niente intestazione, niente spiegazioni, niente altro testo.\n` +
    `- Usa esclusivamente i nomi di categoria elencati sopra.\n\n` +
    `MOVIMENTI DA CATEGORIZZARE (formato: id;data;tipologia;importo;causale):\n` +
    `${righe}`
  );
}
