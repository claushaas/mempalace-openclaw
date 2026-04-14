import path from 'node:path';

import { RESULTS_DIR, bootstrapHostEnvironment, buildBaseReport, writeJson } from './shared.mjs';

const report = buildBaseReport('host-real:bootstrap', {
	status: 'validated',
	...bootstrapHostEnvironment()
});

const outputPath = path.join(RESULTS_DIR, 'host-real-bootstrap.json');
writeJson(outputPath, report);
console.log(JSON.stringify(report, null, 2));
