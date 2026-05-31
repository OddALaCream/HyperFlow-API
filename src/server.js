import http from 'node:http';
import { URL } from 'node:url';
import { loadEnv } from './config/env.js';
import { SupportAgentService } from './services/SupportAgentService.js';
import { GuideService } from './services/GuideService.js';
import { ValidationService } from './services/ValidationService.js';
import { InteractionLogService } from './services/InteractionLogService.js';
import { RealtimeService } from './realtime/RealtimeService.js';
import { acceptWebSocket } from './ws/websocket.js';
import { createUiAutomationRuntime } from './uiAutomation/createUiAutomationRuntime.js';
import { AssistantService } from './assistant/AssistantService.js';

loadEnv();

const RAG_RETRIEVE_URL = process.env.RAG_RETRIEVE_URL || 'http://localhost:8000/rag/retrieve';

const port = Number(process.env.PORT || 3001);
const uiAutomation = createUiAutomationRuntime();

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });

const compactText = (value, maxLength = 160) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const buildRagMessage = ({ query, pageContext, credentialState }) => {
  const contextLines = [];

  if (pageContext && typeof pageContext === 'object') {
    const page = pageContext;
    contextLines.push(`Pagina actual: ${page.path || 'desconocida'}.`);
    if (page.pageHeading) contextLines.push(`Encabezado visible: ${compactText(page.pageHeading)}.`);
    if (Array.isArray(page.sections) && page.sections.length) {
      contextLines.push(`Secciones visibles: ${page.sections.map((section) => compactText(section.label, 60)).slice(0, 6).join(', ')}.`);
    }
    if (Array.isArray(page.actions) && page.actions.length) {
      contextLines.push(`Acciones visibles: ${page.actions.map((action) => compactText(action.label, 60)).slice(0, 6).join(', ')}.`);
    }
  }

  if (credentialState && typeof credentialState === 'object') {
    const state = credentialState;
    contextLines.push(
      `Estado simulado de credenciales: ${state.status || 'desconocido'}; ` +
      `tiene credenciales: ${state.hasCredentials ? 'si' : 'no'}; ` +
      `entrega: ${state.deliveryState || 'desconocida'}; ` +
      `rol: ${state.userRole || 'desconocido'}.`,
    );
    if (state.note) contextLines.push(`Nota de simulacion: ${compactText(state.note)}.`);
  }

  if (!contextLines.length) return String(query || '');

  return [
    'Contexto actual del portal para recuperar SOPs relevantes:',
    ...contextLines,
    '',
    `Consulta del usuario: ${String(query || '')}`,
  ].join('\n');
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, {});
    return;
  }

  try {
    if (req.method === 'POST' && url.pathname === '/api/support-agent/chat') {
      const payload = await readBody(req);
      sendJson(res, 200, await SupportAgentService.chat(payload));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/realtime/session') {
      const session = await RealtimeService.createClientSecret();
      sendJson(res, 200, session);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/assistant/chat') {
      const payload = await readBody(req);
      const result = await AssistantService.chat(payload);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/knowledge/search') {
      const payload = await readBody(req);
      const message = buildRagMessage({
        query: payload.query,
        pageContext: payload.pageContext,
        credentialState: payload.credentialState,
      });
      const ragRes = await fetch(RAG_RETRIEVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, top_k: payload.top_k || 4 }),
      });
      const data = ragRes.ok ? await ragRes.json() : { chunks: [] };
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/mcp/ui-automation/tools') {
      sendJson(res, 200, {
        server: uiAutomation.mcpServer.name,
        connected_frontends: uiAutomation.bridge.hasClients() ? 1 : 0,
        tools: uiAutomation.mcpClient.listTools(),
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/guides/registro-producto') {
      sendJson(res, 200, GuideService.getRegistroProductoGuide());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/processes/registro-producto/validate') {
      const payload = await readBody(req);
      const result = ValidationService.validate(payload);
      InteractionLogService.add({
        type: 'validation',
        user_message: 'Validacion ejecutada',
        assistant_response: result.recommendation,
        intent: result.valid ? 'PRODUCT_READY' : 'ERROR_DETECTED',
        confidence: result.confidence,
        action_taken: result.valid ? 'PRODUCT_READY_TO_SAVE' : 'VALIDATE_FORM',
        metadata: result,
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/debug/interactions') {
      sendJson(res, 200, { interactions: InteractionLogService.list() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/debug/interactions') {
      const payload = await readBody(req);
      const interaction = InteractionLogService.add(payload);
      sendJson(res, 201, interaction);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    InteractionLogService.add({
      type: 'error',
      user_message: 'API error',
      assistant_response: error.message,
      intent: 'UNKNOWN',
      confidence: 0,
      action_taken: 'ERROR',
    });
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
});

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (url.pathname !== '/ws/ui-automation') {
    socket.destroy();
    return;
  }

  const client = acceptWebSocket(req, socket);
  uiAutomation.bridge.register(client);

  client.onMessage(async (message) => {
    if (message.type === 'ui_action_result') {
      uiAutomation.bridge.resolve(message.id, message.result);
      return;
    }

    if (message.type === 'mcp_tool_call') {
      const result = await uiAutomation.mcpClient.callTool(message.name, message.args || {});
      client.send({
        type: 'mcp_tool_result',
        id: message.id,
        result,
      });
    }
  });

  client.send({
    type: 'ui_automation_ready',
    server: uiAutomation.mcpServer.name,
    tools: uiAutomation.mcpClient.listTools().map((tool) => tool.name),
  });
});

server.listen(port, () => {
  console.log(`HiperFlow API listening on http://localhost:${port}`);
});
