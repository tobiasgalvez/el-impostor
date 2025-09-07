/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from "@google/genai";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";

// --- TYPES ---
type GameState = "setup" | "reveal" | "round" | "end";
type Player = {
  name: string;
  role: "impostor" | "crew";
  word: string;
};

// --- CONSTANTS ---
const CATEGORIES = [
  "Fútbol",
  "Películas y series",
  "Profesiones",
  "Comida",
  "Ciudades famosas",
];
const TIME_OPTIONS = [
  { label: "2 min", value: 120 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "Ilimitado", value: 0 },
];
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;

// --- API HELPER ---
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

// --- UI COMPONENTS ---

const Loader = () => (
  <div className="flex justify-center items-center p-4">
    <div className="w-8 h-8 border-4 border-dashed rounded-full animate-spin border-cyan-400"></div>
    <p className="ml-4 text-lg text-white">Generando palabras...</p>
  </div>
);

type FlipCardProps = {
  player: Player;
  onAdvance: () => void;
};

const FlipCard: React.FC<FlipCardProps> = ({ player, onAdvance }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleCardClick = () => {
    if (isFlipped) {
      setIsFlipped(false);
      setTimeout(onAdvance, 400);
    } else {
      setIsFlipped(true);
    }
  };

  return (
    <div
      className="card w-48 h-64 cursor-pointer"
      onClick={handleCardClick}
      aria-live="polite"
    >
      <div className={`card-inner ${isFlipped ? "is-flipped" : ""}`}>
        <div className="card-front bg-slate-700 hover:bg-slate-600 flex flex-col justify-center items-center p-4 shadow-lg">
          <h3 className="text-2xl font-bold text-center text-white">{player.name}</h3>
          <p className="mt-4 text-slate-300 text-center text-white">
            {isFlipped ? "Toca para ocultar y continuar" : "Toca para revelar"}
          </p>
        </div>
        <div className="card-back bg-slate-800 flex flex-col justify-center items-center p-4 shadow-lg border-2 border-cyan-400">
          {player.role === "impostor" ? (
            <h3 className="text-3xl font-bold text-red-500 text-center">IMPOSTOR</h3>
          ) : (
            <>
              <p className="text-slate-300 text-center text-white">La palabra es:</p>
              <h3 className="text-2xl font-bold text-cyan-400 mt-2 text-center">{player.word}</h3>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

type TimerProps = {
  seconds: number;
  onFinish: () => void;
};

const Timer: React.FC<TimerProps> = ({ seconds, onFinish }) => {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    if (timeLeft <= 0) {
      onFinish();
      return;
    }
    const intervalId = setInterval(() => {
      setTimeLeft(timeLeft - 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [timeLeft, onFinish]);

  const minutes = Math.floor(timeLeft / 60);
  const remainingSeconds = timeLeft % 60;

  return (
    <div className="text-6xl font-mono p-4 bg-slate-800 rounded-lg shadow-inner text-white">
      {String(minutes).padStart(2, "0")}:{String(remainingSeconds).padStart(2, "0")}
    </div>
  );
};

// --- MAIN APP COMPONENT ---

export function App() {
  // --- STATE MANAGEMENT ---
  const [gameState, setGameState] = useState<GameState>("setup");
  const [players, setPlayers] = useState<Player[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>(CATEGORIES);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [numPlayers, setNumPlayers] = useState(MIN_PLAYERS);
  const [playerNames, setPlayerNames] = useState<string[]>(
    Array(MAX_PLAYERS).fill("")
  );
  const [numImpostors, setNumImpostors] = useState(1);
  const [timeLimit, setTimeLimit] = useState(0); // 0 for unlimited
  const [categoryWords, setCategoryWords] = useState<{ [key: string]: string[] }>(
    {}
  );
  const [isLoadingWords, setIsLoadingWords] = useState(false);
  const [revealTurnIndex, setRevealTurnIndex] = useState(0);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryWords, setNewCategoryWords] = useState("");

  // --- DERIVED STATE & MEMOIZED VALUES ---
  const currentCategoryWords = useMemo(
    () => categoryWords[category] || [],
    [categoryWords, category]
  );
  const maxImpostors = useMemo(() => Math.max(1, numPlayers - 2), [numPlayers]);
  const isSetupValid = useMemo(() => {
    const names = playerNames.slice(0, numPlayers);
    return (
      names.every((name) => name.trim() !== "") &&
      names.length > 0 &&
      currentCategoryWords.length > 0
    );
  }, [playerNames, numPlayers, currentCategoryWords]);

  // --- API CALL ---
  const generateWordsForCategory = useCallback(
    async (cat: string) => {
      if (categoryWords[cat] || !CATEGORIES.includes(cat)) return;
      setIsLoadingWords(true);
      try {
        const schema = {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                "A list of 50 well-known items from the specified category.",
            },
          },
          required: ["items"],
        };

        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Genera una lista JSON con 50 ${cat} muy populares y conocidos mundialmente, bajo la clave "items".`,
          config: {
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        });

        const parsed = JSON.parse(result.text ?? "");
        setCategoryWords((prev) => ({ ...prev, [cat]: parsed.items || [] }));
      } catch (error) {
        console.error("Error generating words:", error);
        setCategoryWords((prev) => ({
          ...prev,
          [cat]: ["Fallback 1", "Fallback 2"],
        }));
      } finally {
        setIsLoadingWords(false);
      }
    },
    [categoryWords]
  );

  useEffect(() => {
    generateWordsForCategory(category);
  }, [category, generateWordsForCategory]);

  // --- GAME LOGIC HANDLERS ---
  const handleStartGame = () => {
    const names = playerNames.slice(0, numPlayers);
    const shuffledNames = [...names].sort(() => Math.random() - 0.5);
    const impostorNames = shuffledNames.slice(0, numImpostors);
    const word =
      currentCategoryWords[
        Math.floor(Math.random() * currentCategoryWords.length)
      ];

    const newPlayers: Player[] = names.map((name) => ({
      name,
      role: impostorNames.includes(name) ? "impostor" : "crew",
      word: impostorNames.includes(name) ? "" : word,
    }));

    setPlayers(newPlayers.sort(() => Math.random() - 0.5));
    setRevealTurnIndex(0);
    setGameState("reveal");
  };

  const handleNextRevealTurn = () => {
    setRevealTurnIndex((prevIndex) => prevIndex + 1);
  };

  const handleSaveCustomCategory = () => {
    if (newCategoryName.trim() === "" || newCategoryWords.trim() === "") return;
    const wordsArray = newCategoryWords
      .split(/[\n,]/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (wordsArray.length === 0) return;

    setAllCategories((prev) => [...prev, newCategoryName]);
    setCategoryWords((prev) => ({ ...prev, [newCategoryName]: wordsArray }));
    setCategory(newCategoryName);

    setIsCreatingCategory(false);
    setNewCategoryName("");
    setNewCategoryWords("");
  };

  const handleEndRound = () => setGameState("end");
  const handlePlayAgain = () => setGameState("setup");

  // --- RENDER LOGIC ---

  const renderCreateCategoryForm = () => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
      <div className="bg-slate-800 p-8 rounded-lg shadow-xl w-full max-w-md space-y-4 border border-slate-600">
        <h2 className="text-2xl font-bold text-cyan-400">Crear Categoría Personalizada</h2>
        <input
          type="text"
          placeholder="Nombre de la categoría"
          value={newCategoryName}
          onChange={e => setNewCategoryName(e.target.value)}
          className="w-full p-2 bg-slate-700 rounded-md border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        />
        <textarea
          placeholder="Escribe las palabras separadas por comas o en líneas nuevas..."
          value={newCategoryWords}
          onChange={e => setNewCategoryWords(e.target.value)}
          rows={5}
          className="w-full p-2 bg-slate-700 rounded-md border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        />
        <div className="flex justify-end space-x-4">
          <button onClick={() => setIsCreatingCategory(false)} className="py-2 px-4 bg-slate-600 hover:bg-slate-500 rounded-md transition-colors">Cancelar</button>
          <button onClick={handleSaveCustomCategory} className="py-2 px-4 bg-cyan-600 hover:bg-cyan-500 rounded-md transition-colors font-semibold">Guardar</button>
        </div>
      </div>
    </div>
  );

  const renderSetup = () => (
    <div className="w-full max-w-2xl mx-auto p-8 bg-slate-800 rounded-xl shadow-2xl space-y-6">
      <h2 className="text-3xl font-bold text-center text-cyan-400">Configurar Partida</h2>
      
      <div>
        <label className="block text-lg font-semibold mb-2">Categoría</label>
        <div className="flex flex-wrap items-center gap-2">
            {allCategories.map(cat => (
                <button key={cat} onClick={() => setCategory(cat)} className={`p-3 rounded-lg text-sm transition-colors ${category === cat ? 'bg-cyan-500 font-bold' : 'bg-slate-700 hover:bg-slate-600'}`}>
                    {cat}
                </button>
            ))}
            <button onClick={() => setIsCreatingCategory(true)} className="p-3 rounded-lg text-sm bg-slate-600 hover:bg-slate-500 transition-colors font-bold">
                + Crear
            </button>
        </div>
        {isLoadingWords && <Loader />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
            <label htmlFor="numPlayers" className="block text-lg font-semibold mb-2">Jugadores: {numPlayers}</label>
            <input type="range" id="numPlayers" min={MIN_PLAYERS} max={MAX_PLAYERS} value={numPlayers} onChange={e => {
                const val = parseInt(e.target.value);
                setNumPlayers(val);
                if (numImpostors > Math.max(1, val - 2)) {
                    setNumImpostors(Math.max(1, val - 2));
                }
            }} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
        </div>
        <div>
            <label htmlFor="numImpostors" className="block text-lg font-semibold mb-2">Impostores: {numImpostors}</label>
            <input type="range" id="numImpostors" min="1" max={maxImpostors} value={numImpostors} onChange={e => setNumImpostors(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
        </div>
      </div>
      
      <div>
        <label className="block text-lg font-semibold mb-2">Nombres de Jugadores</label>
        <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: numPlayers }).map((_, i) => (
                <input key={i} type="text" placeholder={`Jugador ${i + 1}`} value={playerNames[i]} onChange={e => {
                    const newNames = [...playerNames];
                    newNames[i] = e.target.value;
                    setPlayerNames(newNames);
                }} className="w-full p-2 bg-slate-700 rounded-md border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            ))}
        </div>
      </div>

       <div>
        <label className="block text-lg font-semibold mb-2">Tiempo de Ronda</label>
        <div className="flex space-x-2">
            {TIME_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setTimeLimit(opt.value)} className={`flex-1 p-2 rounded-lg transition-colors text-sm ${timeLimit === opt.value ? 'bg-cyan-500 font-bold' : 'bg-slate-700 hover:bg-slate-600'}`}>
                    {opt.label}
                </button>
            ))}
        </div>
      </div>

      <button onClick={handleStartGame} disabled={!isSetupValid || isLoadingWords} className="w-full py-3 mt-4 text-xl font-bold bg-green-600 rounded-lg hover:bg-green-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors">
        ¡Empezar a Jugar!
      </button>
    </div>
  );

  const renderReveal = () => {
    const isRevealFinished = revealTurnIndex >= players.length;
    const currentPlayer = players[revealTurnIndex];

    return (
        <div className="w-full max-w-4xl mx-auto p-8 text-center">
            <h1 className="text-4xl font-bold text-cyan-400 mb-2">Revelación de Roles</h1>
            
            {isRevealFinished ? (
                <>
                    <p className="text-slate-300 mb-8">Todos han visto su rol. ¡Prepárense!</p>
                    <button onClick={() => setGameState("round")} className="mt-12 py-3 px-8 text-xl font-bold bg-cyan-500 rounded-lg hover:bg-cyan-400 transition-colors animate-pulse">
                        Comenzar Ronda
                    </button>
                </>
            ) : (
                <>
                    <p className="text-slate-300 mb-8">Pasa el dispositivo al siguiente jugador. ¡No mires la pantalla de los demás!</p>
                    <h2 className="text-3xl font-semibold text-white mb-6">Turno de: <span className="font-bold text-cyan-300">{currentPlayer.name}</span></h2>
                    <div className="flex justify-center">
                        <FlipCard player={currentPlayer} onAdvance={handleNextRevealTurn} />
                    </div>
                </>
            )}
        </div>
    );
  };

  const renderRound = () => (
    <div className="w-full max-w-xl mx-auto p-8 text-center bg-slate-800 rounded-xl shadow-2xl">
        <h1 className="text-4xl font-bold text-cyan-400 mb-6">¡La ronda ha comenzado!</h1>
        {timeLimit > 0 ? <Timer seconds={timeLimit} onFinish={handleEndRound} /> : <p className="text-2xl my-8">Tiempo Ilimitado</p>}
        <button onClick={handleEndRound} className="mt-8 py-3 px-8 text-xl font-bold bg-red-600 rounded-lg hover:bg-red-500 transition-colors">
            Revelar Impostores
        </button>
    </div>
  );

  const renderEnd = () => {
    const impostors = players.filter(p => p.role === 'impostor');
    const word = players.find(p => p.role === 'crew')?.word;
    return (
        <div className="w-full max-w-lg mx-auto p-8 text-center bg-slate-800 rounded-xl shadow-2xl">
            <h1 className="text-4xl font-bold text-red-500 mb-4">¡Fin de la Partida!</h1>
            <h2 className="text-2xl font-semibold mb-2">El/los impostor(es) era(n):</h2>
            <div className="space-y-1 mb-6">
                {impostors.map(p => <p key={p.name} className="text-3xl font-bold text-white">{p.name}</p>)}
            </div>
            <p className="text-xl text-slate-300">La palabra era: <span className="font-bold text-cyan-400">{word}</span></p>
            <button onClick={handlePlayAgain} className="mt-8 py-3 px-8 text-xl font-bold bg-cyan-500 rounded-lg hover:bg-cyan-400 transition-colors">
                Jugar de Nuevo
            </button>
        </div>
    );
  };

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-900 to-indigo-900 text-white">
      <h1 className="text-6xl font-bold text-center text-white mb-8 drop-shadow-lg">
        EL IMPOSTOR
      </h1>
      
      {isCreatingCategory && renderCreateCategoryForm()}
      
      <div className="w-full flex items-center justify-center">
          {gameState === 'setup' && renderSetup()}
          {gameState === 'reveal' && renderReveal()}
          {gameState === 'round' && renderRound()}
          {gameState === 'end' && renderEnd()}
      </div>
    </main>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);