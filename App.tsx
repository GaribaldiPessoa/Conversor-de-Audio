
import React, { useState, useRef, useCallback } from 'react';
import { transcribeAudio, transcribeCombinedAudio, generateSpeech } from './services/geminiService';
import { blobToBase64 } from './utils/fileUtils';
import { decode, pcmToWavBlob } from './utils/audioUtils';

type Status = 'idle' | 'recording' | 'processing' | 'success' | 'error';
type TranscriptionMode = 'single' | 'separate';
type AudioFile = {
  id: string;
  url: string;
  blob: Blob;
  mimeType: string;
  name: string;
};
type AppMode = 'transcribe' | 'generate';
type TTSStatus = 'idle' | 'previewing' | 'processing' | 'success' | 'error';

// --- ÍCONES ---
const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3ZM10.5 5a1.5 1.5 0 0 1 3 0v6a1.5 1.5 0 0 1-3 0V5Z" /><path d="M17 11a5 5 0 0 1-5 5A5 5 0 0 1 7 11H5.5a6.5 6.5 0 0 0 6.075 6.477L11.5 19.5v2h1v-2l-.075-2.023A6.5 6.5 0 0 0 18.5 11H17Z" /></svg>
);
const StopIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 8H16V16H8z"></path></svg>
);
const UploadIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z"/></svg>
);
const CopyIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
);
const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
);
const PlayIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
);
const SparklesIcon = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0V2.75A.75.75 0 0 1 12 2ZM5.136 5.136a.75.75 0 0 1 1.06 0l1.768 1.768a.75.75 0 1 1-1.06 1.06L5.136 6.197a.75.75 0 0 1 0-1.06ZM2.75 11.25a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5ZM5.136 18.864a.75.75 0 0 1 0-1.06l1.768-1.768a.75.75 0 1 1 1.06 1.06l-1.768 1.768a.75.75 0 0 1-1.06 0ZM11.25 18.25a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0v-2.5ZM18.864 18.864a.75.75 0 0 1-1.06 0l-1.768-1.768a.75.75 0 0 1 1.06-1.06l1.768 1.768a.75.75 0 0 1 0 1.06ZM21.25 12.75a.75.75 0 0 0 0-1.5h-2.5a.75.75 0 0 0 0 1.5h2.5ZM18.864 5.136a.75.75 0 0 1 1.06 1.06l-1.768 1.768a.75.75 0 1 1-1.06-1.06L18.864 5.136Z" /></svg>
);

const VOICES = [
    { id: 'Kore', name: 'Kore', description: 'Feminina, clara e profissional' },
    { id: 'Puck', name: 'Puck', description: 'Masculina, energética e jovem' },
    { id: 'Charon', name: 'Charon', description: 'Masculina, profunda e calma' },
    { id: 'Fenrir', name: 'Fenrir', description: 'Masculina, madura e autoritária' },
    { id: 'Zephyr', name: 'Zephyr', description: 'Feminina, suave e amigável' },
];

const App: React.FC = () => {
  // --- STATE GERAL ---
  const [mode, setMode] = useState<AppMode>('transcribe');

  // --- STATE DE TRANSCRIÇÃO (ÁUDIO P/ TEXTO) ---
  const [transcribeStatus, setTranscribeStatus] = useState<Status>('idle');
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [transcribedTexts, setTranscribedTexts] = useState<{ fileName: string; text: string }[]>([]);
  const [transcribeErrorMessage, setTranscribeErrorMessage] = useState<string>('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>('single');
  const [copySuccess, setCopySuccess] = useState(false);

  // --- STATE DE GERAÇÃO (TEXTO P/ ÁUDIO) ---
  const [ttsStatus, setTtsStatus] = useState<TTSStatus>('idle');
  const [ttsText, setTtsText] = useState<string>('');
  const [selectedVoice, setSelectedVoice] = useState<string>(VOICES[0].id);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [playedPreviews, setPlayedPreviews] = useState<Set<string>>(new Set());
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [ttsErrorMessage, setTtsErrorMessage] = useState<string>('');

  // --- REFS ---
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);


  const resetTranscribeState = (clearFiles = true) => {
    setTranscribeStatus('idle');
    if(clearFiles) setAudioFiles([]);
    setTranscribedText('');
    setTranscribedTexts([]);
    setTranscribeErrorMessage('');
    setRecordingTime(0);
    audioChunksRef.current = [];
  }

  // --- LÓGICA DE TRANSCRIÇÃO ---
  const startRecording = async () => {
    resetTranscribeState();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
      mediaRecorderRef.current.onstop = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioFiles([{
            id: crypto.randomUUID(), url: URL.createObjectURL(audioBlob),
            blob: audioBlob, mimeType, name: `Gravação - ${new Date().toLocaleString()}.webm`
        }]);
        audioChunksRef.current = [];
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      setTranscribeStatus('recording');
      timerIntervalRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      setTranscribeErrorMessage('A permissão do microfone é necessária. Habilite-a nas configurações do seu navegador.');
      setTranscribeStatus('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && transcribeStatus === 'recording') {
      mediaRecorderRef.current.stop();
      setTranscribeStatus('idle');
      if(timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      resetTranscribeState();
      const newAudioFiles = Array.from(files).map((file: File) => ({
        id: crypto.randomUUID(), url: URL.createObjectURL(file),
        blob: file, mimeType: file.type, name: file.name
      }));
      setAudioFiles(newAudioFiles);
    }
  };

  const handleRemoveFile = (id: string) => {
    setAudioFiles(prev => prev.filter(file => file.id !== id));
    if (audioFiles.length === 1) resetTranscribeState();
  }

  const handleTranscribe = useCallback(async () => {
    if (audioFiles.length === 0) return;
    setTranscribeStatus('processing');
    setTranscribedText('');
    setTranscribedTexts([]);
    setTranscribeErrorMessage('');

    try {
      if (audioFiles.length === 1 || transcriptionMode === 'single') {
        const audioPayloads = await Promise.all(
          audioFiles.map(async (file) => ({ base64: await blobToBase64(file.blob), mimeType: file.mimeType }))
        );
        setTranscribedText(await transcribeCombinedAudio(audioPayloads));
      } else {
        const results = await Promise.all(audioFiles.map(async (file) => {
          const base64Audio = await blobToBase64(file.blob);
          const text = await transcribeAudio(base64Audio, file.mimeType);
          return { fileName: file.name, text };
        }));
        setTranscribedTexts(results);
      }
      setTranscribeStatus('success');
    } catch (err: any) {
      console.error(err);
      setTranscribeErrorMessage(`Falha na transcrição: ${err.message}. Tente novamente.`);
      setTranscribeStatus('error');
    }
  }, [audioFiles, transcriptionMode]);

  const handleCopyToClipboard = () => {
    const textToCopy = (audioFiles.length > 1 && transcriptionMode === 'separate')
      ? transcribedTexts.map(item => `--- ${item.fileName} ---\n\n${item.text}`).join('\n\n')
      : transcribedText;
    navigator.clipboard.writeText(textToCopy);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };
  
  const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  
  // --- LÓGICA DE GERAÇÃO DE ÁUDIO ---
  const playAudioData = async (base64Audio: string) => {
      if (!audioContextRef.current) {
          // Fix: Cast window to `any` to allow access to the non-standard `webkitAudioContext` for Safari compatibility.
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      const rawData = decode(base64Audio);
      const dataInt16 = new Int16Array(rawData.buffer);
      const frameCount = dataInt16.length / 1;
      const buffer = ctx.createBuffer(1, frameCount, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
  };

  const handleSelectVoice = async (voiceId: string) => {
    setSelectedVoice(voiceId);
    setTtsErrorMessage('');

    if (!playedPreviews.has(voiceId)) {
        setPreviewingVoice(voiceId);
        try {
            const sampleText = "Olá, esta é uma amostra da minha voz.";
            const audioData = await generateSpeech(sampleText, voiceId);
            await playAudioData(audioData);
            setPlayedPreviews(prev => new Set(prev).add(voiceId));
        } catch (err: any) {
            setTtsErrorMessage(`Falha na pré-visualização: ${err.message}`);
        } finally {
            setPreviewingVoice(null);
        }
    }
  };

  const handleGenerateAudio = async () => {
    if (!ttsText.trim() || !selectedVoice) return;
    setTtsStatus('processing');
    setTtsErrorMessage('');
    setGeneratedAudioUrl(null);
    try {
        const audioData = await generateSpeech(ttsText, selectedVoice);
        const pcmData = decode(audioData);
        // O modelo TTS gera PCM de 16 bits, 1 canal, 24kHz
        const wavBlob = pcmToWavBlob(pcmData, 24000, 1, 16);
        const url = URL.createObjectURL(wavBlob);
        setGeneratedAudioUrl(url);
        setTtsStatus('success');
    } catch (err: any) {
        setTtsErrorMessage(`Falha na geração de áudio: ${err.message}`);
        setTtsStatus('error');
    }
  };


  // --- RENDERIZAÇÃO ---
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-2xl mx-auto">
        <header className="text-center mb-6">
            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
                Gemini Multimodal
            </h1>
            <p className="text-slate-400 mt-2 text-lg">
                Conversão de Áudio para Texto e Texto para Áudio
            </p>
        </header>

        {/* --- SELETOR DE MODO --- */}
        <div className="flex justify-center p-1 bg-slate-800/80 rounded-lg mb-6">
            <button onClick={() => setMode('transcribe')} className={`px-4 py-2 text-sm font-semibold rounded-md flex-1 transition-colors ${mode === 'transcribe' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:bg-slate-700'}`}>Áudio para Texto</button>
            <button onClick={() => setMode('generate')} className={`px-4 py-2 text-sm font-semibold rounded-md flex-1 transition-colors ${mode === 'generate' ? 'bg-purple-500 text-white' : 'text-slate-400 hover:bg-slate-700'}`}>Texto para Áudio</button>
        </div>

        <main className="bg-slate-800/50 backdrop-blur-sm p-6 md:p-8 rounded-2xl shadow-2xl border border-slate-700 min-h-[400px]">
            {/* --- MODO: ÁUDIO PARA TEXTO --- */}
            {mode === 'transcribe' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <button onClick={transcribeStatus === 'recording' ? stopRecording : startRecording} className={`flex items-center justify-center gap-3 w-full text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg ${transcribeStatus === 'recording' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-cyan-500 hover:bg-cyan-600'}`}>
                        {transcribeStatus === 'recording' ? <StopIcon className="h-6 w-6" /> : <MicIcon className="h-6 w-6" />}
                        {transcribeStatus === 'recording' ? `Parar (${formatTime(recordingTime)})` : 'Gravar Áudio'}
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} disabled={transcribeStatus === 'recording'} className="flex items-center justify-center gap-3 w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                        <UploadIcon className="h-6 w-6" />
                        Enviar Arquivos
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="audio/*" className="hidden" multiple />
                </div>
                
                {audioFiles.length > 0 && (
                     <div className="my-6 space-y-4">
                         <p className="text-slate-300 font-medium text-lg border-b border-slate-700 pb-2">Arquivos de Áudio:</p>
                        {audioFiles.map(file => (
                            <div key={file.id} className="flex items-center gap-4 bg-slate-700/50 p-3 rounded-lg">
                               <div className="flex-1 min-w-0">
                                    <p className="text-slate-200 font-semibold truncate" title={file.name}>{file.name}</p>
                                    <audio src={file.url} controls className="w-full mt-2 h-8" />
                               </div>
                               <button onClick={() => handleRemoveFile(file.id)} className="text-slate-400 hover:text-red-400 transition-colors p-2 rounded-full flex-shrink-0"><TrashIcon className="w-6 h-6"/></button>
                            </div>
                        ))}
                    </div>
                )}

                {audioFiles.length > 1 && (
                    <div className="my-6 p-4 bg-slate-700/50 rounded-lg">
                        <fieldset>
                            <legend className="text-slate-300 font-medium mb-2">Modo de Transcrição:</legend>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="transcription-mode" value="single" checked={transcriptionMode === 'single'} onChange={() => setTranscriptionMode('single')} className="form-radio text-cyan-400 bg-slate-600 border-slate-500 focus:ring-cyan-500" />Transcrição Única</label>
                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="transcription-mode" value="separate" checked={transcriptionMode === 'separate'} onChange={() => setTranscriptionMode('separate')} className="form-radio text-purple-500 bg-slate-600 border-slate-500 focus:ring-purple-500"/>Transcrições Separadas</label>
                            </div>
                        </fieldset>
                    </div>
                )}
                
                {audioFiles.length > 0 && transcribeStatus !== 'recording' && (
                    <div className="mt-6 text-center"><button onClick={handleTranscribe} disabled={transcribeStatus === 'processing'} className="w-full md:w-auto px-12 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-lg transition-all duration-300 transform hover:scale-105 shadow-xl disabled:opacity-50 disabled:cursor-wait">{transcribeStatus === 'processing' ? 'Transcrevendo...' : 'Transcrever Áudio(s)'}</button></div>
                )}

                <div className="mt-8 min-h-[150px]">
                    {transcribeStatus === 'processing' && (<div className="flex flex-col items-center justify-center text-center text-slate-400"><div className="w-12 h-12 border-4 border-t-cyan-400 border-slate-600 rounded-full animate-spin"></div><p className="mt-4 text-lg">O Gemini está analisando...</p></div>)}
                    {transcribeStatus === 'error' && (<div className="p-4 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-center"><p className="font-bold">Ocorreu um erro</p><p>{transcribeErrorMessage}</p></div>)}
                    {transcribeStatus === 'success' && (
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-xl font-semibold text-slate-200">Transcrição:</h2>
                                <button onClick={handleCopyToClipboard} className="relative flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"><CopyIcon className="h-5 w-5"/>{copySuccess ? 'Copiado!' : 'Copiar Tudo'}</button>
                            </div>
                            
                            {(transcriptionMode === 'single' || audioFiles.length === 1) && transcribedText && (<div className="bg-slate-900/70 p-4 rounded-lg max-h-96 overflow-y-auto border border-slate-700"><p className="text-slate-300 whitespace-pre-wrap">{transcribedText}</p></div>)}
                            {transcriptionMode === 'separate' && audioFiles.length > 1 && transcribedTexts.length > 0 && (<div className="bg-slate-900/70 p-4 rounded-lg max-h-96 overflow-y-auto border border-slate-700 space-y-6">{transcribedTexts.map((item, index) => (<div key={index}><h3 className="font-bold text-cyan-400 mb-2 border-b border-slate-700 pb-1">{item.fileName}</h3><p className="text-slate-300 whitespace-pre-wrap">{item.text}</p></div>))}</div>)}
                        </div>
                    )}
                </div>
              </>
            )}

            {/* --- MODO: TEXTO PARA ÁUDIO --- */}
            {mode === 'generate' && (
                <div className="space-y-6">
                    <div>
                      <label htmlFor="tts-input" className="block text-slate-300 font-medium mb-2">Texto para converter:</label>
                      <textarea id="tts-input" value={ttsText} onChange={(e) => setTtsText(e.target.value)} rows={5} className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-slate-200" placeholder="Digite seu texto aqui..."></textarea>
                    </div>

                    <div>
                      <p className="block text-slate-300 font-medium mb-3">Selecione uma voz:</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {VOICES.map(voice => (
                              <button key={voice.id} onClick={() => handleSelectVoice(voice.id)} className={`p-4 rounded-lg text-left transition-all border-2 ${selectedVoice === voice.id ? 'bg-purple-500/30 border-purple-500' : 'bg-slate-700/50 border-slate-700 hover:border-slate-500'}`}>
                                <div className="flex justify-between items-center">
                                  <p className="font-bold text-slate-100">{voice.name}</p>
                                  <div className="h-6 w-6 flex items-center justify-center">
                                    {previewingVoice === voice.id ? (<div className="w-4 h-4 border-2 border-t-purple-400 border-slate-500 rounded-full animate-spin"></div>) : (<PlayIcon className={`h-5 w-5 ${playedPreviews.has(voice.id) ? 'text-cyan-400' : 'text-slate-400'}`}/>)}
                                  </div>
                                </div>
                                <p className="text-xs text-slate-400 mt-1">{voice.description}</p>
                              </button>
                          ))}
                      </div>
                    </div>
                    
                    <div className="text-center pt-4">
                      <button onClick={handleGenerateAudio} disabled={!ttsText.trim() || ttsStatus === 'processing'} className="flex items-center justify-center gap-3 w-full md:w-auto px-12 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-lg transition-all duration-300 transform hover:scale-105 shadow-xl disabled:opacity-50 disabled:cursor-wait">
                        <SparklesIcon className="h-6 w-6" />
                        {ttsStatus === 'processing' ? 'Gerando Áudio...' : 'Gerar Áudio'}
                      </button>
                    </div>

                    <div className="mt-8 min-h-[100px]">
                      {ttsStatus === 'processing' && (<div className="flex flex-col items-center justify-center text-center text-slate-400"><div className="w-10 h-10 border-4 border-t-purple-400 border-slate-600 rounded-full animate-spin"></div><p className="mt-4 text-lg">O Gemini está gerando seu áudio...</p></div>)}
                      {ttsErrorMessage && (<div className="p-3 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-center"><p>{ttsErrorMessage}</p></div>)}
                      {ttsStatus === 'success' && generatedAudioUrl && (
                        <div>
                          <h2 className="text-xl font-semibold text-slate-200 mb-2">Seu áudio está pronto:</h2>
                          <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700">
                             <audio src={generatedAudioUrl} controls className="w-full" />
                             <a href={generatedAudioUrl} download={`gemini-audio-${Date.now()}.wav`} className="block text-center mt-3 text-cyan-400 hover:text-cyan-300 font-semibold">Baixar Áudio</a>
                          </div>
                        </div>
                      )}
                    </div>
                </div>
            )}
        </main>
      </div>
    </div>
  );
};

export default App;