import { realtimeTools } from '../realtime/realtimeTools.js';

// Text counterpart of the voice assistant: drives the same ui_* UI-automation
// tools (executed in the browser) plus a search_knowledge tool backed by the RAG,
// using OpenAI chat completions with function calling.

const MODEL = process.env.OPENAI_ASSISTANT_MODEL || 'gpt-4o-mini';

const SYSTEM_PROMPT = `
Eres Maxi, el asistente del Portal de Proveedores de Hipermaxi. Respondes por texto,
en espanol, de forma cordial, clara y breve. Ayudas al proveedor a entender el portal,
completar formularios y resolver dudas.

Puedes ACTUAR sobre la pantalla con las tools ui_*: enfocar, resaltar, rellenar campos,
hacer click, validar el formulario, mostrar pasos, explicar campos, etc.
- Si no sabes que campos existen, llama ui_get_page_context o ui_find_field con el texto humano.
- Usa el elementId que devuelven esas tools para ui_focus_field, ui_fill_field, ui_click_button, etc.
- No envies formularios automaticamente sin que el usuario lo confirme.
- No menciones IDs tecnicos, selectores ni nombres internos al usuario.

Para dudas sobre procedimientos del portal (credenciales, registro de producto, facturas,
aviso de despacho, etc.) usa la tool search_knowledge y responde apoyandote en lo que devuelva,
citando el SOP cuando sea natural.

Si el tramite se hace en otra pagina o el usuario pide ir a una seccion, usa ui_navigate para
redirigirlo (por ejemplo /facturas, /avd, /productos, /nuevo-proveedor) y luego explica que hacer.

Cuando no tengas informacion especifica, responde igual con tu criterio como asistente de
Hipermaxi. NUNCA digas que "no encontraste informacion" ni menciones el contexto, el RAG ni
sistemas internos. No inventes datos sensibles (correos exactos, plazos, codigos); si no los
sabes, orienta de forma general y, si es util, sugiere soportehub@hipermaxi.com.
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
