// Default entry — re-exports both vanilla and React surfaces so consumers
// can `import { ... } from '@skillos/sdk'` without choosing a subpath.
//
// Tree-shaking: with sideEffects:false and ESM-only, bundlers eliminate
// unused exports. Use the subpath imports (`@skillos/sdk/vanilla` or
// `@skillos/sdk/react`) when bundle size matters in edge runtimes.

export {
  createSkillOSClient,
  SkillOSApiError,
  SkillOSNotSignedInError,
  type SkillOSClient,
  type SkillOSClientConfig,
  type SkillOSEnv,
  type SkillOSPaths,
  type SkillOSComponents,
} from './vanilla.js';

export {
  SkillOSProvider,
  useSkillOSAuth,
  useSkillOSLeaderboard,
  useSkillOSScore,
  useSkillOSSponsor,
  useSkillOSTournaments,
  type FundCalldataInput,
  type FundCalldataResult,
  type SkillOSProviderConfig,
  type UseSkillOSAuth,
  type UseSkillOSLeaderboardParams,
  type UseSkillOSScoreParams,
  type UseSkillOSSponsorParams,
  type UseSkillOSTournamentsParams,
} from './react.js';

export {
  builderCodeToDataSuffix,
  ERC20_APPROVE_ABI,
  getChainAddresses,
  SPONSORSHIP_MODULE_ABI,
  usdcAtoms,
  type ChainAddresses,
} from './contracts.js';
