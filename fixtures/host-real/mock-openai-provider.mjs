import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const expectedNeedle =
	process.env.MOCK_OPENAI_EXPECTED_NEEDLE ?? 'lemon pepper wings';
const neutralReply =
	process.env.MOCK_OPENAI_NEUTRAL_REPLY ??
	"I don't know your usual QA movie night snack.";
const successReply =
	process.env.MOCK_OPENAI_SUCCESS_REPLY ??
	`You usually want ${expectedNeedle}.`;
const memoryQuery =
	process.env.MOCK_OPENAI_MEMORY_QUERY ??
	'QA movie night snack lemon pepper wings blue cheese';
const modelId = process.env.MOCK_OPENAI_MODEL_ID ?? 'recall-model';
const requestLogPath = process.env.MOCK_OPENAI_REQUEST_LOG_PATH;
const readyPath = process.env.MOCK_OPENAI_READY_PATH;
const port = Number.parseInt(process.env.MOCK_OPENAI_PORT ?? '0', 10);

const requests = [];

function ensureDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
}

function appendRequest(record) {
	requests.push(record);
	if (!requestLogPath) {
		return;
	}
	ensureDir(path.dirname(requestLogPath));
	fs.appendFileSync(requestLogPath, `${JSON.stringify(record)}\n`);
}

function flattenContentPart(part) {
	if (!part || typeof part !== 'object') {
		return '';
	}
	if (typeof part.text === 'string') {
		return part.text;
	}
	if (typeof part.content === 'string') {
		return part.content;
	}
	return '';
}

function flattenMessageText(message) {
	if (!message || typeof message !== 'object') {
		return '';
	}
	if (typeof message.content === 'string') {
		return message.content;
	}
	if (Array.isArray(message.content)) {
		return message.content.map(flattenContentPart).filter(Boolean).join('\n');
	}
	if (typeof message.tool_call_id === 'string' && typeof message.content === 'string') {
		return message.content;
	}
	return '';
}

function buildToolCall(name, argumentsValue) {
	return {
		choices: [
			{
				finish_reason: 'tool_calls',
				index: 0,
				message: {
					content: null,
					role: 'assistant',
					tool_calls: [
						{
							function: {
								arguments: JSON.stringify(argumentsValue),
								name,
							},
							id: `call_${name}_${Date.now()}`,
							type: 'function',
						},
					],
				},
			},
		],
	};
}

function buildAssistantMessage(content) {
	return {
		choices: [
			{
				finish_reason: 'stop',
				index: 0,
				message: {
					content,
					role: 'assistant',
				},
			},
		],
	};
}

function makeResponseEnvelope(body, result) {
	return {
		id: `chatcmpl_mock_${Date.now()}`,
		model: body.model ?? modelId,
		object: 'chat.completion',
		created: Math.floor(Date.now() / 1000),
		...result,
	};
}

function writeJson(response, statusCode, payload) {
	response.writeHead(statusCode, {
		'content-type': 'application/json',
	});
	response.end(`${JSON.stringify(payload)}\n`);
}

function writeStream(response, payload) {
	const id = `chatcmpl_mock_${Date.now()}`;
	const model = payload.model ?? modelId;
	response.writeHead(200, {
		'cache-control': 'no-cache',
		connection: 'keep-alive',
		'content-type': 'text/event-stream',
	});

	const choice = payload.choices[0];
	if (choice?.message?.tool_calls) {
		response.write(
			`data: ${JSON.stringify({
				id,
				object: 'chat.completion.chunk',
				created: Math.floor(Date.now() / 1000),
				model,
				choices: [
					{
						index: 0,
						delta: {
							role: 'assistant',
							tool_calls: choice.message.tool_calls,
						},
						finish_reason: null,
					},
				],
			})}\n\n`,
		);
		response.write(
			`data: ${JSON.stringify({
				id,
				object: 'chat.completion.chunk',
				created: Math.floor(Date.now() / 1000),
				model,
				choices: [
					{
						index: 0,
						delta: {},
						finish_reason: 'tool_calls',
					},
				],
			})}\n\n`,
		);
	} else {
		response.write(
			`data: ${JSON.stringify({
				id,
				object: 'chat.completion.chunk',
				created: Math.floor(Date.now() / 1000),
				model,
				choices: [
					{
						index: 0,
						delta: {
							role: 'assistant',
							content: choice?.message?.content ?? '',
						},
						finish_reason: null,
					},
				],
			})}\n\n`,
		);
		response.write(
			`data: ${JSON.stringify({
				id,
				object: 'chat.completion.chunk',
				created: Math.floor(Date.now() / 1000),
				model,
				choices: [
					{
						index: 0,
						delta: {},
						finish_reason: 'stop',
					},
				],
			})}\n\n`,
		);
	}

	response.end('data: [DONE]\n\n');
}

function planResponse(body) {
	const messages = Array.isArray(body.messages) ? body.messages : [];
	const allInputText = messages.map(flattenMessageText).filter(Boolean).join('\n\n');
	const toolMessages = messages.filter((message) => message?.role === 'tool');
	const toolNames = Array.isArray(body.tools)
		? body.tools
				.map((tool) => tool?.function?.name)
				.filter((value) => typeof value === 'string')
		: [];
	const isMemorySearchAgent = allInputText.includes(
		'You are a memory search agent.',
	);
	const hasRecallContext = allInputText.includes('MemPalace Recall Context');
	const hasNeedle = allInputText.toLowerCase().includes(expectedNeedle.toLowerCase());

	if (isMemorySearchAgent && toolNames.includes('memory_search') && toolMessages.length === 0) {
		return {
			allInputText,
			hasNeedle,
			hasRecallContext,
			plannedToolName: 'memory_search',
			response: buildToolCall('memory_search', {
				query: memoryQuery,
			}),
		};
	}

	if (isMemorySearchAgent && toolNames.includes('memory_get')) {
		const searchToolResult = toolMessages
			.map((message) => {
				try {
					return JSON.parse(message.content);
				} catch {
					return undefined;
				}
			})
			.find((value) => Array.isArray(value));
		const artifactId =
			searchToolResult?.[0]?.path ??
			searchToolResult?.[0]?.artifactId ??
			'artifact-needle';
		if (
			toolMessages.length === 1 &&
			Array.isArray(searchToolResult)
		) {
			return {
				allInputText,
				hasNeedle,
				hasRecallContext,
				plannedToolName: 'memory_get',
				response: buildToolCall('memory_get', {
					path: artifactId,
				}),
			};
		}
	}

	if (isMemorySearchAgent) {
		return {
			allInputText,
			hasNeedle,
			hasRecallContext,
			response: buildAssistantMessage(successReply),
		};
	}

	return {
		allInputText,
		hasNeedle,
		hasRecallContext,
		response: buildAssistantMessage(hasNeedle ? successReply : neutralReply),
	};
}

async function readRequestBody(request) {
	const chunks = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	const rawBody = Buffer.concat(chunks).toString('utf8');
	return rawBody ? JSON.parse(rawBody) : {};
}

const server = http.createServer(async (request, response) => {
	if (!request.url) {
		writeJson(response, 404, { error: 'missing url' });
		return;
	}

	if (request.method === 'GET' && request.url === '/debug/requests') {
		writeJson(response, 200, requests);
		return;
	}

	if (request.method === 'GET' && request.url === '/v1/models') {
		writeJson(response, 200, {
			data: [
				{
					id: modelId,
					object: 'model',
				},
			],
			object: 'list',
		});
		return;
	}

	if (request.method === 'POST' && request.url === '/v1/chat/completions') {
		const body = await readRequestBody(request);
		const planned = planResponse(body);
		appendRequest({
			allInputText: planned.allInputText,
			hasNeedle: planned.hasNeedle,
			hasRecallContext: planned.hasRecallContext,
			method: request.method,
			path: request.url,
			plannedToolName: planned.plannedToolName,
			recordedAt: new Date().toISOString(),
			responseContent:
				planned.response.choices?.[0]?.message?.content ?? null,
			stream: Boolean(body.stream),
			toolNames: Array.isArray(body.tools)
				? body.tools
						.map((tool) => tool?.function?.name)
						.filter((value) => typeof value === 'string')
				: [],
		});
		const payload = makeResponseEnvelope(body, planned.response);
		if (body.stream) {
			writeStream(response, payload);
			return;
		}
		writeJson(response, 200, payload);
		return;
	}

	writeJson(response, 404, {
		error: `Unhandled route: ${request.method} ${request.url}`,
	});
});

server.listen(port, '127.0.0.1', () => {
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Mock OpenAI provider failed to bind a TCP port.');
	}

	const readyPayload = {
		baseUrl: `http://127.0.0.1:${address.port}/v1`,
		debugUrl: `http://127.0.0.1:${address.port}/debug/requests`,
		modelId,
		pid: process.pid,
		port: address.port,
		recordedAt: new Date().toISOString(),
	};

	if (readyPath) {
		ensureDir(path.dirname(readyPath));
		fs.writeFileSync(readyPath, `${JSON.stringify(readyPayload, null, 2)}\n`);
	}

	process.stdout.write(`${JSON.stringify(readyPayload)}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		server.close(() => {
			process.exit(0);
		});
	});
}
