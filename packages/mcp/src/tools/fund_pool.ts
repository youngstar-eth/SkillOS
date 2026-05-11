// fund_pool — sponsor a tournament's prize pool with USDC.
//
// Two on-chain writes (USDC.approve then SponsorshipModule.sponsorPool) via
// direct viem.writeContract. Both must succeed for the contribution to land;
// we wait for receipt on each so the LLM gets a definitive outcome rather
// than a fire-and-forget tx hash.
//
// Architectural invariant (CLAUDE.md): retry-fee and prize-pool slots are
// segregated on TournamentPool — sponsorPool() lands in the prize-pool slot
// via the SponsorshipModule's permissioned path. We don't fund pools via
// any other entry point.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ERC20_APPROVE_ABI, SPONSORSHIP_MODULE_ABI, getChainAddresses, usdcAtoms } from '@skillos/sdk';
import { MissingWalletError } from '../config.js';
import { buildWallet } from '../wallet.js';
import type { ServerContext } from '../server.js';
import { registerTool } from './_register.js';

const Bytes32 = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'tournamentId must be 0x-prefixed 32-byte hex')
  .describe('Tournament id (bytes32 hex).');

const Amount = z
  .string()
  .regex(/^[0-9]+(\.[0-9]{1,6})?$/, 'amount must be a decimal USD amount with ≤6 fractional digits')
  .describe('USDC amount as a decimal string (e.g. "5", "0.5", "12.345"). Six fractional digits = USDC atomic precision.');

export function registerFundPoolTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'fund_pool',
    description:
      'Permissionlessly sponsor a SkillOS tournament prize pool with USDC. Performs USDC approve + SponsorshipModule.sponsorPool() in sequence; both transactions are waited to completion. Requires SKILLOS_PRIVATE_KEY to be set with a funded Base wallet.',
    inputSchema: { tournamentId: Bytes32, amount: Amount },
    handler: async ({ tournamentId, amount }) => {
      if (!ctx.config.privateKey) throw new MissingWalletError();

      const addresses = getChainAddresses(ctx.config.env);
      const wallet = buildWallet({ ...ctx.config, privateKey: ctx.config.privateKey });
      const atoms = usdcAtoms(amount);

      const approveHash = await wallet.walletClient.writeContract({
        account: wallet.account,
        chain: null,
        address: addresses.usdc,
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [addresses.sponsorshipModule, atoms],
      });
      const approveReceipt = await wallet.publicClient.waitForTransactionReceipt({ hash: approveHash });
      if (approveReceipt.status !== 'success') {
        throw new Error(`USDC approve reverted: ${approveHash}`);
      }

      const sponsorHash = await wallet.walletClient.writeContract({
        account: wallet.account,
        chain: null,
        address: addresses.sponsorshipModule,
        abi: SPONSORSHIP_MODULE_ABI,
        functionName: 'sponsorPool',
        args: [tournamentId as `0x${string}`, atoms],
      });
      const sponsorReceipt = await wallet.publicClient.waitForTransactionReceipt({ hash: sponsorHash });
      if (sponsorReceipt.status !== 'success') {
        throw new Error(`sponsorPool reverted: ${sponsorHash}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ok: true,
                tournamentId,
                amount,
                atoms: atoms.toString(),
                sponsor: wallet.address,
                approveTxHash: approveHash,
                sponsorTxHash: sponsorHash,
                chainId: ctx.config.chainId,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });
}
