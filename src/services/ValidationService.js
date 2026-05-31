const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const allowedImageExtensions = ['.jpg', '.jpeg', '.png'];

const isBlank = (value) => String(value ?? '').trim().length === 0;

const hasValidExtension = (filename = '') =>
  allowedImageExtensions.some((extension) => filename.toLowerCase().endsWith(extension));

const pushRequired = (errors, field, message, solution) => {
  errors.push({
    field,
    message,
    reason: 'El formulario de Productos requiere este dato para completar el registro.',
    solution,
    severity: 'high',
  });
};

export const ValidationService = {
  validate(formState = {}) {
    const errors = [];
    const warnings = [
      {
        field: 'sanitaryRegister',
        message: 'Verifique si este producto requiere registro sanitario.',
        severity: 'medium',
      },
    ];

    if (isBlank(formState.description)) {
      pushRequired(errors, 'description', 'Debe completar la descripcion del producto.', 'Ingrese una descripcion clara, por ejemplo: Aceite vegetal 1 litro.');
    }
    if (isBlank(formState.internalCode)) {
      pushRequired(errors, 'internalCode', 'Debe completar el codigo interno proveedor.', 'Ingrese el codigo que su empresa usa para identificar este producto, por ejemplo: ACE-001.');
    }
    if (isBlank(formState.barcode)) {
      pushRequired(errors, 'barcode', 'Debe completar el codigo de barra del producto.', 'Ingrese el numero de codigo de barra que aparece en el empaque del producto.');
    }
    if (isBlank(formState.label)) {
      pushRequired(errors, 'label', 'Debe completar la etiqueta del producto.', 'Ingrese la etiqueta o nombre comercial visible del producto.');
    }
    if (isBlank(formState.dimensions)) {
      pushRequired(errors, 'dimensions', 'Debe completar las dimensiones del producto.', 'Ingrese alto, largo y ancho en un formato claro, por ejemplo: 10 x 10 x 25 cm.');
    }
    if (isBlank(formState.unit)) {
      pushRequired(errors, 'unit', 'Debe seleccionar la unidad de medida del producto.', 'Seleccione una opcion de unidad de medida, como Unidad, Caja, Paquete o Kilogramo.');
    }

    const numericPrice = Number(formState.price);
    if (formState.price === null || formState.price === undefined || isBlank(formState.price)) {
      pushRequired(errors, 'price', 'Debe ingresar el precio del producto.', 'Ingrese un precio numerico mayor que 0, por ejemplo: 12.50.');
    } else if (!Number.isFinite(numericPrice)) {
      errors.push({
        field: 'price',
        message: 'El precio debe ser un numero valido.',
        reason: 'El sistema solo acepta valores numericos para calcular el precio del producto.',
        solution: 'Use solo numeros y punto decimal si corresponde, por ejemplo: 12.50.',
        severity: 'high',
      });
    } else if (numericPrice <= 0) {
      errors.push({
        field: 'price',
        message: 'El precio debe ser mayor que 0.',
        reason: 'Un precio igual o menor que cero no permite registrar una condicion comercial valida.',
        solution: 'Ingrese un monto mayor que 0, por ejemplo: 12.50.',
        severity: 'high',
      });
    }

    const images = Array.isArray(formState.images) ? formState.images : [];
    if (!images.length) {
      pushRequired(errors, 'images', 'Debe cargar al menos una imagen del producto en formato JPG o PNG.', 'Seleccione una imagen del producto con extension .jpg, .jpeg o .png.');
    } else {
      images.forEach((image, index) => {
        const type = String(image.type || '').toLowerCase();
        const filename = String(image.filename || '');
        const size = Number(image.size || 0);
        const validFormat = allowedImageTypes.has(type) || hasValidExtension(filename);

        if (!validFormat) {
          errors.push({
            field: 'images',
            message: `La imagen ${index + 1} debe estar en formato JPG o PNG. No se permite PDF, Word, Excel u otros formatos.`,
            reason: 'El modulo Catalogo Electronico solo acepta imagenes JPG o PNG para productos.',
            solution: 'Reemplace el archivo por una fotografia o imagen en formato .jpg, .jpeg o .png.',
            severity: 'high',
          });
        }
        if (size <= 0) {
          errors.push({
            field: 'images',
            message: `La imagen ${index + 1} debe tener un tamano mayor a 0.`,
            reason: 'Un archivo vacio no puede usarse como imagen del producto.',
            solution: 'Seleccione nuevamente una imagen valida que tenga contenido.',
            severity: 'high',
          });
        }
      });
    }

    const valid = errors.length === 0;
    return {
      valid,
      errors,
      warnings,
      recommendation: valid
        ? 'El producto esta listo para guardar. Revise si corresponde completar registro sanitario.'
        : 'Complete los campos faltantes y cargue una imagen en formato JPG o PNG antes de guardar.',
      confidence: 0.95,
    };
  },
};
