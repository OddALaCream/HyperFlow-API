import { randomUUID } from 'node:crypto';

const interactions = [];

export const InteractionLogService = {
  add(entry) {
    const interaction = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      process: 'registro_producto',
      type: 'chat',
      user_message: '',
      assistant_response: '',
      intent: '',
      confidence: 0,
      action_taken: 'ANSWER_ONLY',
      metadata: {},
      ...entry,
    };

    interactions.unshift(interaction);
    if (interactions.length > 300) {
      interactions.length = 300;
    }
    return interaction;
  },

  list() {
    return interactions;
  },
};
