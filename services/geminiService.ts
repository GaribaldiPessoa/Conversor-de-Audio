import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Transcreve um único arquivo de áudio.
 */
export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  try {
    const audioPart = {
      inlineData: {
        data: base64Audio,
        mimeType: mimeType,
      },
    };

    const textPart = {
      text: "Transcreva este áudio em português. Se o áudio estiver em outro idioma, transcreva no idioma original e, em seguida, forneça a tradução para o português.",
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [audioPart, textPart] },
    });
    
    return response.text;
  } catch (error) {
    console.error("Error in Gemini API call (single audio):", error);
    throw new Error("Falha na transcrição do áudio. Verifique o console para mais detalhes.");
  }
}

/**
 * Transcreve múltiplos arquivos de áudio em uma única transcrição contínua.
 */
export async function transcribeCombinedAudio(audios: { base64: string, mimeType: string }[]): Promise<string> {
  if (audios.length === 1) {
    return transcribeAudio(audios[0].base64, audios[0].mimeType);
  }

  try {
    const audioParts = audios.map(audio => ({
      inlineData: {
        data: audio.base64,
        mimeType: audio.mimeType,
      },
    }));

    const textPart = {
      text: "Você receberá vários clipes de áudio. Transcreva todos eles em um único documento de texto contínuo, em português. Se o áudio estiver em outro idioma, transcreva no idioma original e depois forneça a tradução para o português. Se possível, indique claramente onde cada clipe de áudio termina e o próximo começa usando um separador como '---'.",
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [...audioParts, textPart] },
    });
    
    return response.text;
  } catch (error) {
    console.error("Error in Gemini API call (combined audio):", error);
    throw new Error("Falha na transcrição dos áudios combinados. Verifique o console para mais detalhes.");
  }
}
