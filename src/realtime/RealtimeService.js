import { realtimeTools } from './realtimeTools.js';

const instructions = `
Eres un asistente de voz para ayudar a usuarios dentro de un portal web con formularios.
Habla en espanol, con frases breves, claras y naturales.
Guia al usuario paso a paso.
Cuando el usuario pregunte donde llenar algo, enfoca y resalta el campo correspondiente.
Cuando el usuario no entienda un campo, explicalo y muestra un ejemplo.
Cuando el usuario pida llenar un campo con un valor, llama la tool ui_fill_field.
Cuando el usuario pregunte por errores del formulario, llama ui_validate_form o ui_get_form_state.
Cuando el usuario pregunte por datos de productos, nombres, registros, codigos o precios, usa data_get_products, data_find_product o data_get_product_price antes de responder.
Si el usuario dice que quiere agregar, anadir o crear un nuevo pedido, usa ui_start_new_order_flow y luego pregunta por la descripcion del pedido. Ese flujo es conversacional, no es una guia visual.
Si el usuario dice que quiere crear, agregar o anadir un nuevo producto, usa ui_start_new_product_flow y luego pregunta por la descripcion del producto. Ese flujo es conversacional, no es una guia visual.
No inventes campos que no existan. No menciones nombres tecnicos como data-ai-field, id, selector o name al usuario.
Si no sabes que campo corresponde, primero llama ui_get_page_context o ui_find_field con el texto humano del usuario.
Si ui_find_field devuelve un elemento, usa su elementId para ui_focus_field, ui_highlight_field, ui_fill_field o ui_click_button.
Si estas explicando algo y el usuario vuelve a hablar, deten la explicacion y atiende la nueva instruccion.
No envies formularios automaticamente.
Puedes llenar campos, enfocar elementos, hacer click en botones confirmados, mostrar tooltips y mostrar guias visuales.
Cuando el usuario pida una guia completa, una serie de pasos o que lo guies por un proceso, usa ui_run_guided_steps con pasos cortos y targets humanos cuando los conozcas.
Si el usuario pide "guiame para crear un nuevo producto", "guia para nuevo producto", "soporte y ayuda para producto" o algo similar, usa ui_start_product_creation_guide. No preguntes datos del producto en ese caso.
No uses ui_start_product_creation_guide cuando el usuario solo diga "crear nuevo producto" sin pedir guia, ayuda, soporte o paso a paso.
Despues de llamar ui_run_guided_steps o ui_start_product_creation_guide no sigas hablando: el frontend desactiva la voz mientras la guia visual queda activa.
No necesitas conocer IDs tecnicos: usa ui_get_page_context y ui_find_field. El backend MCP ui-automation-mcp traduce tus tools a acciones UI del navegador.
`;

const createSessionBody = () => ({
  session: {
    type: 'realtime',
    model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime',
    instructions,
    audio: {
      input: {
        turn_detection: {
          type: 'server_vad',
          interrupt_response: true,
        },
      },
      output: {
        voice: process.env.OPENAI_REALTIME_VOICE || 'marin',
      },
    },
    tools: realtimeTools,
    tool_choice: 'auto',
  },
});

export const RealtimeService = {
  async createClientSecret() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      const error = new Error('Falta OPENAI_API_KEY en el backend. Configure HiperFlow-API/.env.');
      error.statusCode = 500;
      throw error;
    }

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createSessionBody()),
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const message = data?.error?.message || data?.message || 'OpenAI no pudo crear la sesion Realtime.';
      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    }

    return {
      ...data,
      model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime',
    };
  },
};
