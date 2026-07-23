'use strict';

const DEFAULT_MODEL = 'gpt-5.6-terra';
const COLORS = ['#8891A5', '#4FD1C5', '#F5A623', '#9B8FE0', '#4ADE80'];

class BoardGenerationError extends Error {
  constructor(message, status = 502, code = 'generation_failed') {
    super(message);
    this.name = 'BoardGenerationError';
    this.status = status;
    this.code = code;
  }
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeBrief(input) {
  const body = input && typeof input === 'object' ? input : {};
  const brief = {
    goal: text(body.goal, 2000),
    description: text(body.description, 2000),
    workflowHint: text(body.workflowHint, 500),
    lanesHint: text(body.lanesHint, 500),
    taskCount: Number.isInteger(body.taskCount) ? body.taskCount : 6,
    constraints: text(body.constraints, 2000)
  };
  if (!brief.goal) throw new BoardGenerationError('goal is required', 400, 'invalid_brief');
  if (brief.taskCount < 1 || brief.taskCount > 50) {
    throw new BoardGenerationError('taskCount must be an integer from 1 to 50', 400, 'invalid_brief');
  }
  return brief;
}

const BOARD_BUNDLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'board', 'workflow', 'lanes', 'library', 'tasks'],
  properties: {
    schemaVersion: { type: 'integer', const: 2 },
    board: { type: 'object', additionalProperties: false, required: ['title', 'description'], properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 }, description: { type: 'string', maxLength: 500 }
    } },
    workflow: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['label', 'accent', 'isComplete'], properties: {
      label: { type: 'string', minLength: 1, maxLength: 40 }, accent: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }, isComplete: { type: 'boolean' }
    } } },
    lanes: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['label', 'accent'], properties: {
      label: { type: 'string', minLength: 1, maxLength: 40 }, accent: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
    } } },
    library: { type: 'array', maxItems: 0 },
    tasks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'repoName', 'repoUrl', 'agent', 'agentCustom', 'notes', 'tags', 'columnIndex', 'laneIndex'], properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 }, repoName: { type: 'string' }, repoUrl: { type: 'string' }, agent: { type: 'string' }, agentCustom: { type: 'string' }, notes: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, columnIndex: { type: 'integer', minimum: 0 }, laneIndex: { type: 'integer', minimum: 0 }
    } } }
  }
};

function responseText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  const content = response?.output?.flatMap((item) => item.content || []) || [];
  const part = content.find((item) => typeof item.text === 'string');
  return part?.text || '';
}

async function generateOpenAiBoard(brief) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new BoardGenerationError('AI board generation is not configured: set OPENAI_API_KEY', 503, 'not_configured');
  const model = process.env.AI_BOARD_MODEL || DEFAULT_MODEL;
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        instructions: 'Create a practical kanban board draft. Return only the requested JSON. Use workflow and lane indices that point to the arrays. Do not include library entries, attachments, ids, or timestamps.',
        input: `Guided board brief:\n${JSON.stringify(brief)}`,
        text: { format: { type: 'json_schema', name: 'board_bundle', strict: true, schema: BOARD_BUNDLE_SCHEMA } }
      })
    });
  } catch (err) {
    throw new BoardGenerationError('AI provider request failed', 502, 'provider_unavailable');
  }
  if (!response.ok) throw new BoardGenerationError('AI provider could not generate a board', 502, 'provider_error');
  let parsed;
  try { parsed = JSON.parse(responseText(await response.json())); }
  catch (_) { throw new BoardGenerationError('AI provider returned an invalid board draft', 502, 'invalid_provider_output'); }
  return { bundle: parsed, provider: 'openai', model };
}

function fixtureBoard(brief) {
  const workflow = [
    { label: 'backlog', accent: COLORS[0], isComplete: false },
    { label: 'in progress', accent: COLORS[1], isComplete: false },
    { label: 'done', accent: COLORS[4], isComplete: true }
  ];
  const lanes = [{ label: 'general', accent: COLORS[1] }];
  return { bundle: {
    schemaVersion: 2, board: { title: brief.goal.slice(0, 200), description: brief.description }, workflow, lanes, library: [],
    tasks: Array.from({ length: brief.taskCount }, (_, i) => ({ title: `Task ${i + 1}: ${brief.goal.slice(0, 150)}`, repoName: '', repoUrl: '', agent: '', agentCustom: '', notes: brief.constraints, tags: [], columnIndex: 0, laneIndex: 0 }))
  }, provider: 'fixture', model: 'test' };
}

async function generateBoardDraft(input) {
  const brief = normalizeBrief(input);
  const provider = (process.env.AI_BOARD_PROVIDER || 'openai').toLowerCase();
  if (provider === 'openai') return { brief, ...(await generateOpenAiBoard(brief)) };
  if (provider === 'fixture' && process.env.NODE_ENV === 'test') return { brief, ...fixtureBoard(brief) };
  throw new BoardGenerationError(`Unsupported AI board provider: ${provider}`, 503, 'unsupported_provider');
}

module.exports = { BoardGenerationError, normalizeBrief, generateBoardDraft, BOARD_BUNDLE_SCHEMA };
