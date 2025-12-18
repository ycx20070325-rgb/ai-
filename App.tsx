import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw, Trophy, Loader2, Play, ChevronRight, ScanLine, Shuffle, Activity, Signal, Zap, Gamepad2, History } from 'lucide-react';
import CameraFeed, { CameraFeedHandle } from './components/CameraFeed';
import FruitGame from './components/FruitGame';
import { generateTargetPoseImage, comparePoses } from './services/geminiService';
import { GameState, GameLevel, Difficulty, GameHistory } from './types';
import { POSSIBLE_POSES, DIFFICULTY_CONFIG } from './constants';

const TOTAL_LEVELS = 5;

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [levels, setLevels] = useState<GameLevel[]>(
    Array.from({ length: TOTAL_LEVELS }, (_, i) => ({
      id: i + 1,
      description: '',
      targetImageBase64: null,
      userMatchImageBase64: null
    }))
  );
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [currentScore, setCurrentScore] = useState(0);
  const [gameTotalScore, setGameTotalScore] = useState(0); // New Global Score for Fruit/Pose game
  const [feedback, setFeedback] = useState("Align your body with the skeleton");
  const [isVerifying, setIsVerifying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [highScores, setHighScores] = useState<GameHistory[]>([]);
  
  const cameraRef = useRef<CameraFeedHandle>(null);

  // Load High Scores on Mount
  useEffect(() => {
    const saved = localStorage.getItem('poseMatchScores');
    if (saved) {
      try {
        setHighScores(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load scores", e);
      }
    }
  }, []);

  // Helper to pick a random pose that hasn't been used recently
  const getRandomPose = () => {
    return POSSIBLE_POSES[Math.floor(Math.random() * POSSIBLE_POSES.length)];
  };

  const startLevel = async (levelIndex: number) => {
    setGameState(GameState.GENERATING_TARGET);
    setCurrentScore(0);
    setFeedback("Align your body with the skeleton");
    
    try {
      const poseDesc = getRandomPose();
      const config = DIFFICULTY_CONFIG[difficulty];
      const image = await generateTargetPoseImage(poseDesc, config.complexityPrompt);
      
      setLevels(prev => {
        const newLevels = [...prev];
        newLevels[levelIndex] = {
          ...newLevels[levelIndex],
          description: poseDesc,
          targetImageBase64: image
        };
        return newLevels;
      });
      
      setGameState(GameState.PLAYING);
    } catch (e) {
      console.error(e);
      setGameState(GameState.ERROR);
    }
  };

  const handleGameStart = () => {
    setCurrentLevelIndex(0);
    setGameTotalScore(0); // Reset total score
    // Reset levels
    setLevels(
      Array.from({ length: TOTAL_LEVELS }, (_, i) => ({
        id: i + 1,
        description: '',
        targetImageBase64: null,
        userMatchImageBase64: null
      }))
    );
    startLevel(0);
  };

  const handleSwitchPose = () => {
    if (gameState !== GameState.PLAYING || isVerifying || countdown !== null) return;
    
    // Penalty for switching (-1)
    setGameTotalScore(prev => prev - 1);
    
    // Simply restart the current level to generate a new pose
    startLevel(currentLevelIndex);
  };

  // Countdown Logic
  useEffect(() => {
    if (countdown === null) return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((prev) => (prev !== null ? prev - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Countdown hit 0
      setCountdown(null);
      executeVerification();
    }
  }, [countdown]);

  const startVerificationSequence = () => {
    if (gameState !== GameState.PLAYING || isVerifying || countdown !== null) return;
    setCountdown(5);
  };

  const executeVerification = async () => {
    if (gameState !== GameState.PLAYING || isVerifying) return;
    
    const userSnapshot = cameraRef.current?.capture();
    const targetSnapshot = levels[currentLevelIndex].targetImageBase64;

    if (!userSnapshot || !targetSnapshot) return;

    setIsVerifying(true);
    
    try {
      const result = await comparePoses(targetSnapshot, userSnapshot);
      setCurrentScore(result.score);
      setFeedback(result.feedback);

      const requiredScore = DIFFICULTY_CONFIG[difficulty].threshold;

      if (result.score >= requiredScore) {
        handleSuccess(userSnapshot);
      } else {
        // Just show feedback, stay in playing
      }
    } catch (e) {
      console.error("Comparison failed", e);
      setFeedback("Error checking pose. Try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSuccess = (userImage: string) => {
    setGameState(GameState.SUCCESS_ANIMATION);
    
    // Reward for success (+2)
    setGameTotalScore(prev => prev + 2);

    // Save user image
    setLevels(prev => {
      const newLevels = [...prev];
      newLevels[currentLevelIndex].userMatchImageBase64 = userImage;
      return newLevels;
    });
  };

  const saveGameResult = () => {
    const newEntry: GameHistory = {
      timestamp: Date.now(),
      score: gameTotalScore,
      difficulty: difficulty
    };
    
    // Keep top 5 scores
    const updatedScores = [...highScores, newEntry]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
      
    setHighScores(updatedScores);
    localStorage.setItem('poseMatchScores', JSON.stringify(updatedScores));
  };

  const handleNextLevel = () => {
    if (currentLevelIndex < TOTAL_LEVELS - 1) {
      setCurrentLevelIndex(prev => prev + 1);
      startLevel(currentLevelIndex + 1);
    } else {
      saveGameResult();
      setGameState(GameState.FINISHED);
    }
  };

  // Callback for fruit game scoring
  const handleFruitScore = (delta: number) => {
    setGameTotalScore(prev => prev + delta);
  };

  // Rendering
  return (
    <div className="fixed inset-0 bg-black flex flex-col md:flex-row overflow-hidden font-sans">
      
      {/* Intro Screen */}
      {gameState === GameState.IDLE && (
        <div className="absolute inset-0 z-50 bg-neutral-900 flex flex-col items-center justify-center p-8 text-center text-white">
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] opacity-10"></div>
           
           {/* High Scores Corner */}
           <div className="absolute top-6 right-6 md:top-8 md:right-8 bg-black/40 backdrop-blur-md p-4 rounded-xl border border-white/10 text-right min-w-[200px]">
              <h3 className="text-white font-bold text-sm uppercase mb-3 flex items-center justify-end gap-2 border-b border-white/10 pb-2">
                <Trophy className="w-4 h-4 text-yellow-500"/> Top Scores
              </h3>
              {highScores.length === 0 ? (
                <p className="text-neutral-500 text-xs py-2">No games played yet</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {highScores.map((score, i) => (
                     <div key={i} className="flex justify-between items-center text-xs text-neutral-300">
                       <span className="opacity-75 bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{DIFFICULTY_CONFIG[score.difficulty].label}</span>
                       <span className="font-mono font-bold text-white text-yellow-400">{score.score} pts</span> 
                     </div>
                  ))}
                </div>
              )}
           </div>

           <h1 className="text-6xl md:text-8xl font-bold mb-6 tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
             POSE MATCH
           </h1>
           <p className="text-neutral-400 mb-8 max-w-lg text-lg">
             Align your body to match the AI skeleton. Slice fruits for bonus points!
           </p>

           <div className="flex gap-4 mb-10">
             {[
               { level: Difficulty.EASY, icon: Signal, color: "text-green-400 border-green-400/30 hover:bg-green-400/10" },
               { level: Difficulty.MEDIUM, icon: Activity, color: "text-yellow-400 border-yellow-400/30 hover:bg-yellow-400/10" },
               { level: Difficulty.HARD, icon: Zap, color: "text-red-400 border-red-400/30 hover:bg-red-400/10" },
             ].map((item) => (
               <button
                 key={item.level}
                 onClick={() => setDifficulty(item.level)}
                 className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all w-32 ${
                   difficulty === item.level ? "bg-white/10 border-white scale-105" : `bg-transparent ${item.color} opacity-60 hover:opacity-100`
                 }`}
               >
                 <item.icon className="w-8 h-8 mb-2" />
                 <span className="font-bold uppercase text-sm">{DIFFICULTY_CONFIG[item.level].label}</span>
                 <span className="text-xs opacity-70 mt-1">{DIFFICULTY_CONFIG[item.level].threshold}% match</span>
               </button>
             ))}
           </div>

           <button 
             onClick={handleGameStart}
             className="group relative bg-white text-black px-12 py-6 rounded-full font-bold text-xl overflow-hidden hover:bg-neutral-200 transition-all flex items-center gap-4 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
           >
             START GAME <Play className="w-6 h-6 fill-current" />
           </button>
        </div>
      )}

      {/* Finished Screen */}
      {gameState === GameState.FINISHED && (
        <div className="absolute inset-0 z-50 bg-white flex flex-col items-center p-8 text-center overflow-y-auto">
            <div className="mt-8 flex flex-col items-center">
              <Trophy className="w-16 h-16 text-yellow-500 mb-4 animate-bounce" />
              <h2 className="text-4xl font-bold text-neutral-900 mb-2">SEQUENCE COMPLETE</h2>
              <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 mb-6">
                {gameTotalScore} PTS
              </div>
            </div>
            
            {/* Final Result Composite - Grid Layout for 5 items */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8 w-full max-w-5xl px-4">
                {levels.map((lvl) => (
                  <div key={lvl.id} className="relative aspect-square bg-black rounded-xl overflow-hidden shadow-lg border-2 border-white group">
                    {/* Background: Original Target */}
                    {lvl.targetImageBase64 && (
                       <img src={lvl.targetImageBase64} className="absolute inset-0 w-full h-full object-contain opacity-50 bg-white" />
                    )}
                    {/* Foreground: User Match */}
                    {lvl.userMatchImageBase64 && (
                      <img src={lvl.userMatchImageBase64} className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-90" />
                    )}
                    <div className="absolute top-2 left-2 bg-black/80 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
                      #{lvl.id}
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex flex-col md:flex-row items-start gap-8 w-full max-w-4xl mb-8">
               {/* Leaderboard on Finish Screen */}
               <div className="flex-1 w-full bg-neutral-100 rounded-xl p-6 border border-neutral-200">
                  <h3 className="text-neutral-500 font-bold uppercase text-sm mb-4 flex items-center gap-2">
                    <History className="w-4 h-4"/> Recent High Scores
                  </h3>
                  <div className="flex flex-col gap-2">
                    {highScores.map((score, i) => (
                      <div key={i} className={`flex justify-between items-center p-3 rounded-lg ${score.score === gameTotalScore && score.timestamp > Date.now() - 5000 ? 'bg-yellow-100 border border-yellow-200' : 'bg-white'}`}>
                        <div className="flex items-center gap-3">
                           <span className="font-mono text-neutral-400 font-bold text-sm">#{i+1}</span>
                           <span className={`text-xs px-2 py-1 rounded font-bold uppercase ${
                              score.difficulty === Difficulty.HARD ? 'bg-red-100 text-red-600' :
                              score.difficulty === Difficulty.MEDIUM ? 'bg-yellow-100 text-yellow-600' :
                              'bg-green-100 text-green-600'
                           }`}>{DIFFICULTY_CONFIG[score.difficulty].label}</span>
                        </div>
                        <span className="font-bold text-neutral-900">{score.score} pts</span>
                      </div>
                    ))}
                  </div>
               </div>
            </div>

            <button 
              onClick={() => setGameState(GameState.IDLE)}
              className="bg-black text-white px-10 py-4 rounded-full font-bold hover:scale-105 transition-all flex items-center gap-3 shadow-xl mb-12"
            >
              <RefreshCw className="w-5 h-5" /> PLAY AGAIN
            </button>
        </div>
      )}

      {/* Main Game Split View */}
      {(gameState !== GameState.IDLE && gameState !== GameState.FINISHED) && (
        <>
          {/* Left Panel: Target */}
          <div className="relative w-full md:w-1/2 h-1/2 md:h-full bg-white flex items-center justify-center p-8 border-b-4 md:border-b-0 md:border-r-4 border-black z-10">
            {gameState === GameState.GENERATING_TARGET ? (
              <div className="flex flex-col items-center gap-6 animate-pulse">
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
                <p className="text-neutral-500 font-mono text-lg tracking-widest">GENERATING SKELETON...</p>
                <p className="text-xs text-neutral-400 bg-neutral-100 px-3 py-1 rounded-full uppercase">{DIFFICULTY_CONFIG[difficulty].label} Mode</p>
              </div>
            ) : levels[currentLevelIndex]?.targetImageBase64 ? (
              <div className="relative w-full h-full flex items-center justify-center">
                 <img 
                    src={levels[currentLevelIndex].targetImageBase64!} 
                    alt="Target Pose" 
                    className="max-w-full max-h-full object-contain drop-shadow-2xl"
                  />
                  <div className="absolute top-0 left-0 flex gap-2">
                    <div className="bg-neutral-100 px-4 py-2 rounded-lg border border-neutral-200">
                      <p className="text-neutral-900 font-bold uppercase text-sm tracking-wider">Target {currentLevelIndex + 1} / {TOTAL_LEVELS}</p>
                    </div>
                    <div className="bg-black/5 px-3 py-2 rounded-lg">
                      <p className="text-neutral-500 font-bold uppercase text-xs tracking-wider">{DIFFICULTY_CONFIG[difficulty].label}</p>
                    </div>
                  </div>
                  <div className="absolute bottom-0 w-full text-center">
                     <p className="text-neutral-400 text-sm font-mono max-w-md mx-auto">{levels[currentLevelIndex].description}</p>
                  </div>
              </div>
            ) : null}
          </div>

          {/* Right Panel: Camera & Controls */}
          <div className="relative w-full md:w-1/2 h-1/2 md:h-full bg-black">
             <CameraFeed isActive={true} ref={cameraRef} />
             
             {/* Fruit Game Overlay - Active when Playing */}
             <FruitGame 
               isActive={gameState === GameState.PLAYING} 
               videoElement={cameraRef.current?.video || null}
               onScoreUpdate={handleFruitScore}
             />

             {/* Total Score Indicator (Top Left of Camera) */}
             <div className="absolute top-8 left-8 z-20">
               <div className="bg-black/40 backdrop-blur-md border border-white/20 p-3 rounded-xl flex items-center gap-3">
                 <Gamepad2 className="w-6 h-6 text-yellow-400" />
                 <div>
                   <p className="text-white font-bold text-2xl leading-none">{gameTotalScore}</p>
                   <p className="text-neutral-400 text-[10px] uppercase font-bold">Total Score</p>
                 </div>
               </div>
             </div>

             {/* Countdown Overlay */}
             {countdown !== null && (
               <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                 <div className="text-white text-9xl font-bold animate-pulse tabular-nums">
                   {countdown}
                 </div>
               </div>
             )}

             {/* Pose Match Score Overlay (Top Right) */}
             {currentScore > 0 && (
               <div className="absolute top-8 right-8 z-20">
                 <div className={`flex flex-col items-end ${currentScore >= DIFFICULTY_CONFIG[difficulty].threshold ? 'text-green-400' : 'text-white'}`}>
                    <span className="text-6xl font-bold tracking-tighter">{currentScore}%</span>
                    <span className="text-sm font-mono uppercase opacity-75">
                      Match Score (Req: {DIFFICULTY_CONFIG[difficulty].threshold}%)
                    </span>
                 </div>
               </div>
             )}

             {/* Bottom Controls Bar */}
             <div className="absolute bottom-0 left-0 w-full p-8 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col items-center gap-4 z-30">
                
                {/* Feedback Text */}
                <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-xl border border-white/10 mb-2">
                   <p className="text-white text-lg font-medium text-center">{feedback}</p>
                </div>

                {/* Control Buttons */}
                {gameState === GameState.SUCCESS_ANIMATION ? (
                  <button 
                    onClick={handleNextLevel}
                    className="w-full max-w-md bg-green-500 hover:bg-green-400 text-black text-xl font-bold py-6 rounded-2xl shadow-[0_0_40px_rgba(34,197,94,0.5)] transition-all flex items-center justify-center gap-3 animate-bounce-short"
                  >
                    {currentLevelIndex < TOTAL_LEVELS - 1 ? 'NEXT POSE (+2 PTS)' : 'FINISH GAME (+2 PTS)'} <ChevronRight className="w-6 h-6" />
                  </button>
                ) : (
                  <div className="flex gap-4 w-full max-w-md">
                     <button
                        onClick={handleSwitchPose}
                        disabled={isVerifying || gameState === GameState.GENERATING_TARGET || countdown !== null}
                        className="bg-white/10 hover:bg-white/20 text-white p-6 rounded-2xl transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-1"
                        title="Switch Pose (-1 Point)"
                     >
                        <Shuffle className="w-6 h-6" />
                        <span className="text-[10px] font-bold text-red-300">-1 PT</span>
                     </button>
                     <button 
                        onClick={startVerificationSequence}
                        disabled={isVerifying || gameState === GameState.GENERATING_TARGET || countdown !== null}
                        className={`flex-1 text-xl font-bold py-6 rounded-2xl shadow-2xl transition-all flex items-center justify-center gap-3
                          ${(isVerifying || countdown !== null)
                            ? 'bg-neutral-800 text-neutral-400 cursor-wait' 
                            : 'bg-white hover:bg-neutral-200 text-black'}`}
                      >
                        {countdown !== null ? (
                          <><Loader2 className="w-6 h-6 animate-spin" /> GET READY...</>
                        ) : isVerifying ? (
                          <><Loader2 className="w-6 h-6 animate-spin" /> ANALYZING...</>
                        ) : (
                          <><ScanLine className="w-6 h-6" /> VERIFY POSE</>
                        )}
                      </button>
                  </div>
                )}
             </div>

             {/* Success Overlay Effect */}
             {gameState === GameState.SUCCESS_ANIMATION && (
                <div className="absolute inset-0 border-8 border-green-500 pointer-events-none animate-pulse"></div>
             )}
          </div>
        </>
      )}
    </div>
  );
};

export default App;