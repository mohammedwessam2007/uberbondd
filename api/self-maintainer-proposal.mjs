import { createSelfMaintainerProposalApiHandler } from '../.github/workflows/runtime/self-maintainer-proposal-api.mjs';

export const config = { maxDuration: 60 };
export default createSelfMaintainerProposalApiHandler();
