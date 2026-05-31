import { uiAutomationMcpTools } from '../mcp/uiAutomationMcpServer.js';

const tool = (name, description, properties = {}, required = []) => ({
  type: 'function',
  name,
  description,
  parameters: {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  },
});

const mcpToolToRealtimeTool = (mcpTool) => ({
  type: 'function',
  name: mcpTool.name,
  description: mcpTool.description,
  parameters: mcpTool.inputSchema,
});

export const realtimeTools = uiAutomationMcpTools.map(mcpToolToRealtimeTool);

export const legacyRealtimeTools = [
  tool('get_page_context', 'Obtiene un mapa semantico de la pagina actual: ruta, titulo, campos visibles, botones y acciones disponibles. Usala antes de actuar si no sabes que campos existen.'),
  tool(
    'find_ui_element',
    'Busca un campo, boton o seccion visible por texto humano, label, placeholder, alias o accion.',
    {
      query: { type: 'string', description: 'Texto que dijo el usuario, por ejemplo NIT, categoria, Guardar, nuevo producto.' },
      kind: { type: 'string', description: 'Opcional: field, button, action o any.' },
    },
    ['query'],
  ),
  tool(
    'click_element',
    'Hace click en un boton o accion visible. No usar para enviar formularios salvo confirmacion explicita del usuario.',
    {
      elementId: { type: 'string', description: 'Identificador devuelto por find_ui_element o get_page_context.' },
      message: { type: 'string', description: 'Mensaje visual opcional.' },
    },
    ['elementId'],
  ),
  tool(
    'focus_field',
    'Enfoca visualmente un campo del formulario. fieldId puede ser id tecnico, alias o texto humano devuelto por find_ui_element.',
    {
      fieldId: { type: 'string', description: 'Identificador del campo, por ejemplo nit o description.' },
      message: { type: 'string', description: 'Mensaje opcional para mostrar al usuario.' },
    },
    ['fieldId'],
  ),
  tool(
    'highlight_field',
    'Resalta un campo o seccion.',
    {
      fieldId: { type: 'string' },
      message: { type: 'string' },
    },
    ['fieldId'],
  ),
  tool(
    'fill_field',
    'Rellena un campo del formulario con un valor indicado por el usuario.',
    {
      fieldId: { type: 'string' },
      value: { type: 'string' },
    },
    ['fieldId', 'value'],
  ),
  tool(
    'show_tooltip',
    'Muestra una ayuda visual cerca de un campo.',
    {
      fieldId: { type: 'string' },
      message: { type: 'string' },
    },
    ['fieldId', 'message'],
  ),
  tool(
    'show_steps',
    'Muestra una guia paso a paso en pantalla.',
    {
      title: { type: 'string' },
      steps: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    ['title', 'steps'],
  ),
  tool('clear_assistant_ui', 'Limpia resaltados, tooltips o guias activas.'),
  tool('get_form_state', 'Obtiene el estado actual del formulario visible.'),
  tool('validate_form', 'Valida los campos visibles del formulario actual.'),
];
