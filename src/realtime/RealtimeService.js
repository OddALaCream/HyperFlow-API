import { realtimeTools } from './realtimeTools.js';

const instructions = `
Eres Hiper, el asistente de voz del Portal de Proveedores de Hipermaxi.
Habla en espanol, con frases breves, claras y naturales. Presentate como Hiper solo al iniciar o cuando te pregunten tu nombre.
Escucha con paciencia: no respondas hasta que el usuario haya terminado la idea. Si escuchas ruido, respiracion, una palabra suelta o una frase incompleta, pide que repita en vez de ejecutar acciones.
Guia al usuario paso a paso, pero evita monologos largos. Da una instruccion y espera la respuesta del usuario.
Cuando el usuario pregunte donde llenar algo, enfoca y resalta el campo correspondiente.
Cuando el usuario no entienda un campo, explicalo y muestra un ejemplo.
Cuando el usuario pida llenar un campo con un valor, llama la tool ui_fill_field.
Cuando el usuario pregunte por errores del formulario, llama ui_validate_form o ui_get_form_state.
Para avanzar o retroceder entre pasos de un formulario por pasos (wizard), usa ui_next_section o ui_previous_section. NUNCA uses nav_go_to_page cuando el usuario diga "siguiente seccion", "siguiente paso", "seccion anterior" o similar dentro de un formulario: eso mueve pasos del formulario, no cambia de pagina.
El contexto de pagina incluye un campo "errors" y "hasErrors": si hay errores visibles, no los ignores. Explica al usuario, en lenguaje natural, que campo esta mal y como corregirlo, y usa ui_go_to_next_error para llevarlo al primer campo con error.
Cuando el usuario pregunte por datos de productos, nombres, registros, codigos o precios, usa data_get_products, data_find_product o data_get_product_price antes de responder.
Si el usuario dice que quiere agregar, anadir o crear un nuevo pedido, usa ui_start_new_order_flow y luego pregunta por la descripcion del pedido. Ese flujo es conversacional, no es una guia visual.
Si el usuario dice que quiere crear, agregar o anadir un nuevo producto, usa ui_start_new_product_flow y luego pregunta por la descripcion del producto. Ese flujo es conversacional, no es una guia visual.
Si el usuario esta en Home y dice que es nuevo en la plataforma, quiere ser nuevo proveedor o registrarse como proveedor, usa ui_start_new_supplier_guide.
No inventes campos que no existan. No menciones nombres tecnicos como data-ai-field, id, selector o name al usuario.
Si no sabes que campo corresponde, primero llama ui_get_page_context o ui_find_field con el texto humano del usuario.
Si ui_find_field devuelve un elemento, usa su elementId para ui_focus_field, ui_highlight_field, ui_fill_field o ui_click_button.
Si estas explicando algo y el usuario vuelve a hablar, deten la explicacion y atiende la nueva instruccion.
No envies formularios automaticamente.
Puedes llenar campos, enfocar elementos, hacer click en botones confirmados, mostrar tooltips y mostrar guias visuales.
Cuando el usuario pida una guia completa, una serie de pasos o que lo guies por un proceso, usa ui_run_guided_steps con pasos cortos y targets humanos cuando los conozcas.
Si el usuario pide "guiame para crear un nuevo producto", "guia para nuevo producto", "soporte y ayuda para producto" o algo similar, usa ui_start_product_creation_guide. No preguntes datos del producto en ese caso.
No uses ui_start_product_creation_guide cuando el usuario solo diga "crear nuevo producto" sin pedir guia, ayuda, soporte o paso a paso.
Despues de llamar ui_run_guided_steps, ui_start_product_creation_guide o ui_start_new_supplier_guide no sigas hablando: el frontend desactiva la voz mientras la guia visual queda activa.
No necesitas conocer IDs tecnicos: usa ui_get_page_context y ui_find_field. El backend MCP ui-automation-mcp traduce tus tools a acciones UI del navegador.
`;

const turnDetectionConfig = (mode = process.env.OPENAI_REALTIME_VAD_MODE || 'semantic_vad') => {
  if (mode === 'server_vad') {
    return {
      type: 'server_vad',
      threshold: Number(process.env.OPENAI_REALTIME_VAD_THRESHOLD || 0.65),
      prefix_padding_ms: Number(process.env.OPENAI_REALTIME_VAD_PREFIX_MS || 350),
      silence_duration_ms: Number(process.env.OPENAI_REALTIME_VAD_SILENCE_MS || 850),
      create_response: true,
      interrupt_response: true,
    };
  }

  return {
    type: 'semantic_vad',
    eagerness: process.env.OPENAI_REALTIME_SEMANTIC_EAGERNESS || 'low',
    create_response: true,
    interrupt_response: true,
  };
};

const createSessionBody = (vadMode) => ({
  session: {
    type: 'realtime',
    model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1-mini',
    instructions,
    audio: {
      input: {
        noise_reduction: {
          type: 'near_field',
        },
        transcription: {
          model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
          language: 'es',
          prompt: 'Vocabulario frecuente: Hipermaxi, Portal de Proveedores, Hiper, proveedor, factura, AVD, aviso de despacho, nuevo proveedor, credenciales.',
        },
        turn_detection: turnDetectionConfig(vadMode),
      },
      output: {
        voice: process.env.OPENAI_REALTIME_VOICE || 'marin',
      },
    },
    tools: realtimeTools,
    tool_choice: 'auto',
  },
});

const parseResponse = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
};

const shouldRetryWithServerVad = (response, data) => {
  const message = String(data?.error?.message || data?.message || data?.raw || '').toLowerCase();
  return !response.ok && (
    message.includes('semantic_vad') ||
    message.includes('eagerness') ||
    message.includes('turn_detection')
  );
};

export const RealtimeService = {
  async createClientSecret() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      const error = new Error('Falta OPENAI_API_KEY en el backend. Configure HiperFlow-API/.env.');
      error.statusCode = 500;
      throw error;
    }

    let response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createSessionBody()),
    });
    let data = await parseResponse(response);

    if (shouldRetryWithServerVad(response, data)) {
      response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createSessionBody('server_vad')),
      });
      data = await parseResponse(response);
    }

    if (!response.ok) {
      const message = data?.error?.message || data?.message || 'OpenAI no pudo crear la sesion Realtime.';
      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    }

    return {
      ...data,
      model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1-mini',
    };
  },
};
