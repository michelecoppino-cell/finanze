import { useMemo } from "react";
import { useApp } from "../store/AppStore";
import { AnnoTasse } from "../types";
import { analizza } from "../engine/analisi";
import { euro, MESI } from "../util";
import { Info } from "../components/Info";

/** Totale tasse dichiarato per l'anno: importi reali se presenti, altrimenti stima da fatturato x aliquota. */
function stimaAnno(t: AnnoTasse): number {
  const totale = (t.inarcassa ?? 0) + (t.irpef ?? 0) + (t.aggiuntivi ?? 0);
  if (totale > 0) return totale;
  if (t.fatturato && t.tassazione) return t.fatturato * t.tassazione;
  return 0;
}

export function Tasse() {
  const { dati, aggiorna } = useApp();
  const righe = [...dati.tasse].sort((a, b) => a.anno - b.anno);

  // Confronto mensile: quanto è stato REALMENTE pagato (movimenti con flag
  // "tasse") mese per mese, per anno, contro il totale DICHIARATO nella
  // tabella sopra. Non torna mai esattamente: in Italia si paga a rate
  // (acconti/saldo/conguagli) che scavalcano l'anno fiscale di competenza,
  // quindi il confronto è solo un termometro per accorgersi di anomalie
  // grosse (spunte dimenticate, anni senza alcun pagamento tracciato).
  const analisi = useMemo(
    () => analizza(dati.transazioni, dati.categorie.map((c) => c.nome), dati.mutui ?? []),
    [dati.transazioni, dati.categorie, dati.mutui],
  );

  const confrontoAnni = useMemo(() => {
    const perAnno = new Map<number, number[]>();
    for (const r of analisi.mesi) {
      const anno = Number(r.mese.slice(0, 4));
      const mese = Number(r.mese.slice(5, 7)) - 1;
      if (!perAnno.has(anno)) perAnno.set(anno, Array(12).fill(0));
      perAnno.get(anno)![mese] = r.tasse;
    }
    // Include anche gli anni presenti solo nella tabella "Dati fiscali" (es.
    // un anno dichiarato ma senza alcun movimento importato).
    for (const t of righe) if (!perAnno.has(t.anno)) perAnno.set(t.anno, Array(12).fill(0));

    const dichiaratoPerAnno = new Map(righe.map((t) => [t.anno, stimaAnno(t)]));

    return [...perAnno.keys()].sort((a, b) => a - b).map((anno) => {
      const mesi = perAnno.get(anno)!;
      const pagato = mesi.reduce((s, v) => s + v, 0);
      const dichiarato = dichiaratoPerAnno.get(anno) ?? 0;
      return { anno, mesi, pagato, dichiarato, differenza: pagato - dichiarato };
    });
  }, [analisi.mesi, righe]);

  function modifica(anno: number, patch: Partial<AnnoTasse>) {
    aggiorna((d) => ({
      ...d,
      tasse: d.tasse.map((t) => (t.anno === anno ? { ...t, ...patch } : t)),
    }));
  }

  function aggiungiAnno() {
    const nuovo =
      righe.length > 0 ? Math.max(...righe.map((r) => r.anno)) + 1 : new Date().getFullYear();
    aggiorna((d) => ({ ...d, tasse: [...d.tasse, { anno: nuovo }] }));
  }

  function elimina(anno: number) {
    aggiorna((d) => ({ ...d, tasse: d.tasse.filter((t) => t.anno !== anno) }));
  }

  const numOr = (v: number | undefined) => (v === undefined ? "" : v);

  // Accantonamento consigliato: dall'anno piu' recente con dati.
  const ultimo = righe
    .map((t) => ({ anno: t.anno, tot: stimaAnno(t), fatturato: t.fatturato }))
    .filter((x) => x.tot > 0)
    .pop();
  const aliquotaEff =
    ultimo && ultimo.fatturato ? ultimo.tot / ultimo.fatturato : undefined;

  return (
    <>
      {ultimo && (
        <div className="stat-griglia">
          <div className="stat">
            <div className="etichetta">
              Accantona ogni mese
              <Info>
                Totale tasse dell'anno più recente con dati ({ultimo.anno})
                diviso 12 mesi.
                <br />
                {euro(ultimo.tot, true)} / 12 = <b>{euro(ultimo.tot / 12, true)}</b>
                <br />
                Il totale è Inarcassa + IRPEF + aggiuntivi, oppure fatturato ×
                aliquota se i valori reali mancano.
              </Info>
            </div>
            <div className="valore">{euro(ultimo.tot / 12)}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              per coprire le tasse (base {ultimo.anno})
            </div>
          </div>
          <div className="stat">
            <div className="etichetta">
              Aliquota effettiva
              <Info>
                Totale tasse {ultimo.anno} diviso il fatturato dello stesso
                anno.
                <br />
                {euro(ultimo.tot, true)} / {euro(ultimo.fatturato, true)} ={" "}
                <b>
                  {aliquotaEff !== undefined
                    ? (aliquotaEff * 100).toFixed(1) + "%"
                    : "—"}
                </b>
              </Info>
            </div>
            <div className="valore">
              {aliquotaEff !== undefined
                ? (aliquotaEff * 100).toFixed(1) + "%"
                : "—"}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              tasse / fatturato {ultimo.anno}
            </div>
          </div>
          <div className="stat">
            <div className="etichetta">
              Accantona per ogni €
              <Info>
                È l'aliquota effettiva espressa in centesimi: per ogni euro
                fatturato, quanti centesimi mettere da parte per le tasse.
              </Info>
            </div>
            <div className="valore">
              {aliquotaEff !== undefined
                ? (aliquotaEff * 100).toFixed(0) + " cent"
                : "—"}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              su ogni € fatturato
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Dati fiscali per anno</h3>
        <p className="muted" style={{ marginTop: -4 }}>
          Forfettario + Inarcassa. Il totale annuo viene spalmato
          giorno-per-giorno per correggere il saldo (colonne "netto tasse" e
          "potere d'acquisto" della pagina Saldo). Puoi lasciare i valori reali
          (Inarcassa + IRPEF) oppure la stima da fatturato × aliquota.
          Se per un anno non hai le transazioni/pagamenti reali (es. anni
          ricostruiti), spunta <b>"Escludi dal saldo"</b>: altrimenti le tasse
          maturate di quell'anno vengono sottratte per sempre senza che nessun
          pagamento le compensi.
        </p>
      </div>

      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Anno</th>
              <th className="num">Inarcassa €</th>
              <th className="num">IRPEF €</th>
              <th className="num">Aggiuntivi €</th>
              <th className="num">Fatturato €</th>
              <th className="num">Aliquota</th>
              <th className="num">Totale tasse</th>
              <th className="num">Al giorno</th>
              <th>
                Escludi dal saldo
                <Info>
                  Se spuntato, questo anno non viene sottratto nel calcolo del
                  saldo reale (pagina Saldo). Utile per anni ricostruiti senza
                  le vere transazioni/pagamenti tasse: altrimenti l'importo
                  maturato resta un buco mai compensato da un pagamento reale.
                </Info>
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {righe.map((t) => {
              const stima = stimaAnno(t);
              return (
                <tr key={t.anno}>
                  <td>
                    <b>{t.anno}</b>
                  </td>
                  <CellaNum
                    valore={t.inarcassa}
                    onSet={(v) => modifica(t.anno, { inarcassa: v })}
                  />
                  <CellaNum
                    valore={t.irpef}
                    onSet={(v) => modifica(t.anno, { irpef: v })}
                  />
                  <CellaNum
                    valore={t.aggiuntivi}
                    onSet={(v) => modifica(t.anno, { aggiuntivi: v })}
                  />
                  <CellaNum
                    valore={t.fatturato}
                    onSet={(v) => modifica(t.anno, { fatturato: v })}
                  />
                  <td className="num">
                    <input
                      type="number"
                      step="0.001"
                      style={{ width: 70 }}
                      value={numOr(t.tassazione)}
                      onChange={(e) =>
                        modifica(t.anno, {
                          tassazione:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td className="num">
                    <b>{euro(stima, true)}</b>
                  </td>
                  <td className="num">{euro(stima / 365, true)}</td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={t.escludiDalSaldo ?? false}
                      onChange={(e) =>
                        modifica(t.anno, { escludiDalSaldo: e.target.checked || undefined })
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="secondario"
                      style={{ padding: "2px 8px" }}
                      onClick={() => elimina(t.anno)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12 }}>
        <button className="secondario" onClick={aggiungiAnno}>
          + Aggiungi anno
        </button>
      </div>

      {confrontoAnni.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3>
            Pagato vs dichiarato, mese per mese
            <Info>
              Colonne Gen–Dic: somma dei movimenti con flag <b>Tasse</b> di
              quel mese (dalla pagina Movimenti). "Dichiarato" è il totale
              della riga corrispondente nella tabella sopra.
              <br />
              <br />
              Non aspettarti che tornino esatti anno per anno: in Italia si
              paga a rate (acconti a giugno/novembre, saldo dell'anno
              precedente, conguagli Inarcassa) che scavalcano l'anno fiscale
              di competenza. Usalo per accorgerti di anomalie grosse — un
              anno senza nessun pagamento tracciato, o un importo dichiarato
              molto più alto del pagato su più anni di fila — non come un
              controllo esatto.
            </Info>
          </h3>
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Anno</th>
                  {MESI.map((m) => (
                    <th key={m} className="num">
                      {m}
                    </th>
                  ))}
                  <th className="num">Pagato</th>
                  <th className="num">Dichiarato</th>
                  <th className="num">Differenza</th>
                </tr>
              </thead>
              <tbody>
                {confrontoAnni.map((r) => (
                  <tr key={r.anno}>
                    <td>
                      <b>{r.anno}</b>
                    </td>
                    {r.mesi.map((v, i) => (
                      <td key={i} className="num">
                        {v ? euro(v) : ""}
                      </td>
                    ))}
                    <td className="num">
                      <b>{euro(r.pagato, true)}</b>
                    </td>
                    <td className="num">{euro(r.dichiarato, true)}</td>
                    <td className="num">
                      {r.dichiarato > 0 ? euro(r.differenza, true) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function CellaNum({
  valore,
  onSet,
}: {
  valore: number | undefined;
  onSet: (v: number | undefined) => void;
}) {
  return (
    <td className="num">
      <input
        type="number"
        step="0.01"
        style={{ width: 90 }}
        value={valore === undefined ? "" : valore}
        onChange={(e) =>
          onSet(e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
    </td>
  );
}
