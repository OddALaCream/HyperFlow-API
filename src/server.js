import http from 'node:http';
import { URL } from 'node:url';
import { SupportAgentService } from './services/SupportAgentService.js';
import { GuideService } from './services/GuideService.js';
import { ValidationService } from './services/ValidationService.js';
import { InteractionLogService } from './services/InteractionLogService.js';

const port = Number(process.env.PORT || 3001);

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, {});
    return;
  }

  try {
    if (req.method === 'POST' && url.pathname === '/api/support-agent/chat') {
      const payload = await readBody(req);
      sendJson(res, 200, SupportAgentService.chat(payload));
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
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`HiperFlow API listening on http://localhost:${port}`);
});
