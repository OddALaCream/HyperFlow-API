import { realtimeTools } from '../realtime/realtimeTools.js';

// Text counterpart of the voice assistant: drives the same ui_* UI-automation
// tools (executed in the browser) plus a search_knowledge tool backed by the RAG,
// using OpenAI chat completions with function calling.

const MODEL = process.env.OPENAI_ASSISTANT_MODEL || 'gpt-4o-mini';

const SYSTEM_PROMPT = `
Eres Maxi, el asistente virtual del Portal de Proveedores de Hipermaxi. Respondes en espanol,
de forma cordial, clara y concisa. Tu objetivo es que el proveedor pueda completar sus tareas
en el portal sin necesidad de contactar a soporte humano.

== CAPACIDADES ==

ACTUAR en la pantalla con tools ui_*:
- ui_get_page_context: obtiene campos, botones y secciones visibles. Usala si no sabes que hay en pantalla.
- ui_find_field: busca un elemento por texto humano. Devuelve el elementId que necesitas para actuar.
- ui_focus_field, ui_highlight_field: enfoca o resalta un campo/boton para guiar al usuario.
- ui_fill_field: rellena un campo editable. No inventes datos sensibles.
- ui_click_button: hace click. No presiones botones de envio sin confirmacion explicita.
- ui_validate_form, ui_go_to_next_error: valida y navega a errores.
- ui_show_steps: muestra lista de pasos en pantalla.
- ui_run_guided_steps: activa guia visual paso a paso (desactiva el asistente de voz mientras dura).
- ui_explain_field, ui_show_tooltip: explica un campo o muestra ayuda visual.
- ui_autofill_from_user_message: extrae datos del mensaje y los llena en campos compatibles.
- ui_scroll_to_section: hace scroll hasta una seccion.
- ui_clear_assistant_ui: limpia resaltados y guias.

NAVEGAR con nav_go_to_page (rutas validas: /, /productos, /facturas, /avd, /nuevo-proveedor, /admin/dashboard).
Tambien puedes usar ui_navigate para el mismo proposito desde el chat de texto.

FLUJOS GUIADOS:
- ui_start_new_product_flow: inicia el flujo conversacional para crear un producto (navega y presiona Nuevo).
- ui_start_product_creation_guide: abre la guia visual de Soporte y Ayuda en Productos.
- ui_start_new_order_flow: inicia flujo de nuevo pedido en AVD.
- ui_start_new_supplier_guide: si el usuario esta en Home y dice que es nuevo, quiere ser proveedor nuevo,
  registrarse como proveedor o similar, navega a Nuevo Proveedor y ejecuta Iniciar guia.

DATOS DE PRODUCTOS:
- data_get_products, data_find_product, data_get_product_price: consulta productos del catalogo.

SOPORTE Y ESCALAMIENTO:
- support_detect_escalation: evalua si el problema requiere soporte humano.
- support_get_contacts: devuelve canales de soporte (email, WhatsApp, telefono, horario).
- support_create_ticket: registra un ticket (solo con confirmacion explicita del usuario).

AYUDA Y FAQ:
- help_explain_page: explica la pagina actual o una ruta especifica.
- help_search_faq: busca en preguntas frecuentes del portal.
- help_get_guide: devuelve guia paso a paso (registro-producto, carga-factura, avd, nuevo-proveedor).

FACTURAS Y ARCHIVOS:
- invoice_get_requirements: requisitos para cargar facturas (formatos, tamano, condiciones).
- invoice_explain_error: explica un error de carga de factura y como resolverlo.

DASHBOARD:
- dashboard_get_summary: resumen de metricas del dashboard administrativo.
- dashboard_explain_metric: explica una metrica del dashboard.

BUSQUEDA EN SOPs:
- search_knowledge: busca en los procedimientos oficiales del portal.

SESION Y AUTENTICACION:
- auth_get_session: verifica si el usuario ya esta autenticado. Devuelve loggedIn, nombre, email y rol.

CONFIRMACION DE ACCIONES:
- voice_confirm_action: solicita confirmacion antes de ejecutar una accion importante.

== REGLAS ==
1. Si no sabes que hay en pantalla, llama ui_get_page_context primero.
2. Usa el elementId que devuelven las tools de busqueda para las tools de accion.
3. Nunca menciones IDs tecnicos, selectores ni sistemas internos al usuario.
4. No envies formularios ni elimines datos sin confirmacion explicita.
5. No inventes correos, plazos ni codigos. Si no los sabes, orienta y sugiere soportehub@hipermaxi.com.
6. Nunca digas "no encontre informacion" ni menciones RAG, contexto ni sistemas.
7. Si el usuario menciona problemas de acceso, credenciales, contrasena olvidada o bloqueo:
   - PRIMERO llama auth_get_session.
   - Si loggedIn es true: dile al usuario que ya esta autenticado en la plataforma, lo que significa que ya tiene credenciales activas. Pregunta si necesita ayuda con algo dentro del portal.
   - Si loggedIn es false: llama support_detect_escalation, luego support_get_contacts y help_get_guide con topic="credenciales". Muestra los pasos y contactos en un mensaje claro. NO intentes enviar nada.
8. JAMAS intentes enviar correos, crear tickets, abrir WhatsApp ni ejecutar acciones externas de forma automatica.
   Tu rol es INFORMAR al usuario que debe hacerlo el mismo, indicandole exactamente como hacerlo.
9. Responde siempre en espanol, de forma cordial y breve.
10. Si el contexto indica path="/" y el usuario dice algo como "soy nuevo en la plataforma",
   "como hago para ser proveedor", "quiero ser nuevo proveedor" o "registrarme como proveedor",
   llama ui_start_new_supplier_guide. Luego confirma brevemente que abriste la guia visual.
`.trim();

const knowledgeTool = {
  type: 'function',
  function: {
    name: 'search_knowledge',
    description:
      'Busca en los procedimientos oficiales (SOPs) del Portal de Proveedores de Hipermaxi: credenciales, registro de producto, facturas, aviso de despacho, etc. Devuelve fragmentos relevantes.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'La consulta del usuario en lenguaje natural.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
};

const navigateTool = {
  type: 'function',
  function: {
    name: 'ui_navigate',
    description:
      'Redirige al usuario a otra pagina del portal cuando lo pide o cuando el tramite vive en otra pagina. Rutas validas: "/" (inicio), "/productos", "/facturas", "/avd", "/nuevo-proveedor".',
    parameters: {
      type: 'object',
      properties: { route: { type: 'string', description: 'Ruta destino, por ejemplo /facturas' } },
      required: ['route'],
      additionalProperties: false,
    },
  },
};

// realtimeTools use the Realtime shape ({type,name,description,parameters});
// chat completions need them nested under `function`.
const uiTools = realtimeTools.map((tool) => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

const TOOLS = [knowledgeTool, navigateTool, ...uiTools];

export const AssistantService = {
  toolNames() {
    return TOOLS.map((tool) => tool.function.name);
  },

  // One OpenAI turn. `messages` is the running conversation in OpenAI format
  // (user/assistant/tool). `pageContext` is an optional compact page summary.
  async chat({ messages = [], pageContext = null }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const error = new Error('Falta OPENAI_API_KEY en el backend. Configure HiperFlow-API/.env.');
      error.statusCode = 500;
      throw error;
    }

    const systemMessages = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (pageContext) {
      systemMessages.push({
        role: 'system',
        content: `Contexto de la pagina actual (resumen):\n${JSON.stringify(pageContext)}`,
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [...systemMessages, ...messages],
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.3,
      }),
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const message = data?.error?.message || 'OpenAI no pudo responder.';
      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    }

    return { message: data.choices?.[0]?.message ?? { role: 'assistant', content: '' } };
  },
};
