import { createHash } from 'node:crypto';

const textEncoder = new TextEncoder();

const encodeFrame = (payload) => {
  const data = textEncoder.encode(payload);
  const length = data.length;
  const header = [];

  header.push(0x81);
  if (length < 126) {
    header.push(length);
  } else if (length < 65536) {
    header.push(126, (length >> 8) & 255, length & 255);
  } else {
    header.push(127, 0, 0, 0, 0, (length >> 24) & 255, (length >> 16) & 255, (length >> 8) & 255, length & 255);
  }

  return Buffer.concat([Buffer.from(header), Buffer.from(data)]);
};

const decodeFrames = (buffer) => {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;

    if (length === 126) {
      if (cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break;
      const high = buffer.readUInt32BE(cursor);
      const low = buffer.readUInt32BE(cursor + 4);
      length = high * 2 ** 32 + low;
      cursor += 8;
    }

    const mask = masked ? buffer.subarray(cursor, cursor + 4) : null;
    if (masked) cursor += 4;
    if (cursor + length > buffer.length) break;

    const payload = Buffer.from(buffer.subarray(cursor, cursor + length));
    if (mask) {
      for (let i = 0; i < payload.length; i += 1) {
        payload[i] ^= mask[i % 4];
      }
    }

    if (opcode === 0x1) {
      messages.push(payload.toString('utf8'));
    }

    offset = cursor + length;
  }

  return { messages, remaining: buffer.subarray(offset) };
};

export const acceptWebSocket = (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const accept = createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));

  return {
    send(payload) {
      socket.write(encodeFrame(JSON.stringify(payload)));
    },
    onMessage(callback) {
      let buffered = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buffered = Buffer.concat([buffered, chunk]);
        const decoded = decodeFrames(buffered);
        buffered = decoded.remaining;
        decoded.messages.forEach((message) => {
          try {
            callback(JSON.parse(message));
          } catch {
            callback({ type: 'invalid_json', raw: message });
          }
        });
      });
    },
    onClose(callback) {
      socket.on('close', callback);
      socket.on('end', callback);
      socket.on('error', callback);
    },
    close() {
      socket.end();
    },
  };
};
