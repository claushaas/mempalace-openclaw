import type {
	MemoryArtifact,
	MemoryIndexRequest,
	MemoryPromoteInput,
	MemorySearchQuery,
	MemorySearchResult,
	RuntimeHealth,
	SourceStatus,
} from './schemas.js';

export interface MemPalaceRefreshResult {
	accepted: true;
	force?: boolean;
	reason: MemoryIndexRequest['reason'];
	sourceId?: string;
	target?: string;
}

export interface MemPalaceClient {
	get(artifactId: string): Promise<MemoryArtifact>;
	getHealth(): Promise<RuntimeHealth>;
	listSourcesStatus(): Promise<SourceStatus[]>;
	promote(input: MemoryPromoteInput): Promise<MemoryArtifact>;
	refreshIndex(request: MemoryIndexRequest): Promise<MemPalaceRefreshResult>;
	search(query: MemorySearchQuery): Promise<MemorySearchResult[]>;
}
