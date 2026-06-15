import crypto from 'node:crypto';

export function acceptKey(key) {
  return crypto
    .createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
}

export function textFrame(message) {
  const payload = Buffer.from(message, 'utf8');
  const header = payload.length < 126
    ? Buffer.from([0x81, payload.length])
    : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
  return Buffer.concat([header, payload]);
}

export function readFrames(buffer, {maxPayloadBytes = 64 * 1024} = {}) {
  const messages = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const second = buffer[offset + 1];
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (buffer.length - cursor < 2) {
        break;
      }
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    }
    if (length === 127) {
      throw new Error('Large collaboration frames are not supported.');
    }
    if (length > maxPayloadBytes) {
      throw new Error('Collaboration frame exceeds configured payload limit.');
    }
    if (!masked) {
      throw new Error('Client collaboration frames must be masked.');
    }
    if (buffer.length - cursor < 4 + length) {
      break;
    }
    const opcode = buffer[offset] & 0x0f;
    const mask = buffer.subarray(cursor, cursor + 4);
    cursor += 4;
    const payload = Buffer.alloc(length);
    for (let index = 0; index < length; index += 1) {
      payload[index] = buffer[cursor + index] ^ mask[index % 4];
    }
    cursor += length;
    offset = cursor;
    if (opcode === 0x8) {
      messages.push({type: 'close'});
    }
    if (opcode === 0x1) {
      messages.push({type: 'text', text: payload.toString('utf8')});
    }
  }
  return {messages, rest: buffer.subarray(offset)};
}

export function writeHttpResponse(socket, status, reason) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\n\r\n`);
  socket.destroy();
}
