import { UiAutomationBridge } from './UiAutomationBridge.js';
import { createUiAutomationMcpServer } from '../mcp/uiAutomationMcpServer.js';
import { UiAutomationMcpClient } from '../mcp/UiAutomationMcpClient.js';

export const createUiAutomationRuntime = () => {
  const bridge = new UiAutomationBridge();
  const mcpServer = createUiAutomationMcpServer({ bridge });
  const mcpClient = new UiAutomationMcpClient(mcpServer);

  return {
    bridge,
    mcpServer,
    mcpClient,
  };
};
