import type { MethodAdvice } from './api';

/** Native details/summary supplies keyboard operation without adding a modal or route. */
export function ScientificPanel({ advice }: { advice: MethodAdvice }) {
  const trust = advice.trust_assessment;
  return <details className="card pad col" style={{ minWidth: 0, overflowWrap: 'anywhere' }} aria-label="Scientific methods and limitations">
    <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Methods and limitations {trust ? `· ${trust.status.replaceAll('_', ' ')}` : ''}</summary>
    <div className="col small" style={{ gap: 10, marginTop: 12 }}>
      <span>Guidance for analysis {advice.analysis_id}. This status is not a probability that the result is correct.</span>
      {trust && <><b>Statistical verdict</b><span>{trust.statistical_evidence}</span>
        <span>Estimated direction: {trust.estimated_direction} · magnitude: {trust.magnitude ?? 'unavailable'} {trust.units} · decision basis: {trust.decision_basis}</span></>}
      {([['Applied methods', advice.applied_methods], ['Recommendations — not additional computations', advice.recommended_methods],
         ['Available, not applied here', advice.available_methods], ['Unsupported or requiring review', advice.unsupported_methods]] as const).map(([title, methods]) => <section key={title} aria-label={title}>
        <b>{title}</b>{methods.map((m) => <p key={`${m.method}-${m.rule_id}`}><strong>{m.method}</strong> ({m.status.replaceAll('_', ' ')}): {m.explanation}</p>)}
      </section>)}
      <section aria-label="Scientific assumptions"><b>Assumptions</b>{advice.assumptions.map((r) => <p key={r.rule_id}>{r.explanation}</p>)}</section>
      <section aria-label="Scientific limitations"><b>Limitations</b>{(trust?.limitations ?? advice.warnings).map((r, i) => <p key={`${r.rule_id}-${i}`}>{r.explanation}</p>)}</section>
      {trust?.missing_metadata.length ? <span>Missing metadata: {trust.missing_metadata.join(', ')}</span> : null}
      {trust?.cannot_conclude.map((text) => <span key={text}>{text}</span>)}
      <details><summary>Technical evidence references</summary>{advice.evidence_references.map((r) => <p key={r}>{r}</p>)}</details>
    </div>
  </details>;
}
