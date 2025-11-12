import React, { useState, useRef, useCallback } from 'react';
import { transcribeAudio, transcribeCombinedAudio } from './services/geminiService';
import { blobToBase64 } from './utils/fileUtils';

type Status = 'idle' | 'recording' | 'processing' | 'success' | 'error';
type TranscriptionMode = 'single' | 'separate';
type AudioFile = {
  id: string;
  url: string;
  blob: Blob;
  mimeType: string;
  name: string;
};

// --- ÍCONES ---
const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3ZM10.5 5a1.5 1.5 0 0 1 3 0v6a1.5 1.5 0 0 1-3 0V5Z" />
    <path d="M17 11a5 5 0 0 1-5 5A5 5 0 0 1 7 11H5.5a6.5 6.5 0 0 0 6.075 6.477L11.5 19.5v2h1v-2l-.075-2.023A6.5 6.5 0 0 0 18.5 11H17Z" />
  </svg>
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


const App: React.FC = () => {
  const [status, setStatus] = useState<Status>('idle');
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [transcribedTexts, setTranscribedTexts] = useState<{ fileName: string; text: string }[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>('single');
  const [copySuccess, setCopySuccess] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);


  const resetState = (clearFiles = true) => {
    setStatus('idle');
    if(clearFiles) setAudioFiles([]);
    setTranscribedText('');
    setTranscribedTexts([]);
    setErrorMessage('');
    setRecordingTime(0);
    audioChunksRef.current = [];
  }

  const startRecording = async () => {
    resetState();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        const newFile: AudioFile = {
            id: crypto.randomUUID(),
            url: audioUrl,
            blob: audioBlob,
            mimeType,
            name: `Gravação - ${new Date().toLocaleString()}.webm`
        };
        setAudioFiles([newFile]);
        audioChunksRef.current = [];
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      setStatus('recording');

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      setErrorMessage('A permissão do microfone é necessária para gravar. Por favor, habilite nas configurações do seu navegador.');
      setStatus('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && status === 'recording') {
      mediaRecorderRef.current.stop();
      setStatus('idle');
      if(timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      resetState();
      // FIX: Explicitly type `file` as `File` to resolve TypeScript errors where it was inferred as `unknown`.
      const newAudioFiles = Array.from(files).map((file: File) => ({
        id: crypto.randomUUID(),
        url: URL.createObjectURL(file),
        blob: file,
        mimeType: file.type,
        name: file.name
      }));
      setAudioFiles(newAudioFiles);
    }
  };

  const handleRemoveFile = (id: string) => {
    setAudioFiles(prev => prev.filter(file => file.id !== id));
  }

  const handleTranscribe = useCallback(async () => {
    if (audioFiles.length === 0) return;

    setStatus('processing');
    setTranscribedText('');
    setTranscribedTexts([]);
    setErrorMessage('');

    try {
      if (audioFiles.length === 1 || transcriptionMode === 'single') {
        const audioPayloads = await Promise.all(
          audioFiles.map(async (file) => ({
            base64: await blobToBase64(file.blob),
            mimeType: file.mimeType,
          }))
        );
        const result = await transcribeCombinedAudio(audioPayloads);
        setTranscribedText(result);
      } else { // Separate transcriptions
        const results = [];
        for (const file of audioFiles) {
          const base64Audio = await blobToBase64(file.blob);
          const result = await transcribeAudio(base64Audio, file.mimeType);
          results.push({ fileName: file.name, text: result });
        }
        setTranscribedTexts(results);
      }
      setStatus('success');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Falha na transcrição: ${err.message}. Por favor, tente novamente.`);
      setStatus('error');
    }
  }, [audioFiles, transcriptionMode]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleCopyToClipboard = () => {
    let textToCopy = '';
    if (audioFiles.length > 1 && transcriptionMode === 'separate') {
      textToCopy = transcribedTexts
        .map(item => `--- Transcrição para ${item.fileName} ---\n\n${item.text}`)
        .join('\n\n');
    } else {
      textToCopy = transcribedText;
    }
    navigator.clipboard.writeText(textToCopy);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };
  
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl mx-auto">
        <header className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
                Conversor de Áudio para Texto
            </h1>
            <p className="text-slate-400 mt-2 text-lg">
                Com a tecnologia da API Gemini do Google
            </p>
        </header>

        <main className="bg-slate-800/50 backdrop-blur-sm p-6 md:p-8 rounded-2xl shadow-2xl border border-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <button
                    onClick={status === 'recording' ? stopRecording : startRecording}
                    className={`flex items-center justify-center gap-3 w-full text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg ${status === 'recording' ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-cyan-500 hover:bg-cyan-600'}`}
                >
                    {status === 'recording' ? <StopIcon className="h-6 w-6" /> : <MicIcon className="h-6 w-6" />}
                    {status === 'recording' ? `Parar Gravação (${formatTime(recordingTime)})` : 'Gravar Áudio'}
                </button>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={status === 'recording'}
                    className="flex items-center justify-center gap-3 w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <UploadIcon className="h-6 w-6" />
                    Enviar Arquivos
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="audio/*"
                    className="hidden"
                    multiple
                />
            </div>
            
            {audioFiles.length > 0 && (
                 <div className="my-6 space-y-4">
                     <p className="text-slate-300 font-medium text-lg border-b border-slate-700 pb-2">Arquivos de Áudio:</p>
                    {audioFiles.map(file => (
                        <div key={file.id} className="flex items-center gap-4 bg-slate-700/50 p-3 rounded-lg">
                           <div className="flex-1">
                                <p className="text-slate-200 font-semibold truncate" title={file.name}>{file.name}</p>
                                <audio src={file.url} controls className="w-full mt-2 h-8" />
                           </div>
                           <button onClick={() => handleRemoveFile(file.id)} className="text-slate-400 hover:text-red-400 transition-colors p-2 rounded-full">
                               <TrashIcon className="w-6 h-6"/>
                           </button>
                        </div>
                    ))}
                </div>
            )}

            {audioFiles.length > 1 && (
                <div className="my-6 p-4 bg-slate-700/50 rounded-lg">
                    <fieldset>
                        <legend className="text-slate-300 font-medium mb-2">Modo de Transcrição:</legend>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="transcription-mode" value="single" checked={transcriptionMode === 'single'} onChange={() => setTranscriptionMode('single')} className="form-radio text-cyan-400 bg-slate-600 border-slate-500 focus:ring-cyan-500" />
                                Transcrição Única
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="transcription-mode" value="separate" checked={transcriptionMode === 'separate'} onChange={() => setTranscriptionMode('separate')} className="form-radio text-purple-500 bg-slate-600 border-slate-500 focus:ring-purple-500"/>
                                Transcrições Separadas
                            </label>
                        </div>
                    </fieldset>
                </div>
            )}
            
            {audioFiles.length > 0 && status !== 'recording' && (
                <div className="mt-6 text-center">
                    <button
                        onClick={handleTranscribe}
                        disabled={status === 'processing'}
                        className="w-full md:w-auto px-12 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-lg transition-all duration-300 transform hover:scale-105 shadow-xl disabled:opacity-50 disabled:cursor-wait"
                    >
                        {status === 'processing' ? 'Transcrevendo...' : 'Transcrever Áudio(s)'}
                    </button>
                </div>
            )}

            <div className="mt-8 min-h-[150px]">
                {status === 'processing' && (
                    <div className="flex flex-col items-center justify-center text-center text-slate-400">
                        <div className="w-12 h-12 border-4 border-t-cyan-400 border-slate-600 rounded-full animate-spin"></div>
                        <p className="mt-4 text-lg">O Gemini está analisando seu áudio...</p>
                    </div>
                )}
                {status === 'error' && (
                     <div className="p-4 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-center">
                        <p className="font-bold">Ocorreu um erro</p>
                        <p>{errorMessage}</p>
                    </div>
                )}
                {status === 'success' && (
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-xl font-semibold text-slate-200">Transcrição:</h2>
                            <button onClick={handleCopyToClipboard} className="relative flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                                <CopyIcon className="h-5 w-5"/>
                                {copySuccess ? 'Copiado!' : 'Copiar Tudo'}
                            </button>
                        </div>
                        
                        {(transcriptionMode === 'single' || audioFiles.length === 1) && transcribedText && (
                            <div className="bg-slate-900/70 p-4 rounded-lg max-h-96 overflow-y-auto border border-slate-700">
                                <p className="text-slate-300 whitespace-pre-wrap">{transcribedText}</p>
                            </div>
                        )}
                        {transcriptionMode === 'separate' && audioFiles.length > 1 && transcribedTexts.length > 0 && (
                            <div className="bg-slate-900/70 p-4 rounded-lg max-h-96 overflow-y-auto border border-slate-700 space-y-6">
                                {transcribedTexts.map((item, index) => (
                                    <div key={index}>
                                        <h3 className="font-bold text-cyan-400 mb-2 border-b border-slate-700 pb-1">{item.fileName}</h3>
                                        <p className="text-slate-300 whitespace-pre-wrap">{item.text}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;