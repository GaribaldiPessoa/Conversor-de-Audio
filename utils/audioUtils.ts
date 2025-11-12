/**
 * Decodifica uma string base64 para um Uint8Array.
 */
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Escreve uma string em um DataView em um determinado offset.
 */
function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Converte dados de áudio PCM brutos em um Blob de arquivo .wav.
 * @param pcmData Os dados PCM brutos.
 * @param sampleRate A taxa de amostragem (por exemplo, 24000).
 * @param numChannels O número de canais (por exemplo, 1 para mono).
 * @param bitsPerSample O número de bits por amostra (por exemplo, 16).
 * @returns Um Blob que representa o arquivo .wav.
 */
export function pcmToWavBlob(pcmData: Uint8Array, sampleRate: number, numChannels: number, bitsPerSample: number): Blob {
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  // Cabeçalho RIFF
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // tamanho do arquivo - 8
  writeString(view, 8, 'WAVE');

  // Sub-chunk FMT
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // tamanho do subchunk1 (16 para PCM)
  view.setUint16(20, 1, true); // formato de áudio (1 para PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // Sub-chunk DATA
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Escreve os dados PCM
  const pcmView = new Uint8Array(buffer, 44);
  pcmView.set(pcmData);

  return new Blob([view], { type: 'audio/wav' });
}
