import { semanticHash, exactObligationKey, renderAuthorizedJson } from './crown-closure.mjs';

// Optional Node 24 SQLite laboratory. Production uses the native durable-store
// adapter in infinite-opus-native-runtime.mjs. Neither grants business effects.
export function compileCrownPacket({ immutablePrefix, mutableDelta, model, route }) {
  if (!model || !route) throw new Error('explicit-model-route-required');
  const prefixHash = semanticHash(immutablePrefix);
  return { prefixHash, sessionId: semanticHash({ prefixHash, model, route }),
    immutablePrefix, mutableDelta, model, route, semanticAuthority: 'NONE' };
}

export function createInfiniteOpusRuntime({ store, authorities = {}, trustPins = {}, contracts = {}, clock = Date.now } = {}) {
  const admitted = structuredClone({ authorities, trustPins, contracts });
  const zero = extra => ({ providerCalls: 0, releaseAuthorized: false, externalEffectAuthority: 'NONE', ...extra });
  return {
    tick(event) {
      if (!event) return zero({ ok: true, status: 'SLEEP' });
      try {
        if (event.type !== 'STRUCTURED_ARTIFACT') throw new Error('typed-event-required');
        const key = exactObligationKey(event.task), context = { ...event.context, now: new Date(clock()).toISOString() };
        const contract = admitted.contracts[event.task.contractHash];
        if (!contract || semanticHash(contract) !== event.task.contractHash ||
            event.task.taskClass !== context.taskClass || event.task.inputHash !== context.inputHash ||
            event.task.crownRevision !== context.crownRevision ||
            semanticHash(event.task.dependencies) !== semanticHash(context.dependencies) ||
            semanticHash(event.task.invalidators) !== semanticHash(context.invalidators) ||
            semanticHash(event.task.qualityContract) !== semanticHash(context.qualityContract)) throw new Error('task-context-contract-mismatch');
        const demand = store.demand(event.task, event.consumer);
        if (!demand.ok || demand.mandatoryReview) throw new Error('unknown-or-high-stakes-needs-current-crown');
        const req = event.cacheRequest;
        if (req && (req.semanticStateHash !== key || req.dependencyHash !== semanticHash(context.dependencies) ||
            req.crownRevision !== context.crownRevision || req.freshnessClass !== event.task.freshnessClass ||
            semanticHash(req.qualityContract) !== semanticHash(context.qualityContract))) throw new Error('cache-context-binding-mismatch');
        const cached = req ? store.cacheGet(req, clock()) : { status: 'NOT_REQUESTED' };
        const candidate = cached.status === 'HIT' ? cached.value : event;
        const rendered = renderAuthorizedJson({ artifact: candidate.artifact, proof: candidate.proof, contract,
          context, authorities: admitted.authorities, trustPins: admitted.trustPins });
        if (!rendered.ok) {
          if (cached.key) store.invalidateCache(cached.key);
          return zero({ ...rendered, cacheStatus: cached.status });
        }
        if (req && cached.status !== 'HIT' && req.freshnessClass !== 'LIVE') store.cachePut(req,
          { artifact: event.artifact, proof: event.proof }, clock(), event.cacheTtlMs ?? 300000);
        const asset = { id: rendered.artifactHash, kind: 'DECISION_FRANCHISE', artifact: candidate.artifact,
          proof: candidate.proof, contractHash: event.task.contractHash, creationCost: null,
          referenceCostAvoided: null, authorityIds: rendered.authorityIds };
        const capital = store.putCapital(asset);
        if (!capital.ok) throw new Error('capital-conflict');
        store.db.prepare("UPDATE demand SET status='SETTLED',result=? WHERE key=?").run(rendered.artifactHash, key);
        store.event('CLOSED_TYPED_ARTIFACT', { key, consumerId: event.consumer.consumerId,
          artifactHash: rendered.artifactHash, cacheStatus: cached.status });
        return zero({ ...rendered, cacheStatus: cached.status, status: 'CLOSED_TYPED_ARTIFACT' });
      } catch (error) { return zero({ ok: false, status: 'CROWN_PAGE_FAULT', reasonCodes: [error.message] }); }
    }
  };
}
