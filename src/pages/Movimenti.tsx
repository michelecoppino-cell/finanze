import { useMemo, useState } from "react";
import { useApp } from "../store/AppStore";
import { Transazione } from "../types";
import { euro, numero, parseNumeroIt, uid } from "../util";
import {
  parseCsv,
  indovinaMappatura,
  righeATransazioni,
  scartaDuplicati,
  MappaturaCsv,
} from "../store/io";

type Tipo = "" | "entrate" | "uscite" | "trasferimenti" | "annullate";

/** Azioni applicabili in blocco ai movimenti selezionati. */
const AZIONI_BULK: { id: string; nome: string; patch: Partial<Transazione> }[] = [
  { id: "annulla", nome: "Annulla voci", patch: { annullata: true } },
  { id: "ripristina", nome: "Ripristina voci", patch: { annullata: undefined } },
  {
    id: "giro-si",
    nome: "Segna come giroconto",
    patch: { trasferimento: true, categoria: undefined },
  },
  { id: "giro-no", nome: "Togli giroconto", patch: { trasferimento: undefined } },
  { id: "fatt-si", nome: "Segna come fattura", patch: { fattura: true } },
  { id: "fatt-no", nome: "Togli fattura", patch: { fattura: undefined } },
  { id: "tasse-si", nome: "Segna come tasse", patch: { tasse: true } },
  { id: "tasse-no", nome: "Togli tasse", patch: { tasse: undefined } },
];

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
  const [mostraNuovo, setMostraNuovo] = useState(false);
  const [esitoImport, setEsitoImport] = useState("");
  // Selezione multipla per le modifiche in blocco.
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  // Su schermi piccoli i filtri partono chiusi (occupano molto spazio); su
  // desktop restano sempre visibili.
  const [filtriAperti, setFiltriAperti] = useState<boolean>(
    () =>
      typeof window === "undefined" ||
      window.matchMedia("(min-width: 761px)").matches,
  );

  const categorie = dati.categorie.map((c) => c.nome);
  const numAnnullate = dati.transazioni.filter((t) => t.annullata).length;
  const numAttive = dati.transazioni.length - numAnnullate;

  const filtrate = useMemo(() => {
    const txt = filtroTesto.toLowerCase().trim();
    // parseNumeroIt accetta anche importi scritti all'italiana ("1.234,56").
    const min = parseNumeroIt(importoMin);
    const max = parseNumeroIt(importoMax);
    return dati.transazioni
      .filter((t) => {
        if (dataDa && t.data < dataDa) return false;
        if (dataA && t.data > dataA) return false;
        // Le annullate restano visibili in elenco (barrate) ma non compaiono
        // quando si filtra per un tipo specifico; "Annullate" le mostra da sole.
        if (filtroTipo === "annullate") return !!t.annullata;
        if (t.annullata && filtroTipo) return false;
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
        if (txt) {
          const cerca = `${t.causale ?? ""} ${t.tipologia ?? ""} ${
            t.categoria ?? ""
          }`.toLowerCase();
          if (!cerca.includes(txt)) return false;
        }
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

  // Totali del risultato filtrato: utili per rispondere a "quanto ho speso in X?".
  // Le voci annullate non contano (come ovunque nei calcoli).
  const totaliFiltrati = useMemo(() => {
    let entrate = 0;
    let uscite = 0;
    for (const t of filtrate) {
      if (t.annullata) continue;
      if (t.entrate) entrate += t.entrate;
      if (t.uscite && !t.trasferimento) uscite += t.uscite;
    }
    return { entrate, uscite };
  }, [filtrate]);

  const nonCategorizzate = dati.transazioni.filter(
    (t) => t.uscite && !t.categoria && !t.trasferimento && !t.annullata,
  ).length;

  const numFiltriAttivi = [
    filtroTesto,
    dataDa,
    dataA,
    importoMin,
    importoMax,
    filtroTipo,
    filtroCat,
  ].filter(Boolean).length;
  const filtriAttivi = numFiltriAttivi > 0;

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

  // "Cancellazione" soft: la voce resta in elenco (grigia e barrata) ma sparisce
  // da tutti i calcoli. Ripremendo si ripristina.
  function toggleAnnullata(id: string) {
    aggiorna((d) => ({
      ...d,
      transazioni: d.transazioni.map((t) =>
        t.id === id ? { ...t, annullata: t.annullata ? undefined : true } : t,
      ),
    }));
  }

  // ---------- Selezione multipla / modifiche in blocco ----------

  function toggleSel(id: string) {
    setSelezione((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Seleziona/deseleziona tutte le righe filtrate (non solo quelle visibili). */
  function toggleSelTutte() {
    setSelezione((prev) =>
      prev.size === filtrate.length
        ? new Set()
        : new Set(filtrate.map((t) => t.id)),
    );
  }

  function applicaBulk(patch: Partial<Transazione>) {
    aggiorna((d) => ({
      ...d,
      transazioni: d.transazioni.map((t) =>
        selezione.has(t.id) ? { ...t, ...patch } : t,
      ),
    }));
  }

  function applicaBulkCategoria(cat: string) {
    aggiorna((d) => ({
      ...d,
      transazioni: d.transazioni.map((t) =>
        // I trasferimenti non hanno categoria di spesa: vengono saltati.
        selezione.has(t.id) && !t.trasferimento
          ? { ...t, categoria: cat || undefined }
          : t,
      ),
    }));
  }

  // ---------- Aggiunta manuale ----------

  function aggiungiMovimento(t: Transazione) {
    aggiorna((d) => ({ ...d, transazioni: [...d.transazioni, t] }));
    setMostraNuovo(false);
    setEsitoImport("Movimento aggiunto.");
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
        <button className="secondario" onClick={() => setMostraNuovo((v) => !v)}>
          + Aggiungi movimento
        </button>
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
          {numero(numAttive)} movimenti · {numero(nonCategorizzate)} da
          categorizzare
          {numAnnullate > 0 && <> · {numero(numAnnullate)} annullati</>}
        </span>
        {esitoImport && <span className="chip">{esitoImport}</span>}
      </div>

      {mostraNuovo && (
        <FormNuovoMovimento
          categorie={categorie}
          onAggiungi={aggiungiMovimento}
          onAnnulla={() => setMostraNuovo(false)}
        />
      )}

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

      <button
        className="secondario filtri-toggle"
        onClick={() => setFiltriAperti((v) => !v)}
        aria-expanded={filtriAperti}
      >
        {filtriAperti ? "▾" : "▸"} Filtri
        {filtriAttivi && <span className="chip">{numFiltriAttivi}</span>}
      </button>

      {filtriAperti && (
        <div className="filtri">
          <input
            placeholder="Cerca in causale, tipologia, categoria…"
            value={filtroTesto}
            onChange={(e) => setFiltroTesto(e.target.value)}
            style={{ minWidth: 190, flex: "2 1 190px" }}
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
            inputMode="decimal"
            placeholder="€ min"
            value={importoMin}
            onChange={(e) => setImportoMin(e.target.value)}
            style={{ width: 92 }}
          />
          <input
            inputMode="decimal"
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
            <option value="annullate">Annullate</option>
          </select>
          <select
            value={filtroCat}
            onChange={(e) => setFiltroCat(e.target.value)}
          >
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
      )}

      {selezione.size > 0 && (
        <BarraSelezione
          n={selezione.size}
          categorie={categorie}
          onCategoria={applicaBulkCategoria}
          onAzione={applicaBulk}
          onDeseleziona={() => setSelezione(new Set())}
        />
      )}

      {dati.transazioni.length === 0 ? (
        <div className="card vuoto">
          Nessun movimento. Importa un CSV del tuo conto per iniziare, oppure
          carica un backup JSON da <b>Impostazioni</b>.
        </div>
      ) : (
        <TabellaMovimenti
          righe={filtrate}
          totaleAttivi={numAttive}
          totaliFiltrati={filtriAttivi ? totaliFiltrati : undefined}
          categorie={categorie}
          selezione={selezione}
          onToggleSel={toggleSel}
          onToggleSelTutte={toggleSelTutte}
          onModifica={modifica}
          onToggleAnnullata={toggleAnnullata}
        />
      )}
    </>
  );
}

// ---------- Barra azioni per la selezione multipla ----------

function BarraSelezione({
  n,
  categorie,
  onCategoria,
  onAzione,
  onDeseleziona,
}: {
  n: number;
  categorie: string[];
  onCategoria: (cat: string) => void;
  onAzione: (patch: Partial<Transazione>) => void;
  onDeseleziona: () => void;
}) {
  const [cat, setCat] = useState("");
  const [azione, setAzione] = useState("");

  return (
    <div className="card barra-selezione">
      <b>{numero(n)} selezionati</b>
      <span className="barra-gruppo">
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Categoria…</option>
          <option value="__togli__">— nessuna —</option>
          {categorie.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          className="secondario"
          disabled={!cat}
          onClick={() => onCategoria(cat === "__togli__" ? "" : cat)}
        >
          Applica
        </button>
      </span>
      <span className="barra-gruppo">
        <select value={azione} onChange={(e) => setAzione(e.target.value)}>
          <option value="">Azione…</option>
          {AZIONI_BULK.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
        <button
          className="secondario"
          disabled={!azione}
          onClick={() => {
            const a = AZIONI_BULK.find((x) => x.id === azione);
            if (a) onAzione(a.patch);
          }}
        >
          Applica
        </button>
      </span>
      <button className="secondario" onClick={onDeseleziona}>
        Deseleziona
      </button>
    </div>
  );
}

// ---------- Aggiunta manuale di un movimento ----------

function FormNuovoMovimento({
  categorie,
  onAggiungi,
  onAnnulla,
}: {
  categorie: string[];
  onAggiungi: (t: Transazione) => void;
  onAnnulla: () => void;
}) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [causale, setCausale] = useState("");
  const [verso, setVerso] = useState<"uscita" | "entrata">("uscita");
  const [importo, setImporto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [note, setNote] = useState("");

  const imp = parseNumeroIt(importo);
  const valido = !!data && imp !== undefined && imp > 0;

  function conferma() {
    if (!valido) return;
    const v = Math.abs(imp!);
    onAggiungi({
      id: uid(),
      data,
      causale: causale.trim() || undefined,
      tipologia: "Manuale",
      entrate: verso === "entrata" ? v : undefined,
      uscite: verso === "uscita" ? v : undefined,
      categoria: categoria || undefined,
      note: note.trim() || undefined,
    });
  }

  return (
    <div className="card">
      <h3>Nuovo movimento manuale</h3>
      <p className="muted" style={{ marginTop: -4 }}>
        Per correzioni o spese non tracciate (es. contanti). Viene marcato con
        tipologia &quot;Manuale&quot;.
      </p>
      <div className="form-griglia">
        <label className="campo">
          Data
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </label>
        <label className="campo">
          Causale
          <input
            placeholder="es. Spesa in contanti al mercato"
            value={causale}
            onChange={(e) => setCausale(e.target.value)}
          />
        </label>
        <label className="campo">
          Tipo
          <select
            value={verso}
            onChange={(e) => setVerso(e.target.value as "uscita" | "entrata")}
          >
            <option value="uscita">Uscita</option>
            <option value="entrata">Entrata</option>
          </select>
        </label>
        <label className="campo">
          Importo (€)
          <input
            inputMode="decimal"
            placeholder="es. 25,50"
            value={importo}
            onChange={(e) => setImporto(e.target.value)}
          />
        </label>
        <label className="campo">
          Categoria
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="">—</option>
            {categorie.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="riga-azioni" style={{ marginTop: 14 }}>
        <button className="primario" onClick={conferma} disabled={!valido}>
          Aggiungi
        </button>
        <button className="secondario" onClick={onAnnulla}>
          Annulla
        </button>
      </div>
    </div>
  );
}

// ---------- Tabella ----------

function TabellaMovimenti({
  righe,
  totaleAttivi,
  totaliFiltrati,
  categorie,
  selezione,
  onToggleSel,
  onToggleSelTutte,
  onModifica,
  onToggleAnnullata,
}: {
  righe: Transazione[];
  totaleAttivi: number;
  totaliFiltrati?: { entrate: number; uscite: number };
  categorie: string[];
  selezione: Set<string>;
  onToggleSel: (id: string) => void;
  onToggleSelTutte: () => void;
  onModifica: (id: string, patch: Partial<Transazione>) => void;
  onToggleAnnullata: (id: string) => void;
}) {
  const LIMITE = 400;
  const visibili = righe.slice(0, LIMITE);
  const tutteSelezionate =
    righe.length > 0 && selezione.size === righe.length;
  // Il conteggio confronta solo le voci attive: le annullate sono in elenco
  // ma non "esistono".
  const attiveVisibili = righe.filter((t) => !t.annullata).length;
  return (
    <>
      <p className="muted" style={{ margin: "0 0 8px" }}>
        {attiveVisibili === totaleAttivi
          ? `${numero(totaleAttivi)} movimenti`
          : `${numero(attiveVisibili)} di ${numero(totaleAttivi)} movimenti (filtrati)`}
        {totaliFiltrati && (
          <>
            {" · "}
            <span className="entrata">
              +{euro(totaliFiltrati.entrate, true)}
            </span>{" "}
            <span className="uscita">−{euro(totaliFiltrati.uscite, true)}</span>
          </>
        )}
      </p>
      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={tutteSelezionate}
                  onChange={onToggleSelTutte}
                  title="Seleziona/deseleziona tutte le righe filtrate"
                />
              </th>
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
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibili.map((t) => (
              <tr
                key={t.id}
                className={
                  (t.trasferimento ? "riga-trasf " : "") +
                  (t.annullata ? "riga-annullata" : "")
                }
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selezione.has(t.id)}
                    onChange={() => onToggleSel(t.id)}
                  />
                </td>
                <td>{t.data}</td>
                <td title={t.causale} className="cella-causale">
                  {(t.causale ?? "").slice(0, 46) || (
                    <span className="muted">{t.tipologia}</span>
                  )}
                </td>
                <td className="num entrata cella-importo">
                  {t.entrate ? euro(t.entrate, true) : ""}
                </td>
                <td
                  className={
                    "num cella-importo " +
                    (t.trasferimento ? "muted" : "uscita")
                  }
                  title={t.trasferimento ? "Trasferimento (non è una spesa)" : ""}
                >
                  {t.uscite ? euro(t.uscite, true) : ""}
                </td>
                <td>
                  <select
                    value={t.categoria ?? ""}
                    disabled={t.trasferimento || t.annullata}
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
                    checked={!!t.trasferimento}
                    disabled={t.annullata}
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
                    disabled={t.annullata}
                    onChange={(e) =>
                      onModifica(t.id, { fattura: e.target.checked })
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!t.tasse}
                    disabled={t.annullata}
                    onChange={(e) =>
                      onModifica(t.id, { tasse: e.target.checked })
                    }
                  />
                </td>
                <td>
                  <input
                    className="cella-note"
                    placeholder="…"
                    value={t.note ?? ""}
                    onChange={(e) =>
                      onModifica(t.id, { note: e.target.value || undefined })
                    }
                  />
                </td>
                <td>
                  <button
                    className="secondario"
                    style={{ padding: "2px 8px" }}
                    onClick={() => onToggleAnnullata(t.id)}
                    title={
                      t.annullata
                        ? "Ripristina questo movimento"
                        : "Annulla: resta in elenco (barrato) ma sparisce dai calcoli"
                    }
                  >
                    {t.annullata ? "↩" : "✕"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {righe.length > LIMITE && (
        <p className="muted" style={{ marginTop: 8 }}>
          Mostrate {numero(LIMITE)} di {numero(righe.length)}. Usa i filtri per
          restringere.
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

  // I trasferimenti non sono spese e le voci annullate non esistono:
  // fuori dalla categorizzazione.
  const daFare = dati.transazioni.filter(
    (t) => t.uscite && !t.categoria && !t.trasferimento && !t.annullata,
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
