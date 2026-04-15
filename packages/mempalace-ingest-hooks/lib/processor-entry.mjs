import { processPendingSpool } from './processor.js';

const cfg = process.env.MEMPALACE_OPENCLAW_CFG
	? JSON.parse(process.env.MEMPALACE_OPENCLAW_CFG)
	: {};

await processPendingSpool({ cfg });
