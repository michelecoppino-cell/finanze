// Scheda Fatture: elenco delle fatture emesse (o stimate) per anno, con il
// calcolo fiscale del regime forfettario + Inarcassa. È la fonte da cui la
// scheda "Tasse" eredita fatturato, Inarcassa e imposta di ogni anno: qui si
// inseriscono le fatture, lì (e in Saldo/Proiezione) i numeri vengono riusati.

import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "../store/AppStore";
import { AnnoTasse, Fattura } from "../types";
import {
  calcolaAnno,
  anniConFatture,
  nettoFattura,
  bolloFattura,
  integrativoFattura,
  totaleFattura,
  MATERNITA_DEFAULT,
} from "../engine/fatture";
import { euro, uid } from "../util";
import { Info } from "../components/Info";
import { Pannello } from "../components/Pannello";

export function Fatture() {
  const { dati, aggiorna } = useApp();
  const fatture = useMemo(() => dati.fatture ?? [], [dati.fatture]);
  const anni = useMemo(() => anniConFatture(fatture), [fatture]);

  // Config fiscale dell'anno (regime ridotto + maternità) presa da AnnoTasse.
  const cfgAnno = (anno: number): AnnoTasse | undefined =>
    dati.tasse.find((t) => t.anno === anno);

  const calcoli = useMemo(
    () =>
      anni.map((anno) => {
        const c = cfgAnno(anno);
        return calcolaAnno(anno, fatture, {
          ridotta: c?.inarcassaRidotta,
          maternita: c?.maternita,
        });
      }),
    [anni, fatture, dati.tasse],
  );

  // ---------- Mutazioni ----------
  function modificaFattura(id: string, patch: Partial<Fattura>) {
    aggiorna((d) => ({
      ...d,
      fatture: (d.fatture ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }

  function eliminaFattura(id: string) {
    aggiorna((d) => ({ ...d, fatture: (d.fatture ?? []).filter((f) => f.id !== id) }));
  }

  function aggiungiFattura(anno: number) {
    // Numerazione: prosegue dal numero più alto dell'anno, se numerico.
    const dellAnno = fatture.filter((f) => f.anno === anno);
    const maxNum = dellAnno.reduce((m, f) => {
      const n = Number(f.numero);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    const nuova: Fattura = {
      id: uid(),
      anno,
      numero: String(maxNum + 1),
      dataEmissione: `${anno}-01-31`,
      netto: 0,
    };
    aggiorna((d) => ({ ...d, fatture: [...(d.fatture ?? []), nuova] }));
  }

  function aggiungiAnno() {
    const nuovo = anni.length ? Math.max(...anni) + 1 : new Date().getFullYear();
    aggiungiFattura(nuovo);
  }

  function modificaConfigAnno(anno: number, patch: Partial<AnnoTasse>) {
    aggiorna((d) => {
      const esiste = d.tasse.some((t) => t.anno === anno);
      return {
        ...d,
        tasse: esiste
          ? d.tasse.map((t) => (t.anno === anno ? { ...t, ...patch } : t))
          : [...d.tasse, { anno, ...patch }],
      };
    });
  }

  const numOr = (v: number | undefined) => (v === undefined ? "" : v);

  if (fatture.length === 0) {
    return (
      <div className="card">
        <h3>Fatture</h3>
        <p className="muted">
          Registra qui le tue fatture (regime forfettario). Da questi dati
          vengono calcolati fatturato, Inarcassa e imposta sostitutiva di ogni
          anno, che la scheda <b>Tasse</b> eredita automaticamente. Puoi marcare
          ogni fattura come <b>reale</b> (emessa) o <b>stimata</b> (previsionale)
          per proiettare l'anno in corso.
        </p>
        <button className="primario" onClick={aggiungiAnno}>
          + Aggiungi la prima fattura
        </button>
      </div>
    );
  }

  return (
    <>
      {/* -------- Analisi complessiva -------- */}
      <div className="card">
        <h3>Analisi complessiva</h3>
        <p className="muted" style={{ marginTop: -4 }}>
          Riepilogo del lavoro anno per anno: fatturato, tasse e — soprattutto —
          quanto resta netto al mese. Il netto mensile è il netto totale
          dell'anno diviso 12 (o 13, per confronto con un dipendente).
        </p>
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Anno</th>
                <th className="num">Fatturato</th>
                <th className="num">
                  di cui stimato
                  <Info>
                    Parte del fatturato che arriva da fatture marcate come
                    "stimata" (non ancora realmente emesse). Il resto è già
                    fatturato davvero.
                  </Info>
                </th>
                <th className="num">Imponibile</th>
                <th className="num">Inarcassa</th>
                <th className="num">Imposta</th>
                <th className="num">Netto totale</th>
                <th className="num">
                  Aliq. media
                  <Info>
                    (imposta + contributo soggettivo + maternità) / fatturato.
                    Il contributo integrativo 4% non è incluso perché viene
                    riaddebitato al cliente, non è una tua tassa.
                  </Info>
                </th>
                <th className="num">Netto/mese 12</th>
                <th className="num">Netto/mese 13</th>
              </tr>
            </thead>
            <tbody>
              {[...calcoli]
                .sort((a, b) => a.anno - b.anno)
                .map((c) => (
                  <tr key={c.anno}>
                    <td>
                      <b>{c.anno}</b>
                    </td>
                    <td className="num">{euro(c.fatturato, true)}</td>
                    <td className="num">
                      {c.fatturatoStimato > 0 ? (
                        <span className="muted">{euro(c.fatturatoStimato, true)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">{euro(c.imponibile, true)}</td>
                    <td className="num">{euro(c.inarcassa, true)}</td>
                    <td className="num">{euro(c.imposta, true)}</td>
                    <td className="num">
                      <b>{euro(c.nettoTotale, true)}</b>
                    </td>
                    <td className="num">{(c.aliquotaMedia * 100).toFixed(1)}%</td>
                    <td className="num">{euro(c.nettoMensile12)}</td>
                    <td className="num">{euro(c.nettoMensile13)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------- Sezioni per anno (dalla più recente) -------- */}
      {anni.map((anno) => {
        const c = calcoli.find((x) => x.anno === anno)!;
        const cfg = cfgAnno(anno);
        const dellAnno = fatture
          .filter((f) => f.anno === anno)
          .sort((a, b) => b.dataEmissione.localeCompare(a.dataEmissione));
        return (
          <Pannello
            key={anno}
            titolo={`Anno ${anno}`}
            apertoDefault={anno === anni[0]}
            extra={
              <span className="muted" style={{ fontSize: 13 }}>
                {euro(c.fatturato)} · netto {euro(c.nettoMensile12)}/mese
              </span>
            }
          >
            {/* Config fiscale dell'anno */}
            <div className="form-griglia" style={{ marginBottom: 12 }}>
              <label className="campo" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={cfg?.inarcassaRidotta ?? false}
                  onChange={(e) =>
                    modificaConfigAnno(anno, {
                      inarcassaRidotta: e.target.checked || undefined,
                    })
                  }
                />
                Inarcassa ridotta (soggettivo 7,25%)
                <Info>
                  Se attivo il contributo soggettivo è al 7,25% invece del
                  14,5%. Tipico dei primi anni di attività o sotto soglia.
                </Info>
              </label>
              <label className="campo">
                Contributo maternità €
                <input
                  type="number"
                  step="1"
                  style={{ width: 120 }}
                  placeholder={String(MATERNITA_DEFAULT)}
                  value={numOr(cfg?.maternita)}
                  onChange={(e) =>
                    modificaConfigAnno(anno, {
                      maternita:
                        e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>

            {/* Elenco fatture */}
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nr</th>
                    <th>Tipo</th>
                    <th>Data</th>
                    <th>Destinatario</th>
                    <th className="num">Netto €</th>
                    <th className="num">Bollo €</th>
                    <th className="num">
                      Integr. 4%
                      <Info>
                        Contributo integrativo Inarcassa: 4% su (netto + bollo),
                        addebitato al cliente. Zero per le fatture estero.
                      </Info>
                    </th>
                    <th className="num">Totale €</th>
                    <th style={{ textAlign: "center" }}>Estero</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dellAnno.map((f) => (
                    <RigaFattura
                      key={f.id}
                      f={f}
                      onSet={(patch) => modificaFattura(f.id, patch)}
                      onElimina={() => eliminaFattura(f.id)}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={4}>Totale fatturato</th>
                    <th className="num">{euro(c.fatturato, true)}</th>
                    <th className="num">{euro(c.bolli, true)}</th>
                    <th className="num">{euro(c.integrativoGrezzo, true)}</th>
                    <th className="num">{euro(c.incassato, true)}</th>
                    <th colSpan={2}></th>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={{ marginTop: 10 }}>
              <button className="secondario" onClick={() => aggiungiFattura(anno)}>
                + Aggiungi fattura {anno}
              </button>
            </div>

            {/* Quadro fiscale dell'anno */}
            <div className="stat-griglia" style={{ marginTop: 16 }}>
              <VoceCalcolo
                etichetta="Imponibile"
                valore={c.imponibile}
                info={
                  <>
                    Coefficiente ATECO 78% × volume d'affari (fatturato + bolli).
                    <br />
                    0,78 × {euro(c.volumeAffari, true)} = <b>{euro(c.imponibile, true)}</b>
                  </>
                }
              />
              <VoceCalcolo
                etichetta="Inarcassa totale"
                valore={c.inarcassa}
                info={
                  <>
                    Soggettivo {euro(c.soggettivo, true)} + integrativo{" "}
                    {euro(c.integrativo, true)} + maternità {euro(c.maternita, true)}.
                    {c.ridotta && <> Regime ridotto (7,25%).</>}
                  </>
                }
              />
              <VoceCalcolo
                etichetta="Imposta sostitutiva"
                valore={c.imposta}
                info={
                  <>
                    15% × (imponibile − Inarcassa).
                    <br />
                    0,15 × ({euro(c.imponibile, true)} − {euro(c.inarcassa, true)}) ={" "}
                    <b>{euro(c.imposta, true)}</b>
                  </>
                }
              />
              <VoceCalcolo
                etichetta="Netto in tasca"
                valore={c.nettoTotale}
                forte
                info={
                  <>
                    Totale incassato − imposta − Inarcassa.
                    <br />
                    {euro(c.incassato, true)} − {euro(c.imposta, true)} −{" "}
                    {euro(c.inarcassa, true)} = <b>{euro(c.nettoTotale, true)}</b>
                  </>
                }
              />
            </div>
          </Pannello>
        );
      })}

      <div style={{ marginTop: 12 }}>
        <button className="secondario" onClick={aggiungiAnno}>
          + Aggiungi anno
        </button>
      </div>
    </>
  );
}

/** Una voce del quadro fiscale (riquadro con etichetta, valore e spiegazione). */
function VoceCalcolo({
  etichetta,
  valore,
  info,
  forte,
}: {
  etichetta: string;
  valore: number;
  info: ReactNode;
  forte?: boolean;
}) {
  return (
    <div className="stat">
      <div className="etichetta">
        {etichetta}
        <Info>{info}</Info>
      </div>
      <div className="valore" style={forte ? { color: "var(--entrata)" } : undefined}>
        {euro(valore, true)}
      </div>
    </div>
  );
}

/** Riga editabile di una fattura; espande i campi "giornate" se attivi. */
function RigaFattura({
  f,
  onSet,
  onElimina,
}: {
  f: Fattura;
  onSet: (patch: Partial<Fattura>) => void;
  onElimina: () => void;
}) {
  const [espanso, setEspanso] = useState(false);
  const netto = nettoFattura(f);
  const bollo = bolloFattura(f);
  const integr = integrativoFattura(f);
  const tot = totaleFattura(f);

  return (
    <>
      <tr>
        <td>
          <input
            type="text"
            style={{ width: 48 }}
            value={f.numero ?? ""}
            onChange={(e) => onSet({ numero: e.target.value || undefined })}
          />
        </td>
        <td>
          <button
            className="secondario"
            style={{ padding: "2px 8px", whiteSpace: "nowrap" }}
            title="Fattura realmente emessa o solo stimata"
            onClick={() => onSet({ stimata: f.stimata ? undefined : true })}
          >
            {f.stimata ? "Stimata" : "Reale"}
          </button>
        </td>
        <td>
          <input
            type="date"
            value={f.dataEmissione}
            onChange={(e) => onSet({ dataEmissione: e.target.value })}
          />
        </td>
        <td>
          <input
            type="text"
            style={{ width: 120 }}
            value={f.destinatario ?? ""}
            onChange={(e) => onSet({ destinatario: e.target.value || undefined })}
          />
        </td>
        <td className="num">
          {f.daGiornate ? (
            <span title="Calcolato dalle giornate" style={{ whiteSpace: "nowrap" }}>
              <b>{euro(netto, true)}</b>
            </span>
          ) : (
            <input
              type="number"
              step="0.01"
              style={{ width: 90 }}
              value={f.netto ?? ""}
              onChange={(e) =>
                onSet({ netto: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          )}
          <button
            className="secondario"
            style={{ padding: "1px 6px", marginLeft: 4, fontSize: 11 }}
            title="Calcola il netto dalle giornate lavorate"
            onClick={() => {
              const attivo = !f.daGiornate;
              onSet({ daGiornate: attivo || undefined });
              setEspanso(attivo);
            }}
          >
            gg
          </button>
        </td>
        <td className="num">
          <input
            type="number"
            step="0.01"
            style={{ width: 60 }}
            placeholder={String(bollo)}
            value={f.bollo ?? ""}
            onChange={(e) =>
              onSet({ bollo: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </td>
        <td className="num muted">{euro(integr, true)}</td>
        <td className="num">
          <b>{euro(tot, true)}</b>
        </td>
        <td style={{ textAlign: "center" }}>
          <input
            type="checkbox"
            checked={!!f.estero}
            onChange={(e) => onSet({ estero: e.target.checked || undefined })}
          />
        </td>
        <td>
          <span className="riga-azioni" style={{ gap: 4 }}>
            {f.daGiornate && (
              <button
                className="secondario"
                style={{ padding: "2px 6px" }}
                title="Mostra/nascondi le giornate"
                onClick={() => setEspanso((v) => !v)}
              >
                {espanso ? "▾" : "▸"}
              </button>
            )}
            <button
              className="secondario"
              style={{ padding: "2px 6px" }}
              onClick={onElimina}
            >
              ✕
            </button>
          </span>
        </td>
      </tr>
      {f.daGiornate && espanso && (
        <tr>
          <td colSpan={10} style={{ background: "var(--bg-elev)" }}>
            <div className="form-griglia" style={{ padding: "4px 0" }}>
              <CampoGiorno etichetta="Giorni lavorativi" valore={f.giorni} onSet={(v) => onSet({ giorni: v })} />
              <CampoGiorno etichetta="Ferie / malattia" valore={f.ferie} onSet={(v) => onSet({ ferie: v })} />
              <CampoGiorno etichetta="Giorni extra" valore={f.extra} onSet={(v) => onSet({ extra: v })} />
              <CampoGiorno etichetta="Spostati dal mese prec." valore={f.spostati} onSet={(v) => onSet({ spostati: v })} />
              <CampoGiorno etichetta="Prezzo giornaliero €" valore={f.prezzoGiorno} onSet={(v) => onSet({ prezzoGiorno: v })} step="1" />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CampoGiorno({
  etichetta,
  valore,
  onSet,
  step = "0.5",
}: {
  etichetta: string;
  valore: number | undefined;
  onSet: (v: number | undefined) => void;
  step?: string;
}) {
  return (
    <label className="campo">
      {etichetta}
      <input
        type="number"
        step={step}
        style={{ width: 110 }}
        value={valore ?? ""}
        onChange={(e) => onSet(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </label>
  );
}
