import type {
	AgentDiaryAppendInput,
	AgentDiaryEntry,
	AgentDiaryQuery,
	KnowledgeGraphExpansionResult,
	KnowledgeGraphUpsertInput,
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

export interface MemPalaceKnowledgeGraphClient {
	expandQuery(query: MemorySearchQuery): Promise<KnowledgeGraphExpansionResult>;
	upsertGraph(input: KnowledgeGraphUpsertInput): Promise<{
		accepted: true;
		entityCount: number;
		relationCount: number;
	}>;
}

export interface MemPalaceDiaryClient {
	appendDiaryEntry(input: AgentDiaryAppendInput): Promise<AgentDiaryEntry>;
	getDiaryEntry(entryId: string): Promise<AgentDiaryEntry>;
	listDiaryEntries(query: AgentDiaryQuery): Promise<AgentDiaryEntry[]>;
}
