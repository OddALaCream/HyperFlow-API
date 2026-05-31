import { KnowledgeService } from './KnowledgeService.js';
import { ValidationService } from './ValidationService.js';
import { InteractionLogService } from './InteractionLogService.js';

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const includesAny = (message, terms) => terms.some((term) => message.includes(term));

const detectIntent = (message) => {
  const text = normalize(message);

  if (includesAny(text, ['guia', 'guiame', 'paso a paso', 'ayudame a registrar'])) {
    return 'START_GUIDE';
  }
  if (includesAny(text, ['guardar', 'grabar', 'no puedo registrar', 'no registra', 'error'])) {
    return 'PRODUCT_SAVE_ERROR';
  }
  if (includesAny(text, ['no aparece', 'no se registro', 'no registrado', 'producto no esta'])) {
    return 'PRODUCT_NOT_REGISTERED';
  }
  if (includesAny(text, ['obligatorio', 'falta', 'faltan', 'incompleto', 'campo'])) {
    return 'MISSING_REQUIRED_FIELDS';
  }
  if (includesAny(text, ['formato', 'pdf', 'word', 'excel', 'jpg', 'png', 'jpeg'])) {
    return 'INVALID_IMAGE_FORMAT';
  }
  if (includesAny(text, ['imagen', 'foto', 'subir archivo', 'cargar archivo'])) {
    return 'IMAGE_NOT_UPLOADED';
  }
  if (includesAny(text, ['tecnica', 'dimensiones', 'etiqueta', 'registro sanitario'])) {
    return 'TECHNICAL_INFO_INCOMPLETE';
  }
  if (includesAny(text, ['que poner', 'que significa', 'codigo de barra', 'codigo interno', 'unidad de medida'])) {
    return 'FIELD_EXPLANATION';
  }

  return 'UNKNOWN';
};

const getNextAction = (intent) => {
  if (intent === 'START_GUIDE') return 'START_GUIDE';
  if (['PRODUCT_SAVE_ERROR', 'MISSING_REQUIRED_FIELDS', 'INVALID_IMAGE_FORMAT', 'IMAGE_NOT_UPLOADED'].includes(intent)) {
    return 'VALIDATE_FORM';
  }
  return 'ANSWER_ONLY';
};

const fieldMessages = {
  description: 'descripcion',
  internalCode: 'codigo interno proveedor',
  barcode: 'codigo de barra',
  label: 'etiqueta',
  dimensions: 'dimensiones',
  images: 'imagenes en formato JPG o PNG',
  price: 'precio mayor a 0',
  unit: 'unidad de medida',
};

const answerFromValidation = (validation) => {
  if (validation.valid) {
    return 'El formulario tiene los datos obligatorios completos y al menos una imagen valida JPG o PNG. Puede presionar Guardar. Verifique solo si este producto requiere registro sanitario.';
  }

  const fields = [...new Set(validation.errors.map((error) => fieldMessages[error.field] || error.field))];
  return `Detecte estos puntos antes de guardar: ${fields.join(', ')}. Corrija esos campos y vuelva a intentar. La imagen debe ser JPG o PNG; PDF, Word o Excel no son permitidos.`;
};

const buildAnswer = ({ intent, message, chunks, validation }) => {
  const text = normalize(message);

  if (validation && validation.errors.length > 0) {
    return answerFromValidation(validation);
  }

  if (intent === 'PRODUCT_SAVE_ERROR') {
    return 'Voy a ayudarte a revisar el formulario. Primero validaremos si la descripcion, codigo interno proveedor, codigo de barra, etiqueta, dimensiones, precio, unidad de medida e imagenes estan completos. La imagen debe estar en formato JPG o PNG.';
  }
  if (intent === 'INVALID_IMAGE_FORMAT' || text.includes('formato')) {
    return 'La imagen del producto debe estar en formato JPG o PNG. Si intentas subir PDF, Word, Excel u otro formato, el sistema no permitira completar el registro.';
  }
  if (intent === 'IMAGE_NOT_UPLOADED') {
    return 'Debes cargar al menos una imagen del producto en la seccion Imagenes del Producto. El archivo debe ser JPG, JPEG o PNG y tener tamano mayor a 0.';
  }
  if (intent === 'FIELD_EXPLANATION' && text.includes('codigo de barra')) {
    return 'El codigo de barra es el identificador comercial del producto. Debes ingresar el numero que aparece en el empaque del producto.';
  }
  if (intent === 'FIELD_EXPLANATION' && text.includes('codigo interno')) {
    return 'El codigo interno proveedor es el codigo que tu empresa usa para identificar el producto en su propio catalogo o sistema.';
  }
  if (intent === 'TECHNICAL_INFO_INCOMPLETE') {
    return 'Revisa que la informacion tecnica este completa: etiqueta, dimensiones, unidad de medida, precio y registro sanitario cuando aplique. Si falta uno de esos datos, completalo antes de guardar.';
  }
  if (intent === 'START_GUIDE') {
    return 'Activare la guia visual para revisar el formulario paso a paso: descripcion, codigo interno, etiqueta, codigo de barra, dimensiones, imagen, precio, unidad de medida, registro sanitario si aplica y Guardar.';
  }
  if (intent === 'MISSING_REQUIRED_FIELDS') {
    return 'Debes identificar el campo exacto que falta. Revisa descripcion, codigo interno proveedor, codigo de barra, etiqueta, dimensiones, imagenes, precio y unidad de medida; el sistema no debe asumir que sabes cual esta incompleto.';
  }
  if (!chunks.length) {
    return 'No encontre informacion suficiente en el procedimiento cargado. Este caso deberia derivarse a soporte.';
  }

  return 'Segun el SOP-04, revisa el formulario por secciones: campos obligatorios visibles, informacion tecnica e imagenes. Corrige el campo exacto incompleto y usa solo imagen JPG o PNG antes de presionar Guardar.';
};

export const SupportAgentService = {
  chat(payload) {
    const message = String(payload.message || '');
    const process = payload.process || 'registro_producto';
    const intent = detectIntent(message);
    const knowledge = KnowledgeService.search(message, process);
    const validation = payload.formState && Object.keys(payload.formState).length
      ? ValidationService.validate(payload.formState)
      : null;
    const answer = buildAnswer({ intent, message, chunks: knowledge.chunks, validation });
    const nextAction = getNextAction(intent);
    const confidence = knowledge.chunks.length ? Math.min(0.96, 0.74 + knowledge.chunks[0].score / 100) : 0.35;

    const response = {
      answer,
      intent,
      process,
      next_action: nextAction,
      confidence,
      sources: knowledge.chunks.map(({ id, title, score }) => ({ id, title, score })),
      suggested_guide: 'registro-producto',
    };

    InteractionLogService.add({
      type: 'chat',
      process,
      user_message: message,
      assistant_response: answer,
      intent,
      confidence,
      action_taken: nextAction,
      metadata: {
        page: payload.page || '',
        chunks: knowledge.chunks,
        validation,
      },
    });

    return response;
  },
};
