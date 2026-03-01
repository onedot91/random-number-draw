import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, RotateCcw, Play, Volume2, VolumeX, X } from 'lucide-react';
import confetti from 'canvas-confetti';

let sharedAudioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!sharedAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass();
    }
  }
  // Resume context if it was suspended by the browser's autoplay policy
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
};

const playSound = (type: 'tick' | 'pop') => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  
  if (type === 'tick') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600 + Math.random() * 100, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  } else if (type === 'pop') {
    // 1. Swoosh up during the scale-up phase (0 to 0.28s)
    const swooshOsc = ctx.createOscillator();
    const swooshGain = ctx.createGain();
    swooshOsc.type = 'sine';
    swooshOsc.frequency.setValueAtTime(200, now);
    swooshOsc.frequency.exponentialRampToValueAtTime(600, now + 0.28);
    swooshGain.gain.setValueAtTime(0, now);
    swooshGain.gain.linearRampToValueAtTime(0.1, now + 0.1);
    swooshGain.gain.linearRampToValueAtTime(0, now + 0.28);
    swooshOsc.connect(swooshGain);
    swooshGain.connect(ctx.destination);
    swooshOsc.start(now);
    swooshOsc.stop(now + 0.28);

    // 2. "Tada" chord exactly at the visual impact (0.28s)
    const impactTime = now + 0.28;
    const playNote = (freq: number, startTime: number, duration: number, vol: number = 0.3) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    playNote(523.25, impactTime, 0.6, 0.4);        // C5
    playNote(659.25, impactTime + 0.04, 0.6, 0.3); // E5
    playNote(783.99, impactTime + 0.08, 0.6, 0.3); // G5
    playNote(1046.50, impactTime + 0.12, 1.0, 0.5); // C6
  }
};

function SettingsModal({ 
  min, 
  max, 
  onSave, 
  riggedNumbers, 
  setRiggedNumbers, 
  onClose 
}: any) {
  const [tempMin, setTempMin] = useState(min);
  const [tempMax, setTempMax] = useState(max);
  const [secretClicks, setSecretClicks] = useState(0);
  
  const handleSave = () => {
    onSave(tempMin, tempMax);
    onClose();
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-[#2C1E16]/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-4 border-[#A67B5B]"
      >
        <div className="p-6 border-b border-[#F3EFE0] flex justify-between items-center bg-[#FCFAF5]">
          <h2 className="text-2xl font-bold text-[#2C1E16]">설정</h2>
          <button onClick={onClose} className="p-2 text-[#A67B5B] hover:text-[#2C1E16] hover:bg-[#F3EFE0] rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[#A67B5B] mb-2">시작 번호</label>
              <input 
                type="number" 
                value={tempMin}
                onChange={e => setTempMin(Number(e.target.value))}
                className="w-full bg-[#FCFAF5] border-2 border-[#E8DFD5] rounded-xl px-4 py-3 text-lg font-bold text-[#2C1E16] focus:outline-none focus:border-[#5F8D4E]"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#A67B5B] mb-2">끝 번호</label>
              <input 
                type="number" 
                value={tempMax}
                onChange={e => setTempMax(Number(e.target.value))}
                className="w-full bg-[#FCFAF5] border-2 border-[#E8DFD5] rounded-xl px-4 py-3 text-lg font-bold text-[#2C1E16] focus:outline-none focus:border-[#5F8D4E]"
              />
            </div>
          </div>
          
          <AnimatePresence>
            {secretClicks >= 3 && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="pt-4 border-t border-[#F3EFE0] overflow-hidden"
              >
                <label className="block text-sm font-bold text-[#5F8D4E] mb-2">비밀 조작 (다음에 나올 번호들)</label>
                <input 
                  type="text" 
                  value={riggedNumbers}
                  onChange={e => setRiggedNumbers(e.target.value)}
                  placeholder="예: 5, 12, 7"
                  className="w-full bg-[#F3EFE0] border-2 border-[#5F8D4E]/30 rounded-xl px-4 py-3 text-lg font-bold text-[#2C1E16] focus:outline-none focus:border-[#5F8D4E] placeholder:text-[#A67B5B]/50"
                />
                <p className="text-xs text-[#A67B5B] mt-2">쉼표(,)로 구분하여 여러 번호를 입력할 수 있습니다. 입력한 순서대로 나옵니다.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <div className="p-6 bg-[#FCFAF5] flex justify-between items-center rounded-b-3xl">
          {/* Secret trigger area - Larger and has a tiny faint dot indicator */}
          <div 
            className="w-20 h-16 flex items-center justify-start cursor-pointer group -ml-4" 
            onClick={() => setSecretClicks(c => c + 1)}
            title=" "
          >
            <div className="w-2 h-2 rounded-full bg-[#A67B5B] opacity-10 group-hover:opacity-30 transition-opacity ml-4" />
          </div>
          <button 
            onClick={handleSave}
            className="bg-[#2C1E16] hover:bg-[#4A3326] text-white px-8 py-3 rounded-xl font-bold shadow-md transition-colors"
          >
            저장 및 초기화
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [min, setMin] = useState(() => {
    const saved = localStorage.getItem('picker_min');
    return saved !== null ? parseInt(saved, 10) : 1;
  });
  const [max, setMax] = useState(() => {
    const saved = localStorage.getItem('picker_max');
    return saved !== null ? parseInt(saved, 10) : 30;
  });
  const [availableNumbers, setAvailableNumbers] = useState<number[]>(() => {
    const saved = localStorage.getItem('picker_available');
    if (saved) return JSON.parse(saved);
    const nums = [];
    const savedMin = localStorage.getItem('picker_min');
    const savedMax = localStorage.getItem('picker_max');
    const initialMin = savedMin !== null ? parseInt(savedMin, 10) : 1;
    const initialMax = savedMax !== null ? parseInt(savedMax, 10) : 30;
    for (let i = initialMin; i <= initialMax; i++) nums.push(i);
    return nums;
  });

  useEffect(() => {
    localStorage.setItem('picker_min', min.toString());
    localStorage.setItem('picker_max', max.toString());
  }, [min, max]);

  const [pickedNumbers, setPickedNumbers] = useState<number[]>(() => {
    const saved = localStorage.getItem('picker_picked');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('picker_available', JSON.stringify(availableNumbers));
    localStorage.setItem('picker_picked', JSON.stringify(pickedNumbers));
  }, [availableNumbers, pickedNumbers]);

  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [riggedNumbers, setRiggedNumbers] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState(true);

  const pickNumberRef = useRef<() => void>(() => {});

  const reset = useCallback(() => {
    const nums = [];
    for (let i = min; i <= max; i++) {
      nums.push(i);
    }
    setAvailableNumbers(nums);
    setPickedNumbers([]);
    setCurrentNumber(null);
  }, [min, max]);

  const handleSaveSettings = (newMin: number, newMax: number) => {
    setMin(newMin);
    setMax(newMax);
    const nums = [];
    for (let i = newMin; i <= newMax; i++) {
      nums.push(i);
    }
    setAvailableNumbers(nums);
    setPickedNumbers([]);
    setCurrentNumber(null);
  };

  const pickNumber = async () => {
    if (availableNumbers.length === 0 || isPicking) return;
    
    // Synchronously resume audio context on user interaction to bypass autoplay policy
    if (soundEnabled) {
      getAudioContext();
    }
    
    setIsPicking(true);
    
    let ticks = 0;
    const totalTicks = 25;
    let delay = 120; // Start slow
    
    const tick = () => {
      if (soundEnabled) playSound('tick');
      setCurrentNumber(availableNumbers[Math.floor(Math.random() * availableNumbers.length)]);
      ticks++;
      
      if (ticks < totalTicks) {
        // Accelerate: decrease delay
        delay = Math.max(40, delay * 0.85);
        setTimeout(tick, delay);
      } else {
        finalizePick();
      }
    };
    
    setTimeout(tick, delay);
    
    const finalizePick = () => {
      let picked: number;
      
      const riggedArray = riggedNumbers.split(',').map(s => s.trim()).filter(s => s !== '');
      let foundRigged: number | null = null;
      let newRiggedArray = [...riggedArray];

      for (let i = 0; i < riggedArray.length; i++) {
        const num = Number(riggedArray[i]);
        if (!isNaN(num) && availableNumbers.includes(num)) {
          foundRigged = num;
          newRiggedArray.splice(i, 1);
          break;
        }
      }
      
      if (foundRigged !== null) {
        picked = foundRigged;
        setRiggedNumbers(newRiggedArray.join(', '));
      } else {
        const randomIndex = Math.floor(Math.random() * availableNumbers.length);
        picked = availableNumbers[randomIndex];
      }
      
      if (soundEnabled) playSound('pop');
      
      // Delay confetti to match the visual bounce impact (0.28s)
      setTimeout(() => {
        confetti({
          particleCount: 250,
          spread: 120,
          startVelocity: 50,
          origin: { x: window.innerWidth > 1024 ? 0.35 : 0.5, y: 0.6 },
          colors: ['#A67B5B', '#5F8D4E', '#F3EFE0', '#2C1E16'],
          zIndex: 100
        });
      }, 280);
      
      setCurrentNumber(picked);
      setAvailableNumbers(prev => prev.filter(n => n !== picked));
      setPickedNumbers(prev => [...prev, picked]);
      setIsPicking(false);
    };
  };

  useEffect(() => {
    pickNumberRef.current = pickNumber;
  }, [pickNumber]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !showSettings) {
        e.preventDefault();
        pickNumberRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings]);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row p-4 lg:p-8 gap-8 font-sans text-[#2C1E16]">
      <div className="absolute top-6 left-6 flex gap-3 z-10">
        <button onClick={() => setSoundEnabled(!soundEnabled)} className="p-4 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow text-[#A67B5B] hover:text-[#5F8D4E] border-4 border-[#F3EFE0]">
          {soundEnabled ? <Volume2 size={28} /> : <VolumeX size={28} />}
        </button>
        <button onClick={() => setShowSettings(true)} className="p-4 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow text-[#A67B5B] hover:text-[#5F8D4E] border-4 border-[#F3EFE0]">
          <Settings size={28} />
        </button>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center relative min-h-[60vh]">
        <motion.div 
          animate={isPicking ? { 
            scale: [1, 1.02, 0.98, 1.02, 0.98, 1],
            rotate: [0, -2, 2, -2, 2, 0]
          } : { scale: [1, 1.05, 1] }}
          transition={isPicking ? { repeat: Infinity, duration: 0.2 } : { duration: 0.4, ease: "easeOut" }}
          className="relative w-72 h-72 md:w-[32rem] md:h-[32rem] lg:w-[40rem] lg:h-[40rem] bg-white rounded-full shadow-2xl flex items-center justify-center mb-16 border-[16px] md:border-[24px] border-[#A67B5B]"
        >
          <AnimatePresence mode="popLayout">
            {currentNumber !== null ? (
              <motion.div
                key={isPicking ? 'picking' : `final-${currentNumber}`}
                initial={isPicking ? { scale: 0.5, opacity: 0.5, y: -50 } : { scale: 0, opacity: 0, y: 0 }}
                animate={isPicking ? { scale: 1, opacity: 1, y: 0 } : { scale: [0, 2.0, 0.8, 1.15, 1], opacity: 1, y: 0 }}
                exit={{ scale: 0, opacity: 0, filter: 'blur(10px)' }}
                transition={{ 
                  duration: isPicking ? 0.05 : 0.9,
                  ease: isPicking ? "linear" : "easeOut",
                  times: isPicking ? undefined : [0, 0.3, 0.55, 0.8, 1]
                }}
                className={`text-8xl md:text-[16rem] lg:text-[20rem] font-black tracking-tighter drop-shadow-xl ${isPicking ? 'text-[#A67B5B]/40' : 'text-[#5F8D4E]'}`}
              >
                {currentNumber}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-5xl md:text-7xl lg:text-8xl font-bold text-[#A67B5B]/30 tracking-tight"
              >
                준비
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        
        <div className="flex gap-6">
          <button 
            onClick={pickNumber}
            disabled={isPicking || availableNumbers.length === 0}
            className="flex items-center gap-3 bg-[#5F8D4E] hover:bg-[#4A703D] disabled:bg-[#A67B5B]/30 text-white px-12 py-6 rounded-full text-3xl font-bold shadow-xl hover:shadow-2xl transition-all active:scale-95 border-b-8 border-[#3E5C33] disabled:border-transparent"
          >
            <Play fill="currentColor" size={36} />
            {availableNumbers.length === 0 ? '완료!' : '뽑기!'}
          </button>
          
          <button 
            onClick={reset}
            disabled={isPicking}
            className="flex items-center gap-2 bg-[#F3EFE0] hover:bg-[#E8DFD5] text-[#A67B5B] px-8 py-6 rounded-full text-2xl font-bold shadow-lg hover:shadow-xl transition-all active:scale-95 border-b-8 border-[#D9CDB8]"
          >
            <RotateCcw size={28} />
            초기화
          </button>
        </div>
      </div>

      {/* Picked Numbers Sidebar */}
      <div className="w-full lg:w-[400px] xl:w-[480px] bg-white rounded-[3rem] p-8 shadow-xl border-8 border-[#F3EFE0] flex flex-col h-auto lg:h-[calc(100vh-4rem)]">
        <div className="text-center mb-6 border-b-4 border-[#F3EFE0] pb-6">
          <h3 className="text-3xl font-black text-[#2C1E16] mb-3">뽑힌 번호</h3>
          <p className="text-[#A67B5B] text-xl font-bold">
            남은 번호: {availableNumbers.length} / {max - min + 1}
          </p>
        </div>
        <div className="flex flex-wrap content-start gap-3 flex-1 overflow-y-auto">
          <AnimatePresence>
            {pickedNumbers.map(n => (
              <motion.span 
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                key={n} 
                className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 bg-[#A67B5B] text-white rounded-full text-xl md:text-2xl font-bold shadow-md"
              >
                <span className="line-through decoration-[3px] decoration-[#2C1E16]/40">{n}</span>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
      
      <AnimatePresence>
        {showSettings && (
          <SettingsModal 
            min={min} 
            max={max} 
            onSave={handleSaveSettings}
            riggedNumbers={riggedNumbers}
            setRiggedNumbers={setRiggedNumbers}
            onClose={() => setShowSettings(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

