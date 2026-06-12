// TD1s raw USB and USB-MIDI packet parsing helper functions
export function parseTd1sData(uint8Array) {
  // Case 1: Try parsing as USB-MIDI packets first
  const midiBytes = [];
  for (let i = 0; i < uint8Array.length; i += 4) {
    if (i + 3 < uint8Array.length) {
      const header = uint8Array[i];
      const cin = header & 0x0F;
      const b1 = uint8Array[i + 1];
      const b2 = uint8Array[i + 2];
      const b3 = uint8Array[i + 3];
      if (cin === 0x04 || cin === 0x07) {
        midiBytes.push(b1, b2, b3);
      } else if (cin === 0x05) {
        midiBytes.push(b1);
      } else if (cin === 0x06) {
        midiBytes.push(b1, b2);
      }
    }
  }

  const midiBuffer = new Uint8Array(midiBytes);
  const f0MidiIdx = midiBuffer.indexOf(0xF0);
  const f7MidiIdx = midiBuffer.indexOf(0xF7);

  if (f0MidiIdx !== -1 && f7MidiIdx !== -1 && f7MidiIdx > f0MidiIdx) {
    const sysexPayload = midiBuffer.slice(f0MidiIdx, f7MidiIdx + 1);
    return decodeSysExPayload(sysexPayload);
  }

  // Case 2: Try parsing as raw MIDI bytes (if wrapped in F0 ... F7 directly)
  const f0RawIdx = uint8Array.indexOf(0xF0);
  const f7RawIdx = uint8Array.indexOf(0xF7);
  if (f0RawIdx !== -1 && f7RawIdx !== -1 && f7RawIdx > f0RawIdx) {
    const sysexPayload = uint8Array.slice(f0RawIdx, f7RawIdx + 1);
    return decodeSysExPayload(sysexPayload);
  }

  // Case 3: Treat as raw ASCII/UTF-8 data
  try {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(uint8Array);
    const cleanText = text.replace(/[^\x20-\x7E,]/g, '').trim();
    return parseCsvString(cleanText);
  } catch (e) {
    console.error('Failed to parse raw ASCII data:', e);
  }
  return null;
}

export function decodeSysExPayload(sysex) {
  if (sysex.length >= 3) {
    const asciiBytes = sysex.slice(2, sysex.length - 1);
    const decoder = new TextDecoder('ascii');
    const decoded = decoder.decode(asciiBytes);
    return parseCsvString(decoded.trim());
  }
  return null;
}

export function parseCsvString(str) {
  const parts = str.split(',');
  if (parts.length >= 2) {
    const hexColour = parts[parts.length - 1].trim();
    const tdValue = parts[parts.length - 2].trim();
    return { tdValue, hexColour };
  }
  return null;
}
