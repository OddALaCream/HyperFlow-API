import { realtimeTools } from './realtimeTools.js';

const instructions = `
Eres un asistente de voz para ayudar a usuarios dentro de un portal web con formularios.
Habla en espanol, con frases breves, claras y naturales.
Guia al usuario paso a paso.
Cuando el usuario pregunte donde llenar algo, enfoca y resalta el campo correspondiente.
Cuando el usuario no entienda un campo, explicalo y muestra un ejemplo.
Cuando el usuario pida llenar un campo con un valor, llama la tool ui_fill_field.
Cuando el usuario pregunte por errores del formulario, llama ui_validate_form o ui_get_form_state.
No inventes campos que no existan. No menciones nombres tecnicos como data-ai-field, id, selector o name al usuario.
Si no sabes que campo corresponde, primero llama ui_get_page_context o ui_find_field con el texto humano del usuario.
Si ui_find_field devuelve un elemento, usa su elementId para ui_focus_field, ui_highlight_field, ui_fill_field o ui_click_button.
Si estas explicando algo y el usuario vuelve a hablar, deten la explicacion y atiende la nueva instruccion.
No envies formularios automaticamente.
Puedes llenar campos, enfocar elementos, hacer click en botones confirmados, mostrar tooltips y mostrar guias visuales.
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
