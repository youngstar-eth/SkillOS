// SPEC-B1 delegation — prize-pool funding as calldata (no signing).
//
// fund_pool held a private key (two viem.writeContract calls). Under wallet
// delegation it becomes prepare_fund_pool: it returns the USDC.approve +
// SponsorshipModule.sponsorPool calldata as a two-call batch for the host to
// send via base-mcp send_calls(chain=base-sepolia, calls=[...]) from W.
// @skillos/mcp signs nothing.
//
// Architectural invariant (CLAUDE.md): sponsorPool() lands in the segregated
// prize-pool slot via the SponsorshipModule's permissioned path. We don't fund
// pools via any other entry point.

import { z } from 'zod';
import { encodeFunctionData } from 'viem';
import { ERC20_APPROVE_ABI, SPONSORSHIP_MODULE_ABI, getChainAddresses, usdcAtoms } from '@skillos/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

export function registerPrepareFundPoolTool(server: McpServer, ctx: ServerContext): void {
  registerTool(server, {
    name: 'prepare_fund_pool',
    description:
      'Build the calldata to permissionlessly sponsor a SkillOS tournament prize pool with USDC. Returns a two-call batch [USDC.approve, SponsorshipModule.sponsorPool] for the host to send via base-mcp send_calls(chain=base-sepolia, calls=[...]) from W. @skillos/mcp signs nothing.',
    inputSchema: { tournamentId: Bytes32, amount: Amount },
    handler: async ({ tournamentId, amount }) => {
      const addresses = getChainAddresses(ctx.config.env);
      const atoms = usdcAtoms(amount);

      const approveData = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [addresses.sponsorshipModule, atoms],
      });
      const sponsorData = encodeFunctionData({
        abi: SPONSORSHIP_MODULE_ABI,
        functionName: 'sponsorPool',
        args: [tournamentId as `0x${string}`, atoms],
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                calls: [
                  { to: addresses.usdc, data: approveData, value: '0x0' },
                  { to: addresses.sponsorshipModule, data: sponsorData, value: '0x0' },
                ],
                chainId: ctx.config.chainId,
                tournamentId,
                amount,
                atoms: atoms.toString(),
                hint: 'Send via base-mcp send_calls(chain=base-sepolia, calls=[...]) from W. The two calls (approve then sponsorPool) must execute in order.',
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
