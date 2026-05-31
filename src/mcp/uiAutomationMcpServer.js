const schema = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const tool = (name, description, inputSchema = schema()) => ({
  name,
  description,
  inputSchema,
});

export const uiAutomationMcpTools = [
  tool('ui_get_page_context', 'Devuelve un resumen compacto de pagina, campos, botones, secciones y errores visibles. No devuelve todo el DOM.'),
  tool('ui_get_form_state', 'Devuelve estado compacto de formularios visibles.', schema()),
  tool('ui_find_field', 'Busca campos, botones o secciones por texto humano.', schema({
    query: { type: 'string' },
    kind: { type: 'string', description: 'field, button, action, section o any' },
  }, ['query'])),
  tool('ui_focus_field', 'Enfoca un campo por elementId o texto humano.', schema({
    fieldId: { type: 'string' },
    message: { type: 'string' },
  }, ['fieldId'])),
  tool('ui_highlight_field', 'Resalta un campo o seccion.', schema({
    fieldId: { type: 'string' },
    message: { type: 'string' },
  }, ['fieldId'])),
  tool('ui_show_tooltip', 'Muestra tooltip cerca de un campo.', schema({
    fieldId: { type: 'string' },
    message: { type: 'string' },
  }, ['fieldId', 'message'])),
  tool('ui_fill_field', 'Llena un campo editable.', schema({
    fieldId: { type: 'string' },
    value: { type: 'string' },
  }, ['fieldId', 'value'])),
  tool('ui_click_button', 'Hace click en un boton o accion visible. Requiere confirmacion para acciones de envio.', schema({
    elementId: { type: 'string' },
    message: { type: 'string' },
  }, ['elementId'])),
  tool('ui_validate_form', 'Valida formulario visible y devuelve errores compactos.'),
  tool('ui_go_to_next_error', 'Enfoca el siguiente error visible del formulario.'),
  tool('ui_show_steps', 'Muestra una guia paso a paso.', schema({
    title: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
  }, ['title', 'steps'])),
  tool('ui_clear_assistant_ui', 'Limpia resaltados, tooltips y paneles.'),
  tool('ui_scroll_to_section', 'Hace scroll a una seccion visible.', schema({
    sectionId: { type: 'string' },
    message: { type: 'string' },
  }, ['sectionId'])),
  tool('ui_explain_field', 'Explica un campo usando label, placeholder, ayuda y estado actual.', schema({
    fieldId: { type: 'string' },
  }, ['fieldId'])),
  tool('ui_autofill_from_user_message', 'Extrae datos obvios del mensaje del usuario y rellena campos compatibles.', schema({
    message: { type: 'string' },
  }, ['message'])),
  tool('ui_perform_task', 'Ejecuta una tarea UI compacta por intencion humana.', schema({
    task: { type: 'string' },
    value: { type: 'string' },
  }, ['task'])),
];

const toolToFrontendAction = {
  ui_get_page_context: 'ui_get_page_context',
  ui_get_form_state: 'ui_get_form_state',
  ui_find_field: 'ui_find_field',
  ui_focus_field: 'ui_focus_field',
  ui_highlight_field: 'ui_highlight_field',
  ui_show_tooltip: 'ui_show_tooltip',
  ui_fill_field: 'ui_fill_field',
  ui_click_button: 'ui_click_button',
  ui_validate_form: 'ui_validate_form',
  ui_go_to_next_error: 'ui_go_to_next_error',
  ui_show_steps: 'ui_show_steps',
  ui_clear_assistant_ui: 'ui_clear_assistant_ui',
  ui_scroll_to_section: 'ui_scroll_to_section',
  ui_explain_field: 'ui_explain_field',
  ui_autofill_from_user_message: 'ui_autofill_from_user_message',
  ui_perform_task: 'ui_perform_task',
};

export const createUiAutomationMcpServer = ({ bridge }) => ({
  name: 'ui-automation-mcp',

  listTools() {
    return uiAutomationMcpTools;
  },

  async callTool(name, args = {}) {
    const action = toolToFrontendAction[name];
    if (!action) {
      return { ok: false, message: `Tool MCP no registrada: ${name}` };
    }
    return bridge.callFrontend(action, args);
  },
});
