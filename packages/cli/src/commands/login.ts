// `skillos login` — SIWB handshake → cached bearer JWT.
//
// Flow:
//   1. POST /v1/auth/siwb/nonce { walletAddress }
//   2. Construct EIP-4361 SIWE message with that nonce
//   3. Sign the message via viem account.signMessage()
//   4. POST /v1/auth/siwb/verify { message, signature, walletAddress }
//   5. Persist the returned bearer to ~/.skillos/session.json
//
// Optional `--agent` mode does the SIWA equivalent: nonce → signSIWAMessage
// → verify → receipt cached. Requires --agent-id (or SKILLOS_AGENT_ID).

import { defineCommand } from 'citty';
import { createSkillOSAgentClient, createSkillOSClient } from '@skillos/sdk';
import { SiweMessage } from 'siwe';
import { loadConfig, MissingAgentIdError, MissingWalletError } from '../config.js';
import { saveSession } from '../session.js';
import { buildSiwaSigner, buildWallet } from '../wallet.js';
import { fail, info } from '../output.js';

export const loginCommand = defineCommand({
  meta: {
    name: 'login',
    description: 'Sign in with Base (SIWB) or as a verified agent (SIWA). Caches the session locally.',
  },
  args: {
    agent: {
      type: 'boolean',
      description: 'Use SIWA agent sign-in instead of SIWB.',
      default: false,
    },
    'agent-id': {
      type: 'string',
      description: 'ERC-8004 tokenId (required with --agent unless SKILLOS_AGENT_ID is set).',
    },
    key: {
      type: 'string',
      description: 'Private key override (else uses SKILLOS_PRIVATE_KEY / config).',
    },
    env: {
      type: 'enum',
      description: 'Environment override.',
      options: ['testnet', 'mainnet'],
    },
  },
  async run({ args }) {
    const config = loadConfig({
      env: args.env,
      privateKey: args.key,
    });

    if (!config.privateKey) throw new MissingWalletError();
    const wallet = buildWallet({ ...config, privateKey: config.privateKey });

    if (args.agent) {
      const agentIdOverride = args['agent-id']?.trim();
      const agentId =
        agentIdOverride !== undefined && agentIdOverride !== ''
          ? Number(agentIdOverride)
          : config.agentId;
      if (agentId === null || agentId === undefined || !Number.isInteger(agentId)) {
        throw new MissingAgentIdError();
      }

      info(`SIWA sign-in as agentId=${agentId} address=${wallet.address}…`);
      const client = createSkillOSAgentClient({
        env: config.env,
        agentId,
        signer: buildSiwaSigner(wallet.account) as never,
        domain: config.siwaDomain,
        baseUrl: config.baseUrl,
        agentRegistry: config.registryAddress,
      });
      const result = await client.signIn();

      saveSession({
        kind: 'receipt',
        receipt: result.receipt,
        expiresAt: result.expiresAt,
        address: result.address,
        agentId: result.agentId,
        env: config.env,
        chainId: config.chainId,
        ...(result.builderCode ? { builderCode: result.builderCode } : {}),
      });
      info(`✓ SIWA receipt cached. Expires ${new Date(result.expiresAt).toISOString()}.`);
      if (result.builderCode) info(`  Builder Code: ${result.builderCode}`);
      return;
    }

    info(`SIWB sign-in as ${wallet.address}…`);
    const sdk = createSkillOSClient({ env: config.env, baseUrl: config.baseUrl });
    const { nonce } = await sdk.auth.siwbNonce(wallet.address);

    const message = new SiweMessage({
      domain: config.siwaDomain,
      address: wallet.address,
      statement: 'Sign in with Base to SkillOS.',
      uri: `https://${config.siwaDomain}/v1/auth/siwb`,
      version: '1',
      chainId: config.chainId,
      nonce,
      issuedAt: new Date().toISOString(),
    }).prepareMessage();

    const signature = await wallet.account.signMessage({ message });
    const verify = await sdk.auth.siwbVerify({
      message,
      signature,
      walletAddress: wallet.address,
    });

    const expiresAt = Date.parse(verify.expiresAt);
    saveSession({
      kind: 'bearer',
      token: verify.token,
      expiresAt,
      address: wallet.address,
      env: config.env,
      chainId: config.chainId,
    });
    info(`✓ Bearer token cached. Expires ${verify.expiresAt}.`);
  },
});

export function loginErrorHint(err: unknown): void {
  if (err instanceof MissingWalletError) {
    fail(err.message);
  }
  if (err instanceof MissingAgentIdError) {
    fail(err.message);
  }
}
