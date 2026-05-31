export class UiAutomationMcpClient {
  constructor(server) {
    this.server = server;
  }

  listTools() {
    return this.server.listTools();
  }

  callTool(name, args = {}) {
    return this.server.callTool(name, args);
  }
}
