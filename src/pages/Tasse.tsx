import { useMemo } from "react";
import { useApp } from "../store/AppStore";
import { AllocazioneTasse, AnnoTasse, Transazione } from "../types";
import { euro } from "../util";
import { Info } from "../components/Info";
import { Pannello } from "../components/Pannello";

/** Totale tasse dichiarato per l'anno: importi reali se presenti, altrimenti stima da fatturato x aliquota. */
function stimaAnno(t: AnnoTasse): number {
  const totale = (t.inarcassa ?? 0) + (t.irpef ?? 0) + (t.aggiuntivi ?? 0);
  if (totale > 0) return totale;
  if (t.fatturato && t.tassazione) return t.fatturato * t.tassazione;
  return 0;
}

/** Allocazione di un movimento tasse: se non ancora compilata, una riga sola
 * sull'anno della data del movimento, con importi da compilare. */
function allocazioneDi(t: Transazione): AllocazioneTasse[] {
  return t.allocazioneTasse && t.allocazioneTasse.length > 0
    ? t.allocazioneTasse
    : [{ anno: Number(t.data.slice(0, 4)) }];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function annoBisestile(anno: number): boolean {
  return (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0;
}

function giorniAnno(anno: number): number {
  return annoBisestile(anno) ? 366 : 365;
}

/** Numero del giorno nell'anno (1 = 1 gennaio). */
function giornoDelAnno(data: Date): number {
  const inizio = new Date(data.getFullYear(), 0, 1);
  return Math.floor((data.getTime() - inizio.getTime()) / 86400000) + 1;
}

/** Quota dell'anno effettivamente trascorsa a oggi: 1 per gli anni passati,
 * 0 per quelli futuri, giorni-trascorsi/giorni-anno per l'anno in corso. */
function frazioneTrascorsa(anno: number, oggi: Date): number {
  const annoOggi = oggi.getFullYear();
  if (anno < annoOggi) return 1;
  if (anno > annoOggi) return 0;
  return Math.min(1, giornoDelAnno(oggi) / giorniAnno(anno));
}

export function Tasse() {
  const { dati, aggiorna } = useApp();
  const righe = [...dati.tasse].sort((a, b) => a.anno - b.anno);

  // ---------- Verifica pagamenti: allocazione dei movimenti "tasse" ----------
  // Ogni movimento con flag "tasse" (pagina Movimenti) puo' essere ripartito
  // tra Inarcassa/Imposta e imputato a uno o due anni: un versamento spesso
  // copre il saldo dell'anno precedente + l'acconto di quello in corso. Dalla
  // ripartizione si ricava il "pagato" reale da confrontare con i valori
  // dichiarati nella tabella "Dati fiscali per anno".

  function modificaTransazione(id: string, patch: Partial<Transazione>) {
    aggiorna((d) => ({
      ...d,
      transazioni: d.transazioni.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  function aggiornaRigaAlloc(t: Transazione, idx: number, patch: Partial<AllocazioneTasse>) {
    const attuale = allocazioneDi(t);
    modificaTransazione(t.id, {
      allocazioneTasse: attuale.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    });
  }

  function aggiungiRigaAlloc(t: Transazione) {
    const attuale = allocazioneDi(t);
    modificaTransazione(t.id, {
      allocazioneTasse: [...attuale, { anno: attuale[attuale.length - 1].anno + 1 }],
    });
  }

  function rimuoviRigaAlloc(t: Transazione, idx: number) {
    const attuale = allocazioneDi(t);
    if (attuale.length <= 1) return;
    modificaTransazione(t.id, { allocazioneTasse: attuale.filter((_, i) => i !== idx) });
  }

  const movimentiTasse = useMemo(
    () =>
      dati.transazioni
        .filter((t) => t.tasse && !t.annullata)
        .sort((a, b) => a.data.localeCompare(b.data)),
    [dati.transazioni],
  );

  const pagatoPerAnno = useMemo(() => {
    const m = new Map<number, { inarcassa: number; imposta: number }>();
    for (const t of movimentiTasse) {
      for (const a of allocazioneDi(t)) {
        if (!a.anno) continue;
        const riga = m.get(a.anno) ?? { inarcassa: 0, imposta: 0 };
        riga.inarcassa += a.inarcassa ?? 0;
        riga.imposta += a.imposta ?? 0;
        m.set(a.anno, riga);
      }
    }
    return m;
  }, [movimentiTasse]);

  const oggi = useMemo(() => new Date(), []);

  const confrontoAnni = useMemo(() => {
    const anni = new Set<number>([...righe.map((t) => t.anno), ...pagatoPerAnno.keys()]);
    return [...anni].sort((a, b) => a - b).map((anno) => {
      const dich = righe.find((t) => t.anno === anno);
      const previstoInarcassa = dich?.inarcassa ?? 0;
      const previstoImposta = dich?.irpef ?? 0;
      const pag = pagatoPerAnno.get(anno) ?? { inarcassa: 0, imposta: 0 };
      const previstoTotale = previstoInarcassa + previstoImposta;
      const pagatoTotale = pag.inarcassa + pag.imposta;
      // Per l'anno in corso le tasse maturano giorno per giorno: a oggi si
      // deve solo la quota-parte dei giorni gia' trascorsi, non l'intera stima annua.
      const frazione = frazioneTrascorsa(anno, oggi);
      const inarcassaChiuso = dich?.inarcassaChiuso ?? false;
      const impostaChiuso = dich?.impostaChiuso ?? false;
      // "Chiuso" congela il residuo a zero: l'anno e' considerato saldato a
      // prescindere da quanto darebbe il calcolo grezzo (dovuto - pagato).
      const daVersareInarcassa = inarcassaChiuso
        ? 0
        : previstoInarcassa * frazione - pag.inarcassa;
      const daVersareImposta = impostaChiuso
        ? 0
        : previstoImposta * frazione - pag.imposta;
      return {
        anno,
        previstoInarcassa,
        pagatoInarcassa: pag.inarcassa,
        previstoImposta,
        pagatoImposta: pag.imposta,
        previstoTotale,
        pagatoTotale,
        frazione,
        inarcassaChiuso,
        impostaChiuso,
        daVersareInarcassa,
        daVersareImposta,
        daVersareTotale: daVersareInarcassa + daVersareImposta,
        note: dich?.note ?? "",
      };
    });
  }, [righe, pagatoPerAnno, oggi]);

  const totaliGenerali = useMemo(
    () =>
      confrontoAnni.reduce(
        (acc, r) => ({
          previstoInarcassa: acc.previstoInarcassa + r.previstoInarcassa,
          pagatoInarcassa: acc.pagatoInarcassa + r.pagatoInarcassa,
          previstoImposta: acc.previstoImposta + r.previstoImposta,
          pagatoImposta: acc.pagatoImposta + r.pagatoImposta,
          previstoTotale: acc.previstoTotale + r.previstoTotale,
          pagatoTotale: acc.pagatoTotale + r.pagatoTotale,
          daVersareInarcassa: acc.daVersareInarcassa + r.daVersareInarcassa,
          daVersareImposta: acc.daVersareImposta + r.daVersareImposta,
          daVersareTotale: acc.daVersareTotale + r.daVersareTotale,
        }),
        {
          previstoInarcassa: 0,
          pagatoInarcassa: 0,
          previstoImposta: 0,
          pagatoImposta: 0,
          previstoTotale: 0,
          pagatoTotale: 0,
          daVersareInarcassa: 0,
          daVersareImposta: 0,
          daVersareTotale: 0,
        },
      ),
    [confrontoAnni],
  );

  const daCompletare = movimentiTasse.filter((t) => {
    if (t.tasseCompletato) return false;
    const allocato = allocazioneDi(t).reduce(
      (s, a) => s + (a.inarcassa ?? 0) + (a.imposta ?? 0),
      0,
    );
    return Math.abs(round2(allocato - (t.uscite ?? 0))) > 0.01;
  }).length;

  function modifica(anno: number, patch: Partial<AnnoTasse>) {
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

      {movimentiTasse.length > 0 && (
        <Pannello
          titolo="Verifica pagamenti"
          extra={
            daCompletare > 0 ? (
              <span className="chip">{daCompletare} da completare</span>
            ) : undefined
          }
        >
          <p className="muted" style={{ marginTop: 0 }}>
            Tutti i movimenti con la spunta <b>Tasse</b> (pagina Movimenti).
            Per ognuno indica quanto va a <b>Inarcassa</b> e quanto a{" "}
            <b>Imposta</b> (IRPEF/imposta sostitutiva) e l'anno di competenza.
            Un versamento spesso copre il saldo dell'anno precedente +
            l'acconto di quello in corso: usa <b>"+ anno"</b> per dividerlo
            su due (o più) anni. Quando una riga è a posto, spunta{" "}
            <b>Completato</b>: non è più modificabile per sbaglio e un
            eventuale residuo non allocato (es. un extra richiesto dal
            circuito di pagamento) non conta più come errore.
            <br />
            <br />I totali "Pagato" della tabella sotto si costruiscono da
            questa ripartizione e si confrontano con "Inarcassa €" e "IRPEF €"
            dichiarati nella tabella in cima alla pagina.
          </p>
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Causale</th>
                  <th className="num">Importo</th>
                  <th className="num">Anno</th>
                  <th className="num">Inarcassa €</th>
                  <th className="num">Imposta €</th>
                  <th className="num">
                    Da allocare
                    <Info>
                      Parte dell'importo del movimento non ancora assegnata a
                      Inarcassa o Imposta. Quando torna a zero, il movimento è
                      completamente ripartito.
                    </Info>
                  </th>
                  <th style={{ textAlign: "center" }}>
                    Completato
                    <Info>
                      Blocca la riga (non più modificabile per sbaglio) ed
                      esclude il movimento dal conteggio "da completare",
                      anche se resta un residuo non allocato.
                    </Info>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {movimentiTasse.flatMap((t) => {
                  const alloc = allocazioneDi(t);
                  const allocato = alloc.reduce(
                    (s, a) => s + (a.inarcassa ?? 0) + (a.imposta ?? 0),
                    0,
                  );
                  const residuo = round2((t.uscite ?? 0) - allocato);
                  const completato = t.tasseCompletato ?? false;
                  return alloc.map((a, i) => (
                    <tr key={t.id + "-" + i}>
                      {i === 0 && (
                        <>
                          <td rowSpan={alloc.length}>{t.data}</td>
                          <td
                            rowSpan={alloc.length}
                            title={t.causale}
                            className="cella-causale"
                          >
                            {(t.causale ?? "").slice(0, 46) || (
                              <span className="muted">{t.tipologia}</span>
                            )}
                          </td>
                          <td rowSpan={alloc.length} className="num">
                            {euro(t.uscite, true)}
                          </td>
                        </>
                      )}
                      <td className="num">
                        <input
                          type="number"
                          style={{ width: 68 }}
                          value={a.anno}
                          disabled={completato}
                          onChange={(e) =>
                            aggiornaRigaAlloc(t, i, {
                              anno: Number(e.target.value) || a.anno,
                            })
                          }
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          step="0.01"
                          style={{ width: 90 }}
                          value={a.inarcassa ?? ""}
                          disabled={completato}
                          onChange={(e) =>
                            aggiornaRigaAlloc(t, i, {
                              inarcassa:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          step="0.01"
                          style={{ width: 90 }}
                          value={a.imposta ?? ""}
                          disabled={completato}
                          onChange={(e) =>
                            aggiornaRigaAlloc(t, i, {
                              imposta:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      {i === 0 && (
                        <td rowSpan={alloc.length} className="num">
                          {completato || Math.abs(residuo) <= 0.01 ? (
                            "✓"
                          ) : (
                            <span className="muted">{euro(residuo, true)}</span>
                          )}
                        </td>
                      )}
                      {i === 0 && (
                        <td rowSpan={alloc.length} style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={completato}
                            onChange={(e) =>
                              modificaTransazione(t.id, {
                                tasseCompletato: e.target.checked || undefined,
                              })
                            }
                          />
                        </td>
                      )}
                      <td>
                        <span className="riga-azioni" style={{ gap: 4 }}>
                          {alloc.length > 1 && (
                            <button
                              className="secondario"
                              style={{ padding: "2px 6px" }}
                              disabled={completato}
                              onClick={() => rimuoviRigaAlloc(t, i)}
                            >
                              ✕
                            </button>
                          )}
                          {i === alloc.length - 1 && (
                            <button
                              className="secondario"
                              style={{ padding: "2px 6px" }}
                              title="Dividi questo pagamento su un altro anno"
                              disabled={completato}
                              onClick={() => aggiungiRigaAlloc(t)}
                            >
                              + anno
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </Pannello>
      )}

      {confrontoAnni.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Previsto vs pagato, per anno</h3>

          <div className="stat-griglia">
            <div className="stat" style={{ borderColor: "var(--uscita)" }}>
              <div className="etichetta">
                Manca da pagare a oggi
                <Info>
                  Somma, su tutti gli anni, del "Da versare" di Inarcassa e
                  Imposta. Per gli anni passati si conta l'intero importo
                  dichiarato; per l'anno in corso ({oggi.getFullYear()}) solo
                  la quota-parte dei giorni già trascorsi (
                  {Math.round(
                    (confrontoAnni.find((r) => r.anno === oggi.getFullYear())
                      ?.frazione ?? 0) * 100,
                  )}
                  % dell'anno). Gli anni segnati come "Chiuso" non vengono
                  conteggiati.
                  <br />
                  <br />
                  Inarcassa: {euro(totaliGenerali.daVersareInarcassa, true)}
                  <br />
                  Imposta: {euro(totaliGenerali.daVersareImposta, true)}
                </Info>
              </div>
              <div
                className="valore"
                style={{
                  color:
                    totaliGenerali.daVersareTotale > 0.01
                      ? "var(--uscita)"
                      : "var(--entrata)",
                }}
              >
                {euro(Math.max(0, totaliGenerali.daVersareTotale), true)}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {totaliGenerali.daVersareTotale > 0.01
                  ? "ancora da versare, considerando i giorni trascorsi"
                  : "in regola (o in credito) a oggi"}
              </div>
            </div>
          </div>

          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th rowSpan={2}>Anno</th>
                  <th colSpan={4} style={{ textAlign: "center" }}>
                    Inarcassa
                  </th>
                  <th colSpan={4} style={{ textAlign: "center" }}>
                    Imposta
                  </th>
                  <th colSpan={3} style={{ textAlign: "center" }}>
                    Totale
                  </th>
                  <th rowSpan={2}>Note</th>
                </tr>
                <tr>
                  <th className="num">Previsto</th>
                  <th className="num">Pagato</th>
                  <th className="num">Da versare</th>
                  <th style={{ textAlign: "center" }}>Chiuso</th>
                  <th className="num">Previsto</th>
                  <th className="num">Pagato</th>
                  <th className="num">Da versare</th>
                  <th style={{ textAlign: "center" }}>Chiuso</th>
                  <th className="num">Previsto</th>
                  <th className="num">Pagato</th>
                  <th className="num">
                    Da versare
                    <Info>
                      Quota maturata a oggi meno il pagato: intera per gli
                      anni passati, proporzionale ai giorni trascorsi per
                      l'anno in corso. Se "Chiuso" è spuntato (Inarcassa e/o
                      Imposta), quella parte non viene più conteggiata.
                    </Info>
                  </th>
                </tr>
              </thead>
              <tbody>
                {confrontoAnni.map((r) => (
                  <tr key={r.anno}>
                    <td>
                      <b>{r.anno}</b>
                      {r.anno === oggi.getFullYear() && (
                        <span className="muted" style={{ fontSize: 11 }}>
                          {" "}
                          ({Math.round(r.frazione * 100)}% anno)
                        </span>
                      )}
                    </td>
                    <td className="num">{euro(r.previstoInarcassa, true)}</td>
                    <td className="num">{euro(r.pagatoInarcassa, true)}</td>
                    <td
                      className="num"
                      style={{
                        color:
                          r.daVersareInarcassa > 0.01
                            ? "var(--uscita)"
                            : "var(--entrata)",
                      }}
                    >
                      {euro(r.daVersareInarcassa, true)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={r.inarcassaChiuso}
                        onChange={(e) =>
                          modifica(r.anno, {
                            inarcassaChiuso: e.target.checked || undefined,
                          })
                        }
                      />
                    </td>
                    <td className="num">{euro(r.previstoImposta, true)}</td>
                    <td className="num">{euro(r.pagatoImposta, true)}</td>
                    <td
                      className="num"
                      style={{
                        color:
                          r.daVersareImposta > 0.01
                            ? "var(--uscita)"
                            : "var(--entrata)",
                      }}
                    >
                      {euro(r.daVersareImposta, true)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={r.impostaChiuso}
                        onChange={(e) =>
                          modifica(r.anno, {
                            impostaChiuso: e.target.checked || undefined,
                          })
                        }
                      />
                    </td>
                    <td className="num">
                      <b>{euro(r.previstoTotale, true)}</b>
                    </td>
                    <td className="num">
                      <b>{euro(r.pagatoTotale, true)}</b>
                    </td>
                    <td
                      className="num"
                      style={{
                        color:
                          r.daVersareTotale > 0.01
                            ? "var(--uscita)"
                            : "var(--entrata)",
                      }}
                    >
                      <b>{euro(r.daVersareTotale, true)}</b>
                    </td>
                    <td>
                      <input
                        type="text"
                        style={{ width: 140 }}
                        value={r.note}
                        onChange={(e) =>
                          modifica(r.anno, { note: e.target.value || undefined })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Totale</th>
                  <th className="num">{euro(totaliGenerali.previstoInarcassa, true)}</th>
                  <th className="num">{euro(totaliGenerali.pagatoInarcassa, true)}</th>
                  <th
                    className="num"
                    style={{
                      color:
                        totaliGenerali.daVersareInarcassa > 0.01
                          ? "var(--uscita)"
                          : "var(--entrata)",
                    }}
                  >
                    {euro(totaliGenerali.daVersareInarcassa, true)}
                  </th>
                  <th></th>
                  <th className="num">{euro(totaliGenerali.previstoImposta, true)}</th>
                  <th className="num">{euro(totaliGenerali.pagatoImposta, true)}</th>
                  <th
                    className="num"
                    style={{
                      color:
                        totaliGenerali.daVersareImposta > 0.01
                          ? "var(--uscita)"
                          : "var(--entrata)",
                    }}
                  >
                    {euro(totaliGenerali.daVersareImposta, true)}
                  </th>
                  <th></th>
                  <th className="num">{euro(totaliGenerali.previstoTotale, true)}</th>
                  <th className="num">{euro(totaliGenerali.pagatoTotale, true)}</th>
                  <th
                    className="num"
                    style={{
                      color:
                        totaliGenerali.daVersareTotale > 0.01
                          ? "var(--uscita)"
                          : "var(--entrata)",
                    }}
                  >
                    {euro(totaliGenerali.daVersareTotale, true)}
                  </th>
                  <th></th>
                </tr>
              </tfoot>
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
