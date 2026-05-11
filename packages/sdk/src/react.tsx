// React entry — provider + hooks composed on top of the vanilla client.
// The `"use client"` directive is added to dist/react.js by a post-build step
// (scripts/post-build.mjs) so Next.js treats the module as a React Server
// Components client boundary. Keeping it out of source avoids tsup directive
// hoisting warnings.
//
// Design notes:
//   - Provider assumes parent app supplies WagmiProvider + QueryClientProvider
//     higher in the tree. We do NOT re-create either. apps/2048's existing
//     packages/ui/src/Providers.tsx is the canonical example.
//   - Bearer token persists to localStorage ('skillos.bearer') by default.
//     Disable via `persistAuth: false` for memory-only sessions.
//   - SIWB message format is built to match apps/api/src/lib/siwe.ts's
//     parseAndValidate expectations: domain 'skillos.network', chainId 84532.
//   - Score hook ships, but per Sprint X3 Q1c lock apps/2048 still calls its
//     internal /api/tournaments/[id]/solo route (anti-cheat coupling). The
//     hook is fully usable from greenfield consumers via `/tmp/sdk-test`.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SiweMessage } from 'siwe';
import {
  useAccount,
  useConnect,
  useSignMessage,
} from 'wagmi';
import {
  createSkillOSClient,
  SkillOSNotSignedInError,
  type SkillOSClient,
  type SkillOSClientConfig,
  type SkillOSEnv,
  type SkillOSComponents,
} from './vanilla.js';
import {
  builderCodeToDataSuffix,
  ERC20_APPROVE_ABI,
  getChainAddresses,
  SPONSORSHIP_MODULE_ABI,
  usdcAtoms,
} from './contracts.js';

export interface SkillOSProviderConfig {
  env: SkillOSEnv;
  builderCode?: string;
  baseUrl?: string;
  persistAuth?: 'localStorage' | false;
  // Override the domain string injected into SIWE messages. Defaults to
  // 'skillos.network' to match the canonical server-side parser.
  siwbDomain?: string;
}

interface BearerSnapshot {
  token: string;
  expiresAt: number;
  address: `0x${string}`;
  sessionId: string;
}

const BEARER_STORAGE_KEY = 'skillos.bearer';
const DEFAULT_SIWB_DOMAIN = 'skillos.network';

interface SkillOSContextValue {
  client: SkillOSClient;
  config: SkillOSProviderConfig;
  bearer: BearerSnapshot | null;
  setBearer: (b: BearerSnapshot | null) => void;
}

const SkillOSContext = createContext<SkillOSContextValue | null>(null);

function loadStoredBearer(): BearerSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BEARER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BearerSnapshot;
    if (!parsed || typeof parsed.token !== 'string') return null;
    if (parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(BEARER_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function SkillOSProvider({
  config,
  children,
}: {
  config: SkillOSProviderConfig;
  children: ReactNode;
}) {
  const persist = config.persistAuth !== false;
  const [bearer, setBearerState] = useState<BearerSnapshot | null>(() =>
    persist ? loadStoredBearer() : null,
  );

  const setBearer = useCallback(
    (next: BearerSnapshot | null) => {
      setBearerState(next);
      if (typeof window === 'undefined' || !persist) return;
      if (next) {
        window.localStorage.setItem(BEARER_STORAGE_KEY, JSON.stringify(next));
      } else {
        window.localStorage.removeItem(BEARER_STORAGE_KEY);
      }
    },
    [persist],
  );

  // Client identity is stable across renders; bearer rotation is pushed
  // through setBearerToken so React Query caches keyed on `client` don't
  // thrash on sign-in/out.
  const client = useMemo(() => {
    const init: SkillOSClientConfig = {
      env: config.env,
      bearerToken: bearer?.token,
    };
    if (config.baseUrl !== undefined) init.baseUrl = config.baseUrl;
    return createSkillOSClient(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.env, config.baseUrl]);

  useEffect(() => {
    client.setBearerToken(bearer?.token);
  }, [client, bearer?.token]);

  const value = useMemo<SkillOSContextValue>(
    () => ({ client, config, bearer, setBearer }),
    [client, config, bearer, setBearer],
  );

  return (
    <SkillOSContext.Provider value={value}>{children}</SkillOSContext.Provider>
  );
}

function useSkillOSCtx(): SkillOSContextValue {
  const v = useContext(SkillOSContext);
  if (!v) {
    throw new Error(
      'useSkillOS* hooks must be used inside a <SkillOSProvider>',
    );
  }
  return v;
}

// ─── useSkillOSAuth ────────────────────────────────────────────────────────

export interface UseSkillOSAuth {
  signIn: () => Promise<{ address: `0x${string}`; expiresAt: number }>;
  signOut: () => void;
  address: `0x${string}` | null;
  isSignedIn: boolean;
  expiresAt: number | null;
}

export function useSkillOSAuth(): UseSkillOSAuth {
  const { client, config, bearer, setBearer } = useSkillOSCtx();
  const { address: connectedAddress, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();

  const signIn = useCallback(async () => {
    let walletAddress = connectedAddress as `0x${string}` | undefined;
    if (!isConnected || !walletAddress) {
      const connector = connectors[0];
      if (!connector) {
        throw new Error(
          'SkillOS: no wagmi connector available — configure <WagmiProvider> with at least one connector',
        );
      }
      const result = await connectAsync({ connector });
      walletAddress = result.accounts[0] as `0x${string}` | undefined;
    }
    if (!walletAddress) {
      throw new Error('SkillOS: wallet connect did not yield an address');
    }

    const { nonce } = await client.auth.siwbNonce(walletAddress);

    const domain = config.siwbDomain ?? DEFAULT_SIWB_DOMAIN;
    const uri =
      typeof window !== 'undefined'
        ? window.location.origin
        : `https://${domain}`;

    const siwe = new SiweMessage({
      domain,
      address: walletAddress,
      statement: 'Sign in to SkillOS',
      uri,
      version: '1',
      chainId: getChainAddresses(config.env).chainId,
      nonce,
      issuedAt: new Date().toISOString(),
    });
    const message = siwe.prepareMessage();
    const signature = (await signMessageAsync({
      message,
    })) as `0x${string}`;

    const verifyResult = await client.auth.siwbVerify({
      message,
      signature,
      walletAddress,
    });

    const snapshot: BearerSnapshot = {
      token: verifyResult.token,
      expiresAt: Date.parse(verifyResult.expiresAt),
      address: walletAddress,
      sessionId: verifyResult.sessionId,
    };
    setBearer(snapshot);
    return { address: walletAddress, expiresAt: snapshot.expiresAt };
  }, [
    client,
    config.env,
    config.siwbDomain,
    connectAsync,
    connectedAddress,
    connectors,
    isConnected,
    setBearer,
    signMessageAsync,
  ]);

  const signOut = useCallback(() => setBearer(null), [setBearer]);

  // Auto-clear the bearer when it crosses expiry. Keeps isSignedIn pure
  // (React 19's react-hooks/purity rule forbids Date.now() during render).
  // The timeout fires exactly once when expiry hits; signOut, provider
  // unmount, and bearer rotation all cancel it via the cleanup return.
  useEffect(() => {
    if (!bearer) return;
    const ms = bearer.expiresAt - Date.now();
    if (ms <= 0) {
      setBearer(null);
      return;
    }
    const timer = setTimeout(() => setBearer(null), ms);
    return () => clearTimeout(timer);
  }, [bearer, setBearer]);

  return {
    signIn,
    signOut,
    address: bearer?.address ?? null,
    isSignedIn: !!bearer,
    expiresAt: bearer?.expiresAt ?? null,
  };
}

// ─── useSkillOSTournaments ────────────────────────────────────────────────

export interface UseSkillOSTournamentsParams {
  filter?: { cursor?: string; limit?: number };
}

export function useSkillOSTournaments(params?: UseSkillOSTournamentsParams) {
  const { client } = useSkillOSCtx();
  const filter = params?.filter;
  return useQuery({
    queryKey: ['skillos', 'tournaments', filter ?? null],
    queryFn: () => client.tournaments.list(filter),
    staleTime: 30_000,
  });
}

// ─── useSkillOSLeaderboard ────────────────────────────────────────────────

export interface UseSkillOSLeaderboardParams {
  tournamentId: `0x${string}`;
  cursor?: string;
  limit?: number;
}

export function useSkillOSLeaderboard(params: UseSkillOSLeaderboardParams) {
  const { client } = useSkillOSCtx();
  const { tournamentId, cursor, limit } = params;
  return useQuery({
    queryKey: ['skillos', 'leaderboard', tournamentId, cursor, limit],
    queryFn: () =>
      client.tournaments.leaderboard(tournamentId, { cursor, limit }),
    staleTime: 10_000,
    enabled: Boolean(tournamentId),
  });
}

// ─── useSkillOSScore (scaffolded; apps/2048 keeps internal route per Q1c) ──

type ScoreSubmitInput = Omit<
  SkillOSComponents['schemas']['ScoreSubmitRequest'],
  'tournamentId'
>;

export interface UseSkillOSScoreParams {
  tournamentId: `0x${string}`;
}

export function useSkillOSScore(params: UseSkillOSScoreParams) {
  const { client, bearer } = useSkillOSCtx();
  const mutation = useMutation({
    mutationFn: async (input: ScoreSubmitInput) => {
      if (!bearer) throw new SkillOSNotSignedInError();
      return client.scores.submit({
        tournamentId: params.tournamentId,
        ...input,
      });
    },
  });
  return {
    submit: mutation.mutateAsync,
    status: mutation.status,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}

// ─── useSkillOSSponsor ─────────────────────────────────────────────────────

export interface UseSkillOSSponsorParams {
  tournamentId: `0x${string}`;
}

export interface FundCalldataInput {
  amountUsdc: number | string;
}

export interface FundCalldataResult {
  // Two-step flow on EVM: caller must approve USDC to SponsorshipModule
  // before calling sponsorPool. We return both calls so the caller can
  // sequence them (or batch via EIP-5792 wallet_sendCalls).
  approve: {
    address: `0x${string}`;
    abi: typeof ERC20_APPROVE_ABI;
    functionName: 'approve';
    args: readonly [`0x${string}`, bigint];
    dataSuffix: `0x${string}` | undefined;
  };
  fund: {
    address: `0x${string}`;
    abi: typeof SPONSORSHIP_MODULE_ABI;
    functionName: 'sponsorPool';
    args: readonly [`0x${string}`, bigint];
    dataSuffix: `0x${string}` | undefined;
  };
}

export function useSkillOSSponsor(params: UseSkillOSSponsorParams) {
  const { config } = useSkillOSCtx();
  const addresses = getChainAddresses(config.env);
  const dataSuffix = builderCodeToDataSuffix(config.builderCode);

  const fundCalldata = useCallback(
    (input: FundCalldataInput): FundCalldataResult => {
      const amount = usdcAtoms(input.amountUsdc);
      return {
        approve: {
          address: addresses.usdc,
          abi: ERC20_APPROVE_ABI,
          functionName: 'approve',
          args: [addresses.sponsorshipModule, amount],
          dataSuffix,
        },
        fund: {
          address: addresses.sponsorshipModule,
          abi: SPONSORSHIP_MODULE_ABI,
          functionName: 'sponsorPool',
          args: [params.tournamentId, amount],
          dataSuffix,
        },
      };
    },
    [addresses, dataSuffix, params.tournamentId],
  );

  return { fundCalldata, builderCode: config.builderCode ?? null };
}
