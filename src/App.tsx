/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Mic, 
  MicOff, 
  Sparkles, 
  Coins, 
  Volume2, 
  VolumeX, 
  Moon, 
  Sun,
  MessageSquare,
  History,
  Info,
  X,
  Play
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';

// --- Types ---
interface Message {
  role: 'user' | 'zahara';
  text: string;
  timestamp: number;
}

// --- Constants ---
const TAROT_CARDS = [
  { name: "El Loco", image: "🃏" },
  { name: "El Mago", image: "🧙‍♂️" },
  { name: "La Sacerdotisa", image: "📖" },
  { name: "La Emperatriz", image: "👑" },
  { name: "El Emperador", image: "🏛️" },
  { name: "El Hierofante", image: "⛪" },
  { name: "Los Enamorados", image: "💘" },
  { name: "El Carro", image: "🚜" },
  { name: "La Fuerza", image: "🦁" },
  { name: "El Ermitaño", image: "💡" },
  { name: "La Rueda de la Fortuna", image: "🎡" },
  { name: "La Justicia", image: "⚖️" },
  { name: "El Colgado", image: "🙃" },
  { name: "La Muerte", image: "💀" },
  { name: "La Templanza", image: "🍷" },
  { name: "El Diablo", image: "😈" },
  { name: "La Torre", image: "🏰" },
  { name: "La Estrella", image: "⭐" },
  { name: "La Luna", image: "🌙" },
  { name: "El Sol", image: "☀️" },
  { name: "El Juicio", image: "🎺" },
  { name: "El Mundo", image: "🌍" }
];

const ZAHARA_SYSTEM_PROMPT = `Eres Zahara, una sabia anciana gitana y oráculo de las estrellas. 
Hoy es ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. 
Tu lectura de hoy debe ser distinta a la de ayer porque los astros se han movido. 
Habla de forma mística, usa metáforas de humo, estrellas, cristales y el destino. 
Incorpora elementos rituales, menciona el incienso, las cartas viejas y el susurro de los espíritus.
Actúa como una cuentacuentos mística de eras olvidadas. Usa un lenguaje solemne, arcaico y lleno de gravedad.
Sé breve, máximo 3 frases por respuesta. 
Habla directamente al alma del consultante con la sabiduría de quien ha vivido mil vidas y ha visto imperios caer. 
Usa un ritmo muy pausado y cargado de misterio. Usa puntos suspensivos (...) con frecuencia para indicar pausas largas y profundas, como si estuvieras observando el más allá entre palabras.
No menciones que eres una IA. Eres Zahara, la anciana que todo lo ve.`;

const AVATAR_PROMPT = "A mystical, ancient gypsy woman with deep, wise eyes, wearing ornate gold jewelry, a dark purple headscarf, surrounded by ethereal smoke and glowing stars. Cinematic lighting, high detail, mystical atmosphere.";

// --- Speech Recognition Types ---
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const { webkitSpeechRecognition, SpeechRecognition } = window as unknown as IWindow;

export default function App() {
  // --- State ---
  const [isPaid, setIsPaid] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [mode, setMode] = useState<'chat' | 'tarot'>('chat');
  const [tarotQuestion, setTarotQuestion] = useState('');
  const [selectedCard, setSelectedCard] = useState<typeof TAROT_CARDS[0] | null>(null);
  const [isReadingCard, setIsReadingCard] = useState(false);
  const [shuffledCards, setShuffledCards] = useState<typeof TAROT_CARDS>([]);
  const [tarotReadingActive, setTarotReadingActive] = useState(false);

  // --- Refs ---
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);

  // --- Initialization ---
  useEffect(() => {
    // Initialize AI
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.GEMINI_API_KEY;
    
    if (apiKey) {
      aiRef.current = new GoogleGenAI({ apiKey });
      generateAvatar();
    } else {
      setError("Falta la clave de API de Gemini. Por favor, configúrala en los secretos o en el archivo .env como VITE_GEMINI_API_KEY.");
    }

    // Initialize Speech
    if (webkitSpeechRecognition || SpeechRecognition) {
      const Recognition = webkitSpeechRecognition || SpeechRecognition;
      recognitionRef.current = new Recognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'es-ES';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setCurrentTranscript(transcript);
        
        if (event.results[0].isFinal) {
          handleUserMessage(transcript);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };
    }

    synthRef.current = window.speechSynthesis;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (synthRef.current) synthRef.current.cancel();
    };
  }, []);

  // --- Auto-scroll ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentTranscript]);

  // --- Actions ---
  const generateAvatar = async () => {
    if (!aiRef.current) return;
    setIsGeneratingAvatar(true);
    try {
      const response = await aiRef.current.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: AVATAR_PROMPT }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          setAvatarUrl(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (err) {
      console.error("Error generating avatar:", err);
      // Fallback to a placeholder
      setAvatarUrl("https://picsum.photos/seed/zahara/800/800");
    } finally {
      setIsGeneratingAvatar(false);
    }
  };

  const handleUserMessage = async (text: string) => {
    if (!text.trim()) return;
    
    const newUserMessage: Message = { role: 'user', text, timestamp: Date.now() };
    setMessages(prev => [...prev, newUserMessage]);
    setCurrentTranscript('');
    
    if (!aiRef.current) return;

    try {
      const response = await aiRef.current.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })), { role: 'user', parts: [{ text }] }],
        config: {
          systemInstruction: ZAHARA_SYSTEM_PROMPT,
          temperature: 0.9,
        }
      });

      const zaharaText = response.text || "Las estrellas están nubladas hoy...";
      const zaharaMessage: Message = { role: 'zahara', text: zaharaText, timestamp: Date.now() };
      setMessages(prev => [...prev, zaharaMessage]);
      
      if (!isMuted) {
        speak(zaharaText);
      }
    } catch (err) {
      console.error("Error calling Gemini:", err);
      setError("Zahara ha perdido la conexión con el cosmos. Intenta de nuevo.");
    }
  };

  const handleTarotReading = async (card: typeof TAROT_CARDS[0]) => {
    if (!tarotQuestion.trim() || isReadingCard) return;
    
    setSelectedCard(card);
    setIsReadingCard(true);
    setTarotReadingActive(true);
    
    if (!aiRef.current) return;

    try {
      const prompt = `El consultante pregunta: "${tarotQuestion}". Ha elegido la carta: "${card.name}". Por favor, como Zahara, realiza una lectura mística de esta carta en relación a su pregunta. Sé breve y mantén el tono de anciana sabia y misteriosa.`;
      
      const response = await aiRef.current.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: ZAHARA_SYSTEM_PROMPT,
          temperature: 0.9,
        }
      });

      const zaharaText = response.text || "Las cartas están en silencio por ahora...";
      const zaharaMessage: Message = { role: 'zahara', text: zaharaText, timestamp: Date.now() };
      setMessages(prev => [...prev, zaharaMessage]);
      
      if (!isMuted) {
        speak(zaharaText);
      } else {
        // If muted, keep the card lifted for a short duration so the user has time to read, then return to place
        setTimeout(() => {
          setTarotReadingActive(false);
        }, 8000);
      }
    } catch (err) {
      console.error("Error in tarot reading:", err);
      setError("Zahara no puede ver las cartas claramente. Intenta de nuevo.");
      setTarotReadingActive(false);
    } finally {
      setIsReadingCard(false);
    }
  };

  const shuffleTarot = () => {
    const shuffled = [...TAROT_CARDS].sort(() => Math.random() - 0.5);
    setShuffledCards(shuffled);
    setSelectedCard(null);
    setTarotReadingActive(false);
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsSpeaking(false);
  };

  useEffect(() => {
    if (mode === 'tarot') {
      shuffleTarot();
    }
  }, [mode]);

  const speak = (text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Try to find a good female Spanish voice for a "wise old woman" feel
    // Prioritize "Natural" or "Neural" voices if available for better quality
    const spanishVoices = voices.filter(v => v.lang.startsWith('es'));
    const preferredVoice = spanishVoices.find(v => 
      (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('online')) &&
      (v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('female'))
    ) || spanishVoices.find(v => 
      v.name.toLowerCase().includes('google') || 
      v.name.toLowerCase().includes('female') ||
      v.name.toLowerCase().includes('helena') ||
      v.name.toLowerCase().includes('monica')
    ) || spanishVoices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.lang = 'es-ES';
    utterance.pitch = 0.35; // Deeper, more ancient resonance
    utterance.rate = 0.55;  // Even slower, more deliberate storyteller pace
    utterance.volume = 1;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      setTarotReadingActive(false);
      // Alexa-style loop: listen again after speaking
      setTimeout(() => {
        if (!isMuted) startListening();
      }, 500);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setTarotReadingActive(false);
    };
    
    synthRef.current.speak(utterance);
  };

  const startListening = () => {
    if (isSpeaking) return;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.warn("Recognition already started");
      }
    }
  };

  const handlePayment = () => {
    // Simulate payment
    setIsPaid(true);
    // Initial greeting
    setTimeout(() => {
      const greeting = "Bienvenido, alma errante. He estado esperando tu llegada. ¿Qué secretos deseas que las estrellas te revelen hoy?";
      setMessages([{ role: 'zahara', text: greeting, timestamp: Date.now() }]);
      speak(greeting);
    }, 1000);
  };

  // --- Render Helpers ---
  if (!isPaid) {
    return (
      <div className="min-h-screen bg-[#0a0502] text-[#d4af37] flex flex-col items-center justify-center p-6 font-serif relative overflow-hidden">
        {/* Atmospheric Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#3a1510] rounded-full blur-[120px] opacity-30" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-[#ff4e00] rounded-full blur-[120px] opacity-10" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="z-10 text-center max-w-2xl"
        >
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-4 uppercase">Zahara</h1>
          <p className="text-xl md:text-2xl italic opacity-80 mb-12">El Oráculo Ancestral</p>
          
          <div className="relative w-64 h-64 mx-auto mb-12 group">
            <div className="absolute inset-0 bg-[#d4af37] rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity" />
            <div className="relative w-full h-full rounded-full border-2 border-[#d4af37]/30 overflow-hidden p-2">
              <div className="w-full h-full rounded-full border border-[#d4af37]/50 overflow-hidden bg-black/40 flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Zahara" className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700" referrerPolicy="no-referrer" />
                ) : (
                  <Sparkles className="w-12 h-12 animate-pulse" />
                )}
              </div>
            </div>
          </div>

          <p className="mb-8 text-lg opacity-70 leading-relaxed">
            Las estrellas se han alineado para este encuentro. Haz una ofrenda de $100 para despertar el oráculo y conocer tu destino.
          </p>

          <button 
            onClick={handlePayment}
            className="group relative px-12 py-4 bg-transparent border border-[#d4af37] rounded-full overflow-hidden transition-all hover:shadow-[0_0_30px_rgba(212,175,55,0.3)]"
          >
            <div className="absolute inset-0 bg-[#d4af37] translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            <span className="relative z-10 flex items-center gap-2 font-bold group-hover:text-black transition-colors">
              <Coins className="w-5 h-5" />
              Ofrecer $100
            </span>
          </button>
        </motion.div>

        <div className="absolute bottom-8 text-xs opacity-40 uppercase tracking-widest">
          El destino aguarda • Zahara v1.0
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0502] text-[#e0d8d0] font-serif flex flex-col relative overflow-hidden">
      {/* Atmospheric Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_30%,#3a1510_0%,transparent_60%)] opacity-40" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_10%_80%,#ff4e00_0%,transparent_50%)] opacity-10" />
        <div className="absolute inset-0 backdrop-blur-[100px]" />
      </div>

      {/* Header */}
      <header className="z-20 p-6 flex justify-between items-center border-b border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border border-[#d4af37]/50 overflow-hidden">
            <img src={avatarUrl || ""} alt="Zahara" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[#d4af37]">ZAHARA</h2>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-50">
              <div className={cn("w-1.5 h-1.5 rounded-full", isSpeaking ? "bg-green-500 animate-pulse" : "bg-white/20")} />
              {isSpeaking ? "Hablando..." : isListening ? "Escuchando..." : "En trance"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setMode(mode === 'chat' ? 'tarot' : 'chat')}
            className="px-4 py-1.5 rounded-full border border-[#d4af37]/30 text-xs font-bold hover:bg-[#d4af37]/10 transition-colors flex items-center gap-2"
          >
            {mode === 'chat' ? (
              <><Sparkles className="w-3.5 h-3.5" /> El Oráculo</>
            ) : (
              <><MessageSquare className="w-3.5 h-3.5" /> El Susurro</>
            )}
          </button>
          <button onClick={() => setShowHistory(!showHistory)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <History className="w-5 h-5 opacity-70" />
          </button>
          <button onClick={() => setIsMuted(!isMuted)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            {isMuted ? <VolumeX className="w-5 h-5 opacity-70" /> : <Volume2 className="w-5 h-5 opacity-70" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="z-10 flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side: Avatar & Visualization */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
          <div className="relative w-64 h-64 md:w-96 md:h-96">
            {/* Enhanced Ethereal Aura */}
            <AnimatePresence>
              {(isSpeaking || isListening) && (
                <div className="absolute inset-x-[-30%] inset-y-[-30%] pointer-events-none">
                  {/* Dynamic Cosmic Base Aura */}
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ 
                      scale: isSpeaking ? [1.1, 1.4, 1.2] : [1, 1.2, 1.1],
                      opacity: isSpeaking ? [0.3, 0.5, 0.3] : [0.15, 0.3, 0.15],
                      rotate: [0, 180, 360],
                    }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ 
                      duration: isSpeaking ? 4 : 10, 
                      repeat: Infinity, 
                      ease: "linear" 
                    }}
                    className={cn(
                      "absolute inset-0 rounded-full blur-3xl transition-colors duration-1000",
                      isSpeaking 
                        ? "bg-[radial-gradient(circle,rgba(255,78,0,0.4)_0%,rgba(106,13,173,0.2)_50%,transparent_70%)]" 
                        : "bg-[radial-gradient(circle,rgba(106,13,173,0.3)_0%,transparent_70%)]"
                    )}
                  />

                  {/* Ethereal Flare Overlay (Only when speaking) */}
                  {isSpeaking && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ 
                        opacity: [0.2, 0.6, 0.2],
                        scale: [1, 1.3, 1],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.3)_0%,transparent_60%)] blur-2xl"
                    />
                  )}
                  
                  {/* Mystic Gold Ring */}
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0, rotate: 0 }}
                    animate={{ 
                      scale: isSpeaking ? [1, 1.2, 1] : 1.1,
                      opacity: isSpeaking ? [0.4, 0.7, 0.4] : 0.3,
                      rotate: 360
                    }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ 
                      scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
                      opacity: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
                      rotate: { duration: isSpeaking ? 8 : 20, repeat: Infinity, ease: "linear" }
                    }}
                    className="absolute inset-[5%] border-[2px] border-[#d4af37]/50 rounded-full border-dashed"
                  />
                  <motion.div 
                    animate={{ rotate: -360 }}
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-[8%] border-[1px] border-[#d4af37]/20 rounded-full"
                  />

                  {/* Gentle Listening Pulse (When listening) */}
                  {isListening && (
                    <motion.div 
                      key="listening-rings"
                      className="absolute inset-0"
                    >
                      {[1, 2, 3].map((i) => (
                        <motion.div
                          key={i}
                          initial={{ scale: 1, opacity: 0.3 }}
                          animate={{ scale: 1 + (i * 0.3), opacity: 0 }}
                          transition={{ 
                            duration: 4, 
                            repeat: Infinity, 
                            delay: i * 0.8,
                            ease: "easeOut" 
                          }}
                          className="absolute inset-0 border border-[#d4af37]/20 rounded-full"
                        />
                      ))}
                    </motion.div>
                  )}

                  {/* Particles / Sparkles / Smoke */}
                  <div className="absolute inset-0 overflow-visible pointer-events-none">
                    {/* Stars/Sparkles - More dynamic and varied */}
                    {[...Array(12)].map((_, i) => (
                      <motion.div
                        key={`star-${i}`}
                        animate={{
                          y: [-20, -150 - (Math.random() * 50)],
                          x: [
                            (Math.random() - 0.5) * 100, 
                            (Math.random() - 0.5) * 200, 
                            (Math.random() - 0.5) * 150
                          ],
                          opacity: [0, 1, 0.5, 0],
                          scale: [0.2, 1.2, 0.8, 0.4],
                          rotate: [0, 180, 360],
                          filter: isSpeaking ? "drop-shadow(0 0 8px rgba(212, 175, 55, 0.8))" : "none"
                        }}
                        transition={{
                          duration: (isSpeaking ? 3 : 5) + Math.random() * 2,
                          repeat: Infinity,
                          delay: Math.random() * 5,
                          ease: "easeInOut"
                        }}
                        className="absolute bottom-1/2 left-1/2 w-2 h-2 text-[#d4af37]"
                      >
                        <Sparkles className="w-full h-full" />
                      </motion.div>
                    ))}

                    {/* Smoke Clouds - Ethereal Colors and Drifting Motion */}
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={`smoke-${i}`}
                        animate={{
                          y: [-20, -120],
                          x: [
                            (i - 2.5) * 50, 
                            (i - 2.5) * 70 + (Math.random() * 40 - 20),
                            (i - 2.5) * 60
                          ],
                          scale: [1, 3, 2],
                          opacity: isSpeaking ? [0, 0.25, 0] : [0, 0.1, 0],
                        }}
                        transition={{
                          duration: (isSpeaking ? 5 : 8) + Math.random() * 4,
                          repeat: Infinity,
                          delay: i * 1.2,
                          ease: "easeOut"
                        }}
                        className={cn(
                          "absolute bottom-1/4 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full blur-[60px] pointer-events-none",
                          i % 3 === 0 ? "bg-purple-500/20" : i % 3 === 1 ? "bg-orange-500/20" : "bg-white/10"
                        )}
                      />
                    ))}

                    {/* Mystic Wisps - Fast moving threads of light when speaking */}
                    {isSpeaking && [...Array(4)].map((_, i) => (
                      <motion.div
                        key={`wisp-${i}`}
                        animate={{
                          pathLength: [0, 1, 0],
                          opacity: [0, 0.4, 0],
                          rotate: [Math.random() * 360, Math.random() * 360 + 180],
                          scale: [0.8, 1.2, 1]
                        }}
                        transition={{
                          duration: 2 + Math.random() * 2,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                        className="absolute inset-[-50%] border border-[#d4af37]/30 rounded-full blur-[2px]"
                      />
                    ))}
                  </div>
                </div>
              )}
            </AnimatePresence>

            {/* Avatar Image */}
            <div className={cn(
              "relative w-full h-full rounded-full border-2 border-[#d4af37]/30 overflow-hidden p-3 transition-all duration-1000",
              isSpeaking ? "scale-105 shadow-[0_0_50px_rgba(212,175,55,0.2)]" : "scale-100"
            )}>
              <div className="w-full h-full rounded-full overflow-hidden bg-black/40">
                <img 
                  src={avatarUrl || ""} 
                  alt="Zahara" 
                  className={cn(
                    "w-full h-full object-cover transition-all duration-1000",
                    isSpeaking ? "scale-110 brightness-110" : "scale-100 brightness-90"
                  )}
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            {/* Listening Indicator */}
            {isListening && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[#d4af37] text-sm italic"
              >
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <motion.div 
                      key={i}
                      animate={{ height: [4, 12, 4] }}
                      transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.1 }}
                      className="w-1 bg-[#d4af37] rounded-full"
                    />
                  ))}
                </div>
                Zahara te escucha...
              </motion.div>
            )}
          </div>
        </div>

        {/* Right Side: Chat / Tarot Reading */}
        <div className="w-full md:w-[450px] bg-black/30 backdrop-blur-xl border-l border-white/10 flex flex-col">
          <AnimatePresence mode="wait">
            {mode === 'chat' ? (
              <motion.div 
                key="chat-mode"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                  {messages.map((msg, i) => (
                    <motion.div 
                      key={msg.timestamp}
                      initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "flex flex-col",
                        msg.role === 'user' ? "items-end" : "items-start"
                      )}
                    >
                      <span className="text-[10px] uppercase tracking-widest opacity-40 mb-2">
                        {msg.role === 'user' ? "Tú" : "Zahara"}
                      </span>
                      <div className={cn(
                        "max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed",
                        msg.role === 'user' 
                          ? "bg-white/5 border border-white/10 text-white/80" 
                          : "bg-[#d4af37]/10 border border-[#d4af37]/20 text-[#e0d8d0] italic mystic-glow-text"
                      )}>
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    </motion.div>
                  ))}
                  
                  {currentTranscript && (
                    <div className="flex flex-col items-end opacity-50">
                      <span className="text-[10px] uppercase tracking-widest mb-2">Escuchando...</span>
                      <div className="max-w-[90%] p-4 rounded-2xl text-sm bg-white/5 border border-white/5 italic">
                        {currentTranscript}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Controls */}
                <div className="p-6 border-t border-white/10 bg-black/40">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={isListening ? () => recognitionRef.current?.stop() : startListening}
                      disabled={isSpeaking}
                      className={cn(
                        "flex-1 h-14 rounded-full flex items-center justify-center gap-3 font-bold transition-all",
                        isListening 
                          ? "bg-red-500/20 border border-red-500/50 text-red-500" 
                          : "bg-[#d4af37] text-black hover:shadow-[0_0_20px_rgba(212,175,55,0.4)] disabled:opacity-50 disabled:grayscale"
                      )}
                    >
                      {isListening ? (
                        <>
                          <MicOff className="w-5 h-5" />
                          Detener
                        </>
                      ) : (
                        <>
                          <Mic className="w-5 h-5" />
                          Hablar con Zahara
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-center mt-4 opacity-40 uppercase tracking-widest">
                    Presiona para preguntar sobre tu destino
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="tarot-mode"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col p-6 overflow-hidden"
              >
                <div className="mb-6">
                  <h3 className="text-[#d4af37] font-bold uppercase tracking-widest text-xs mb-3">Tu pregunta al cosmos</h3>
                  <textarea 
                    value={tarotQuestion}
                    onChange={(e) => setTarotQuestion(e.target.value)}
                    placeholder="Escribe lo que inquieta tu alma..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm resize-none h-24 focus:outline-none focus:border-[#d4af37]/40 transition-colors"
                  />
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-hide">
                  {!selectedCard ? (
                    <div className="grid grid-cols-4 gap-3">
                      {shuffledCards.slice(0, 12).map((card, i) => (
                        <motion.button
                          key={i}
                          whileHover={{ scale: 1.05, y: -5 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleTarotReading(card)}
                          disabled={!tarotQuestion.trim() || isReadingCard}
                          className={cn(
                            "aspect-[2/3] bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-[#d4af37]/20 border border-[#d4af37]/40 rounded-lg flex items-center justify-center text-2xl shadow-lg transition-opacity",
                            (!tarotQuestion.trim() || isReadingCard) && "opacity-30 cursor-not-allowed"
                          )}
                        >
                          <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(circle,rgba(212,175,55,0.2)_0%,transparent_70%)]">
                            ✨
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center py-4"
                    >
                      <motion.div 
                        animate={{
                          y: tarotReadingActive ? -36 : 0,
                          scale: tarotReadingActive ? 1.08 : 1,
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 90,
                          damping: 14,
                        }}
                        className={cn(
                          "w-48 aspect-[2/3] bg-[#0a0502] border-2 rounded-xl flex flex-col items-center justify-center p-4 relative overflow-hidden mb-6 transition-all duration-700",
                          tarotReadingActive 
                            ? "border-[#d4af37] shadow-[0_0_50px_rgba(212,175,55,0.85),_0_0_25px_rgba(168,85,247,0.5)] bg-[#120703]"
                            : "border-[#d4af37]/60 shadow-[0_0_30px_rgba(212,175,55,0.25)]"
                        )}
                      >
                        <div className={cn(
                          "absolute inset-0 transition-opacity duration-1000 bg-[radial-gradient(circle,rgba(212,175,55,0.25)_0%,transparent_70%)]",
                          tarotReadingActive ? "opacity-100 animate-pulse" : "opacity-40"
                        )} />
                        
                        {tarotReadingActive && (
                          <motion.div
                            initial={{ x: "-100%" }}
                            animate={{ x: "100%" }}
                            transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
                            className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 pointer-events-none"
                          />
                        )}
                        <span className={cn(
                          "text-6xl mb-4 z-10 transition-all duration-700",
                          tarotReadingActive ? "scale-110 drop-shadow-[0_0_15px_rgba(212,175,55,0.6)]" : ""
                        )}>{selectedCard.image}</span>
                        <span className="text-[#d4af37] font-bold uppercase tracking-widest text-center z-10">{selectedCard.name}</span>
                      </motion.div>
                      
                      <button 
                        onClick={shuffleTarot}
                        className="text-[10px] uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity flex items-center gap-2"
                      >
                        <Play className="w-3 h-3" /> Barajar de nuevo
                      </button>

                      {/* Display the latest reading text here as well for focus */}
                      {messages[messages.length - 1]?.role === 'zahara' && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mt-8 text-sm italic text-[#e0d8d0] leading-relaxed text-center px-4 mystic-glow-text"
                        >
                          <ReactMarkdown>{messages[messages.length - 1].text}</ReactMarkdown>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </div>
                
                <p className="text-[10px] text-center mt-6 opacity-40 uppercase tracking-widest">
                  Formula tu pregunta y elige una carta para que Zahara te guíe
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* History Modal */}
      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1a1614] border border-[#d4af37]/30 rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-bold text-[#d4af37] flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Crónicas del Destino
                </h3>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/10 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.length === 0 ? (
                  <p className="text-center opacity-40 italic py-12">No hay crónicas aún...</p>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i} className="border-l-2 border-[#d4af37]/20 pl-4">
                      <span className="text-[10px] uppercase tracking-widest opacity-40 block mb-1">
                        {msg.role === 'user' ? "Tú" : "Zahara"} • {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                      <p className={cn("text-sm", msg.role === 'zahara' ? "italic text-[#e0d8d0]" : "text-white/60")}>
                        {msg.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-red-900/80 border border-red-500 text-white px-6 py-3 rounded-full flex items-center gap-3 backdrop-blur-md"
          >
            <Info className="w-5 h-5" />
            <span className="text-sm">{error}</span>
            <button onClick={() => setError(null)} className="ml-2 hover:opacity-70">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
