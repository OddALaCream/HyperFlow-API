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
  tool('ui_run_guided_steps', 'Ejecuta una guia visual paso a paso en el frontend. Al iniciarse, el asistente de voz debe ocultarse y desactivarse hasta que la guia termine.', schema({
    title: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          message: { type: 'string' },
          target: { type: 'string', description: 'Texto humano o elementId del campo, boton o seccion a resaltar.' },
        },
        required: ['message'],
        additionalProperties: false,
      },
    },
  }, ['title', 'steps'])),
  tool('ui_start_new_product_flow', 'Inicia el flujo conversacional para crear o agregar un nuevo producto. Navega a Productos, presiona el boton Nuevo y devuelve la siguiente pregunta para pedir la descripcion. No ejecuta Soporte y Ayuda ni guia paso a paso.', schema()),
  tool('ui_start_product_creation_guide', 'SOLO para cuando el usuario pide explicitamente guia, soporte, ayuda o paso a paso para crear producto. Navega a Productos y ejecuta exactamente el boton Soporte y Ayuda. No usar si el usuario solo dice crear/agregar nuevo producto.', schema()),
  tool('ui_start_new_order_flow', 'Inicia el flujo conversacional para agregar un nuevo pedido. Navega al modulo de pedidos/AVD y devuelve la siguiente pregunta que la IA debe hacer al usuario.', schema()),
  tool('data_get_products', 'Devuelve una lista compacta de productos disponibles para que la IA pueda responder preguntas del usuario. Incluye nombre, barra, registro sanitario y precio si existe.', schema({
    limit: { type: 'number' },
  })),
  tool('data_find_product', 'Busca productos por nombre, codigo de barra o registro sanitario y devuelve coincidencias compactas.', schema({
    query: { type: 'string' },
    limit: { type: 'number' },
  }, ['query'])),
  tool('data_get_product_price', 'Busca un producto por nombre o codigo y devuelve su precio si esta registrado.', schema({
    query: { type: 'string' },
  }, ['query'])),
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
  ui_run_guided_steps: 'ui_run_guided_steps',
  ui_start_new_product_flow: 'ui_start_new_product_flow',
  ui_start_product_creation_guide: 'ui_start_product_creation_guide',
  ui_start_new_order_flow: 'ui_start_new_order_flow',
  data_get_products: 'data_get_products',
  data_find_product: 'data_find_product',
  data_get_product_price: 'data_get_product_price',
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
