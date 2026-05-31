import { randomUUID } from 'node:crypto';

export class UiAutomationBridge {
  constructor() {
    this.clients = new Set();
    this.pending = new Map();
  }

  register(client) {
    this.clients.add(client);
    client.onClose(() => {
      this.clients.delete(client);
    });
  }

  hasClients() {
    return this.clients.size > 0;
  }

  callFrontend(action, args = {}, timeoutMs = 8000) {
    const client = [...this.clients].at(-1);
    if (!client) {
      return Promise.resolve({
        ok: false,
        message: 'No hay frontend conectado al WebSocket de automatizacion UI.',
      });
    }

    const id = randomUUID();

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, message: `Timeout ejecutando ${action}.` });
      }, timeoutMs);

      this.pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });

      client.send({
        type: 'ui_action_request',
        id,
        action,
        args,
      });
    });
  }

  resolve(id, result) {
    const callback = this.pending.get(id);
    if (!callback) return false;
    this.pending.delete(id);
    callback(result);
    return true;
  }
}
