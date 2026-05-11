// Vanilla TypeScript client — framework-free SkillOS API wrapper.
//
// Use cases: Node scripts, edge runtimes, agent runners, non-React frontends.
// Pairs with the React entry (`@skillos/sdk/react`) which composes hooks on
// top of the same client.
//
// Auth surface is split intentionally:
//   - `auth.siwbNonce` + `auth.siwbVerify`: full SIWB handshake (caller
//     supplies an already-signed SIWE message).
//   - `setBearerToken`: caller plumbs the JWT returned from verify into
//     subsequent write calls.
//
// No wallet integration here — that lives in `./react.tsx`.

import createOpenapiFetchClient from 'openapi-fetch';
import type { paths, components } from './api.gen.js';

export type SkillOSEnv = 'testnet' | 'mainnet';

export interface SkillOSClientConfig {
  env: SkillOSEnv;
  baseUrl?: string;
  bearerToken?: string;
}

const ENV_BASE_URL: Record<SkillOSEnv, string> = {
  // testnet (Base Sepolia) currently runs on api.skillos.network — see
  // architecture doc §3.1. mainnet is Phase 2-gated; baseUrl override is
  // available for local API dev.
  testnet: 'https://api.skillos.network',
  mainnet: 'https://api.skillos.network',
};

type ApiErrorEnvelope = components['schemas']['Error'];

export class SkillOSApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'SkillOSApiError';
  }
}

export class SkillOSNotSignedInError extends Error {
  constructor() {
    super('SkillOS bearer token missing — call useSkillOSAuth.signIn() first');
    this.name = 'SkillOSNotSignedInError';
  }
}

function unwrapError(status: number, body: unknown): SkillOSApiError {
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object'
  ) {
    const env = (body as ApiErrorEnvelope).error;
    return new SkillOSApiError(status, env.code, env.message, env.details);
  }
  return new SkillOSApiError(status, 'UNKNOWN', `HTTP ${status}`);
}

export interface SkillOSClient {
  setBearerToken(token: string | undefined): void;
  auth: {
    siwbNonce(walletAddress: `0x${string}`): Promise<
      components['schemas']['SiwbNonceResponse']
    >;
    siwbVerify(input: {
      message: string;
      signature: `0x${string}`;
      walletAddress: `0x${string}`;
    }): Promise<components['schemas']['SiwbVerifyResponse']>;
  };
  tournaments: {
    list(params?: {
      cursor?: string;
      limit?: number;
    }): Promise<components['schemas']['TournamentListResponse']>;
    get(id: `0x${string}`): Promise<components['schemas']['Tournament']>;
    leaderboard(
      id: `0x${string}`,
      params?: { cursor?: string; limit?: number },
    ): Promise<components['schemas']['LeaderboardResponse']>;
  };
  scores: {
    history(
      wallet: `0x${string}`,
      params?: { cursor?: string; limit?: number },
    ): Promise<components['schemas']['ScoreHistoryResponse']>;
    submit(
      input: components['schemas']['ScoreSubmitRequest'],
    ): Promise<components['schemas']['ScoreSubmitResponse']>;
  };
  sponsors: {
    receipts(
      wallet: `0x${string}`,
      params?: { cursor?: string; limit?: number },
    ): Promise<components['schemas']['SponsorReceiptsResponse']>;
  };
}

export function createSkillOSClient(
  config: SkillOSClientConfig,
): SkillOSClient {
  const baseUrl = config.baseUrl ?? ENV_BASE_URL[config.env];
  let bearer: string | undefined = config.bearerToken;

  const http = createOpenapiFetchClient<paths>({
    baseUrl,
    fetch: globalThis.fetch,
  });

  // Inject bearer per-request so token rotation (signOut, refresh) takes
  // effect immediately without re-creating the client.
  const authHeaders = (): Record<string, string> =>
    bearer ? { Authorization: `Bearer ${bearer}` } : {};

  return {
    setBearerToken(token) {
      bearer = token;
    },
    auth: {
      async siwbNonce(walletAddress) {
        const { data, error, response } = await http.POST(
          '/v1/auth/siwb/nonce',
          { body: { walletAddress } },
        );
        if (error || !data) throw unwrapError(response.status, error);
        return data;
      },
      async siwbVerify(input) {
        const { data, error, response } = await http.POST(
          '/v1/auth/siwb/verify',
          { body: input },
        );
        if (error || !data) throw unwrapError(response.status, error);
        return data;
      },
    },
    tournaments: {
      async list(params) {
        const { data, error, response } = await http.GET('/v1/tournaments', {
          params: { query: params ?? {} },
        });
        if (error || !data) throw unwrapError(response.status, error);
        return data;
      },
      async get(id) {
        const { data, error, response } = await http.GET(
          '/v1/tournaments/{id}',
          { params: { path: { id } } },
        );
        if (error || !data) throw unwrapError(response.status, error);
        return data;
      },
      async leaderboard(id, params) {
        const { data, error, response } = await http.GET(
          '/v1/tournaments/{id}/leaderboard',
          {
            params: { path: { id }, query: params ?? {} },
          },
        );
        if (error || !data) throw unwrapError(response.status, error);
        return data;
      },
    },
    scores: {
      async history(wallet, params) {
        const { data, error, response } = await http.GET(
          '/v1/scores/{wallet}',
          {
            params: { path: { wallet }, query: params ?? {} },
          },
        );
        if (error || !data) throw unwrapError(response.status, error);
        return data;
      },
      async submit(input) {
        if (!bearer) throw new SkillOSNotSignedInError();
        const { data, error, response } = await http.POST('/v1/scores', {
          body: input,
          headers: authHeaders(),
        });
        if (error || !data) throw unwrapError(response.status, error);
        return data;
      },
    },
    sponsors: {
      async receipts(wallet, params) {
        const { data, error, response } = await http.GET(
          '/v1/sponsors/{wallet}/receipts',
          {
            params: { path: { wallet }, query: params ?? {} },
          },
        );
        if (error || !data) throw unwrapError(response.status, error);
        return data;
      },
    },
  };
}

export type {
  paths as SkillOSPaths,
  components as SkillOSComponents,
} from './api.gen.js';
