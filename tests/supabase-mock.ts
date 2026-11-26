/**
 * Doble de supabase-js para probar lib/queries sin red: cada consulta encadenada (`from().x().y()`)
 * es "thenable" y resuelve la siguiente respuesta de la cola; `rpc` igual. Registra las llamadas.
 */
export interface MockResponse {
  data?: unknown;
  error?: { message: string } | null;
}
export interface MockCall {
  table?: string;
  rpc?: string;
  args?: unknown;
  chain: { method: string; args: unknown[] }[];
}

export function createSupabaseMock(responses: MockResponse[] = []) {
  const queue = [...responses];
  const calls: MockCall[] = [];
  const next = () => {
    const r = queue.shift();
    if (!r) throw new Error('supabase mock: sin respuesta en cola');
    return { data: r.data ?? null, error: r.error ?? null };
  };
  function builder(call: MockCall) {
    const b: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve().then(next).then(resolve, reject),
    };
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'is', 'order', 'limit', 'single']) {
      b[m] = (...args: unknown[]) => {
        call.chain.push({ method: m, args });
        return b;
      };
    }
    return b;
  }
  return {
    calls,
    push: (r: MockResponse) => queue.push(r),
    client: {
      from: (table: string) => {
        const call: MockCall = { table, chain: [] };
        calls.push(call);
        return builder(call);
      },
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ rpc: fn, args, chain: [] });
        return next();
      },
    },
  };
}
