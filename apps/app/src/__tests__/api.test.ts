// Cliente da API no app nativo: refresh token no SecureStore e renovação automática do access token.
import { ApiError, authApi, meApi, refreshSession, setSessionExpiredHandler } from '@/lib/api';

const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    store[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete store[k];
  }),
}));

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];

function respond(status: number, body?: unknown) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(store)) delete store[k];
});

test('login guarda o refresh token e envia o access token', async () => {
  globalThis.fetch = jest.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/login')) return respond(200, { access_token: 'A1', expires_in: 900, refresh_token: 'R1' });
    return respond(200, { id: 'u1' });
  }) as any;

  await authApi.login('ana@example.com', 'Senha#123');
  expect(store['ba.refresh']).toBe('R1');
  expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ client: 'native' });

  await meApi.get();
  expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer A1');
});

test('401 renova o token uma vez e repete a chamada', async () => {
  let meCalls = 0;
  globalThis.fetch = jest.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/login')) return respond(200, { access_token: 'A1', expires_in: 900, refresh_token: 'R1' });
    if (url.endsWith('/auth/refresh')) return respond(200, { access_token: 'A2', expires_in: 900, refresh_token: 'R2' });
    meCalls += 1;
    return meCalls === 1 ? respond(401, { error: { code: 'unauthorized' } }) : respond(200, { id: 'u1' });
  }) as any;

  await authApi.login('ana@example.com', 'Senha#123');
  await expect(meApi.get()).resolves.toEqual({ id: 'u1' });
  const refreshCall = calls.find((c) => c.url.endsWith('/auth/refresh'))!;
  expect(JSON.parse(refreshCall.init.body as string)).toEqual({ refresh_token: 'R1' });
  expect(store['ba.refresh']).toBe('R2');
  expect((calls.at(-1)!.init.headers as Record<string, string>).Authorization).toBe('Bearer A2');
});

test('refresh recusado encerra a sessão e apaga o token guardado', async () => {
  const expired = jest.fn();
  setSessionExpiredHandler(expired);
  globalThis.fetch = jest.fn((url: string) => {
    if (url.endsWith('/auth/login')) return respond(200, { access_token: 'A1', expires_in: 900, refresh_token: 'R1' });
    if (url.endsWith('/auth/refresh')) return respond(401, { error: { code: 'invalid_refresh_token' } });
    return respond(401, { error: { code: 'unauthorized' } });
  }) as any;

  await authApi.login('ana@example.com', 'Senha#123');
  await expect(meApi.get()).rejects.toBeInstanceOf(ApiError);
  expect(expired).toHaveBeenCalled();
  expect(store['ba.refresh']).toBeUndefined();
});

test('sem rede: erro com código network_error e refresh guardado preservado', async () => {
  store['ba.refresh'] = 'R1';
  globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('offline'))) as any;
  await expect(refreshSession()).resolves.toBe(false);
  expect(store['ba.refresh']).toBe('R1');
  await expect(meApi.get()).rejects.toMatchObject({ code: 'network_error' });
});

test('erro da API vira ApiError com o código do backend', async () => {
  globalThis.fetch = jest.fn(() => respond(409, { error: { code: 'email_taken', message: 'exists' } })) as any;
  await expect(
    authApi.register({ name: 'Ana', email: 'a@b.co', password: 'Senha#123', locale: 'pt-BR', accept_terms: true }),
  ).rejects.toMatchObject({ status: 409, code: 'email_taken' });
});
