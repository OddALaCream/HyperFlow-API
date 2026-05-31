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
  tool('ui_start_new_supplier_guide', 'Cuando el usuario esta en Home y dice que es nuevo en la plataforma, quiere ser nuevo proveedor, registrarse como proveedor o similar. Navega a /nuevo-proveedor y ejecuta el boton Iniciar guia.', schema()),
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

  // --- Navegacion ---
  tool('nav_go_to_page', 'Navega a una seccion del portal. Valida que la ruta exista antes de navegar. Rutas validas: /, /productos, /facturas, /avd, /nuevo-proveedor, /admin/dashboard.', schema({
    route: { type: 'string', description: 'Ruta destino, por ejemplo /facturas' },
    reason: { type: 'string', description: 'Mensaje opcional para mostrar al usuario.' },
  }, ['route'])),

  // --- Soporte y escalamiento ---
  tool('support_detect_escalation', 'Evalua si el problema del usuario requiere escalar a soporte humano y devuelve canal recomendado.', schema({
    reason: { type: 'string', description: 'Descripcion del problema del usuario.' },
  }, ['reason'])),
  tool('support_get_contacts', 'Devuelve los canales y contactos de soporte de Hipermaxi (email, WhatsApp, telefono, horario).', schema()),
  tool('support_create_ticket', 'Registra un ticket de soporte con la descripcion del problema. Usar solo con confirmacion explicita del usuario.', schema({
    issue: { type: 'string', description: 'Descripcion detallada del problema.' },
    priority: { type: 'string', description: 'low, medium o high. Por defecto medium.' },
  }, ['issue'])),

  // --- Ayuda y FAQ ---
  tool('help_explain_page', 'Explica el proposito, acciones y formularios de la pagina actual o de una ruta especifica.', schema({
    route: { type: 'string', description: 'Ruta opcional. Si se omite, usa la pagina actual del usuario.' },
  })),
  tool('help_search_faq', 'Busca en las preguntas frecuentes del portal y devuelve las respuestas mas relevantes.', schema({
    query: { type: 'string', description: 'Pregunta o tema del usuario.' },
  }, ['query'])),
  tool('help_get_guide', 'Devuelve una guia paso a paso para un proceso del portal. Temas: registro-producto, carga-factura, avd, nuevo-proveedor.', schema({
    topic: { type: 'string', description: 'Proceso que el usuario quiere aprender.' },
  }, ['topic'])),

  // --- Facturas y archivos ---
  tool('invoice_get_requirements', 'Devuelve los requisitos, formatos y condiciones para cargar facturas correctamente.', schema()),
  tool('invoice_explain_error', 'Explica un tipo de error comun al cargar facturas y como resolverlo.', schema({
    errorType: { type: 'string', description: 'Tipo de error: formato, tamano, duplicada, proveedor-no-registrado, orden-no-encontrada, fecha-invalida.' },
  })),

  // --- Dashboard administrativo ---
  tool('dashboard_get_summary', 'Devuelve un resumen con las metricas principales del dashboard administrativo.', schema()),
  tool('dashboard_explain_metric', 'Explica el significado de una metrica del dashboard.', schema({
    metric: { type: 'string', description: 'Nombre de la metrica: facturas-cargadas, productos-registrados, proveedores-activos, tasa-completado, interacciones-ia, tickets-soporte.' },
  }, ['metric'])),

  // --- Voz y confirmacion ---
  tool('voice_confirm_action', 'Solicita confirmacion explicita del usuario antes de ejecutar una accion importante o irreversible.', schema({
    action: { type: 'string', description: 'Nombre de la accion que requiere confirmacion.' },
    description: { type: 'string', description: 'Descripcion de lo que hara la accion.' },
  }, ['action', 'description'])),

  // --- Sesion y autenticacion ---
  tool('auth_get_session', 'Verifica si el usuario ya esta autenticado en el portal. Devuelve loggedIn, nombre, email y rol. Usar antes de hablar de credenciales o acceso.', schema()),
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
  ui_start_new_supplier_guide: 'ui_start_new_supplier_guide',
  data_get_products: 'data_get_products',
  data_find_product: 'data_find_product',
  data_get_product_price: 'data_get_product_price',
  ui_clear_assistant_ui: 'ui_clear_assistant_ui',
  ui_scroll_to_section: 'ui_scroll_to_section',
  ui_explain_field: 'ui_explain_field',
  ui_autofill_from_user_message: 'ui_autofill_from_user_message',
  ui_perform_task: 'ui_perform_task',
  nav_go_to_page: 'nav_go_to_page',
  support_detect_escalation: 'support_detect_escalation',
  support_get_contacts: 'support_get_contacts',
  support_create_ticket: 'support_create_ticket',
  help_explain_page: 'help_explain_page',
  help_search_faq: 'help_search_faq',
  help_get_guide: 'help_get_guide',
  invoice_get_requirements: 'invoice_get_requirements',
  invoice_explain_error: 'invoice_explain_error',
  dashboard_get_summary: 'dashboard_get_summary',
  dashboard_explain_metric: 'dashboard_explain_metric',
  voice_confirm_action: 'voice_confirm_action',
  auth_get_session: 'auth_get_session',
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
