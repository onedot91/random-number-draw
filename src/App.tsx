import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, RotateCcw, Play, Volume2, VolumeX, X, Plus, Trash2 } from 'lucide-react';
import confetti from 'canvas-confetti';

let sharedAudioCtx: AudioContext | null = null;

const STORAGE_KEY = 'picker_scenarios_v4';
const ACTIVE_SCENARIO_KEY = 'picker_active_scenario_v4';

type ScenarioId = string;

type ScenarioState = {
  id: ScenarioId;
  label: string;
  min: number;
  max: number;
  availableNumbers: number[];
  pickedNumbers: number[];
  riggedNumbers: string;
  currentNumber: number | null;
  repeatPickEnabled: boolean;
  repeatedNumbers: number[];
};

type ClashAnimation = {
  repeatedNumber: number;
  displacedNumber: number;
  sourceRect: { left: number; top: number; size: number };
  targetRect: { left: number; top: number; size: number };
};

const createRange = (min: number, max: number) => {
  const nums: number[] = [];
  for (let i = min; i <= max; i++) nums.push(i);
  return nums;
};

const createScenarioId = () => `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createScenario = (label: string, id: ScenarioId = createScenarioId()): ScenarioState => ({
  id,
  label,
  min: 1,
  max: 30,
  availableNumbers: createRange(1, 30),
  pickedNumbers: [],
  riggedNumbers: '',
  currentNumber: null,
  repeatPickEnabled: false,
  repeatedNumbers: [],
});

const createDefaultScenarios = () => [createScenario('A상황', 'scenarioA'), createScenario('B상황', 'scenarioB')];

const isNumberArray = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'number');

const isScenarioState = (value: unknown): value is ScenarioState => {
  if (!value || typeof value !== 'object') return false;
  const scenario = value as ScenarioState;
  return (
    typeof scenario.id === 'string' &&
    typeof scenario.label === 'string' &&
    typeof scenario.min === 'number' &&
    typeof scenario.max === 'number' &&
    isNumberArray(scenario.availableNumbers) &&
    isNumberArray(scenario.pickedNumbers) &&
    typeof scenario.riggedNumbers === 'string' &&
    (typeof scenario.currentNumber === 'number' || scenario.currentNumber === null) &&
    typeof scenario.repeatPickEnabled === 'boolean' &&
    isNumberArray(scenario.repeatedNumbers)
  );
};

const normalizeScenario = (scenario: Partial<ScenarioState> & Pick<ScenarioState, 'id' | 'label' | 'min' | 'max'>): ScenarioState => ({
  id: scenario.id,
  label: scenario.label,
  min: scenario.min,
  max: scenario.max,
  availableNumbers: isNumberArray(scenario.availableNumbers) ? scenario.availableNumbers : createRange(scenario.min, scenario.max),
  pickedNumbers: isNumberArray(scenario.pickedNumbers) ? scenario.pickedNumbers : [],
  riggedNumbers: typeof scenario.riggedNumbers === 'string' ? scenario.riggedNumbers : '',
  currentNumber: typeof scenario.currentNumber === 'number' ? scenario.currentNumber : null,
  repeatPickEnabled: typeof scenario.repeatPickEnabled === 'boolean' ? scenario.repeatPickEnabled : false,
  repeatedNumbers: isNumberArray(scenario.repeatedNumbers) ? scenario.repeatedNumbers : [],
});

const loadScenarios = (): ScenarioState[] => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = parsed
          .map(item => (item && typeof item === 'object' ? normalizeScenario(item as ScenarioState) : null))
          .filter((item): item is ScenarioState => item !== null);
        if (normalized.length > 0 && normalized.every(isScenarioState)) {
          return normalized;
        }
      }
    } catch {
      // Ignore broken saved state.
    }
  }

  const previousSaved = localStorage.getItem('picker_scenarios_v3');
  if (previousSaved) {
    try {
      const parsed = JSON.parse(previousSaved) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const migrated = parsed
          .map(item => (item && typeof item === 'object' ? normalizeScenario(item as ScenarioState) : null))
          .filter((item): item is ScenarioState => item !== null);
        if (migrated.length > 0) {
          return migrated;
        }
      }
    } catch {
      // Ignore broken saved state.
    }
  }

  const legacyMin = localStorage.getItem('picker_min');
  const legacyMax = localStorage.getItem('picker_max');
  const legacyAvailable = localStorage.getItem('picker_available');
  const legacyPicked = localStorage.getItem('picker_picked');
  const scenarios = createDefaultScenarios();

  if (legacyMin || legacyMax || legacyAvailable || legacyPicked) {
    const min = legacyMin !== null ? parseInt(legacyMin, 10) : 1;
    const max = legacyMax !== null ? parseInt(legacyMax, 10) : 30;
    scenarios[0] = {
      ...scenarios[0],
      min,
      max,
      availableNumbers: legacyAvailable ? JSON.parse(legacyAvailable) : createRange(min, max),
      pickedNumbers: legacyPicked ? JSON.parse(legacyPicked) : [],
    };
  }

  return scenarios;
};

const getAudioContext = () => {
  if (!sharedAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
};

const playNote = (ctx: AudioContext, frequency: number, startTime: number, duration: number, volume: number, type: OscillatorType = 'sine') => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
};

const playSound = (type: 'tick' | 'pop' | 'repeat') => {
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
    return;
  }

  if (type === 'repeat') {
    const riser = ctx.createOscillator();
    const riserGain = ctx.createGain();
    riser.type = 'triangle';
    riser.frequency.setValueAtTime(180, now);
    riser.frequency.exponentialRampToValueAtTime(720, now + 0.22);
    riserGain.gain.setValueAtTime(0.001, now);
    riserGain.gain.exponentialRampToValueAtTime(0.12, now + 0.08);
    riserGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    riser.connect(riserGain);
    riserGain.connect(ctx.destination);
    riser.start(now);
    riser.stop(now + 0.22);

    playNote(ctx, 523.25, now + 0.2, 0.5, 0.34);
    playNote(ctx, 659.25, now + 0.24, 0.5, 0.28);
    playNote(ctx, 783.99, now + 0.28, 0.55, 0.28);
    playNote(ctx, 1046.5, now + 0.34, 0.85, 0.44);
    playNote(ctx, 1318.51, now + 0.46, 0.4, 0.18, 'triangle');

    const sparkleTimes = [now + 0.42, now + 0.5, now + 0.58];
    sparkleTimes.forEach((time, index) => {
      playNote(ctx, 1567.98 + index * 130, time, 0.14, 0.12, 'square');
    });
    return;
  }

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

  playNote(ctx, 523.25, now + 0.28, 0.6, 0.4);
  playNote(ctx, 659.25, now + 0.32, 0.6, 0.3);
  playNote(ctx, 783.99, now + 0.36, 0.6, 0.3);
  playNote(ctx, 1046.5, now + 0.4, 1.0, 0.5);
};

function SettingsModal({
  scenario,
  scenarios,
  onSave,
  onRenameScenario,
  onAddScenario,
  onRemoveScenario,
  onActivateScenario,
  onClose,
}: {
  scenario: ScenarioState;
  scenarios: ScenarioState[];
  onSave: (changes: { label: string; min: number; max: number; riggedNumbers: string; repeatPickEnabled: boolean }) => void;
  onRenameScenario: (scenarioId: ScenarioId, label: string) => void;
  onAddScenario: () => void;
  onRemoveScenario: (scenarioId: ScenarioId) => void;
  onActivateScenario: (scenarioId: ScenarioId) => void;
  onClose: () => void;
}) {
  const [tempLabel, setTempLabel] = useState(scenario.label);
  const [tempMin, setTempMin] = useState(scenario.min);
  const [tempMax, setTempMax] = useState(scenario.max);
  const [tempRigged, setTempRigged] = useState(scenario.riggedNumbers);
  const [tempRepeatPickEnabled, setTempRepeatPickEnabled] = useState(scenario.repeatPickEnabled);
  const [secretClicks, setSecretClicks] = useState(0);

  useEffect(() => {
    setTempLabel(scenario.label);
    setTempMin(scenario.min);
    setTempMax(scenario.max);
    setTempRigged(scenario.riggedNumbers);
    setTempRepeatPickEnabled(scenario.repeatPickEnabled);
    setSecretClicks(0);
  }, [scenario]);

  const handleSave = () => {
    onSave({
      label: tempLabel,
      min: tempMin,
      max: tempMax,
      riggedNumbers: tempRigged,
      repeatPickEnabled: tempRepeatPickEnabled,
    });
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
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl border-4 border-[#A67B5B] bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#F3EFE0] bg-[#FCFAF5] p-6">
          <div>
            <h2 className="text-2xl font-bold text-[#2C1E16]">설정</h2>
            <p className="text-sm font-semibold text-[#A67B5B]">상황 이름, 범위, 특수 추첨 옵션을 관리합니다.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-[#A67B5B] transition-colors hover:bg-[#F3EFE0] hover:text-[#2C1E16]">
            <X size={24} />
          </button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4 rounded-3xl bg-[#FCFAF5] p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-[#2C1E16]">상황 목록</h3>
              <button
                onClick={onAddScenario}
                className="inline-flex items-center gap-2 rounded-full bg-[#5F8D4E] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#4A703D]"
              >
                <Plus size={16} />
                상황 추가
              </button>
            </div>

            <div className="max-h-[22rem] space-y-3 overflow-y-auto pr-1">
              {scenarios.map(item => {
                const isActive = item.id === scenario.id;
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border-2 p-3 transition-colors ${
                      isActive ? 'border-[#5F8D4E] bg-white' : 'border-[#E8DFD5] bg-white/70'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => onActivateScenario(item.id)}
                        className="flex-1 text-left"
                      >
                        <div className="text-base font-black text-[#2C1E16]">{item.label}</div>
                        <div className="mt-1 text-sm font-semibold text-[#A67B5B]">
                          {item.min} ~ {item.max} / 추첨 {item.pickedNumbers.length}회
                        </div>
                      </button>
                      <button
                        onClick={() => onRemoveScenario(item.id)}
                        disabled={scenarios.length === 1}
                        className="rounded-full p-2 text-[#A67B5B] transition-colors hover:bg-[#F3EFE0] hover:text-[#8C3B2C] disabled:cursor-not-allowed disabled:opacity-30"
                        title={scenarios.length === 1 ? '최소 1개의 상황은 유지해야 합니다.' : '상황 삭제'}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#A67B5B]">상황 이름</label>
              <input
                type="text"
                value={tempLabel}
                onChange={e => {
                  setTempLabel(e.target.value);
                  onRenameScenario(scenario.id, e.target.value);
                }}
                className="w-full rounded-xl border-2 border-[#E8DFD5] bg-[#FCFAF5] px-4 py-3 text-lg font-bold text-[#2C1E16] focus:border-[#5F8D4E] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-[#A67B5B]">시작 번호</label>
                <input
                  type="number"
                  value={tempMin}
                  onChange={e => setTempMin(Number(e.target.value))}
                  className="w-full rounded-xl border-2 border-[#E8DFD5] bg-[#FCFAF5] px-4 py-3 text-lg font-bold text-[#2C1E16] focus:border-[#5F8D4E] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-[#A67B5B]">끝 번호</label>
                <input
                  type="number"
                  value={tempMax}
                  onChange={e => setTempMax(Number(e.target.value))}
                  className="w-full rounded-xl border-2 border-[#E8DFD5] bg-[#FCFAF5] px-4 py-3 text-lg font-bold text-[#2C1E16] focus:border-[#5F8D4E] focus:outline-none"
                />
              </div>
            </div>

            <div className="rounded-3xl border-2 border-[#F3EFE0] bg-[#FCFAF5] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-black text-[#2C1E16]">재등장 연출</h3>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#A67B5B]">
                    추첨 버튼을 누를 때 10% 확률로 이미 뽑힌 번호가 한 번 더 등장합니다.
                    각 번호는 초기화 전까지 최대 2번까지만 나옵니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTempRepeatPickEnabled(value => !value)}
                  className={`relative inline-flex h-10 w-20 items-center rounded-full border-2 px-1 transition-colors ${
                    tempRepeatPickEnabled ? 'border-[#3E5C33] bg-[#5F8D4E]' : 'border-[#D9CDB8] bg-white'
                  }`}
                  aria-pressed={tempRepeatPickEnabled}
                >
                  <motion.span
                    animate={{ x: tempRepeatPickEnabled ? 38 : 0 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                    className="inline-block h-7 w-7 rounded-full bg-white shadow-md"
                  />
                </button>
              </div>
            </div>

            <AnimatePresence>
              {secretClicks >= 3 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden rounded-2xl border border-[#F3EFE0] bg-[#FCFAF5] p-4"
                >
                  <label className="mb-2 block text-sm font-bold text-[#5F8D4E]">비밀 조작 번호</label>
                  <input
                    type="text"
                    value={tempRigged}
                    onChange={e => setTempRigged(e.target.value)}
                    placeholder="예: 5, 12, 7"
                    className="w-full rounded-xl border-2 border-[#5F8D4E]/30 bg-white px-4 py-3 text-lg font-bold text-[#2C1E16] placeholder:text-[#A67B5B]/50 focus:border-[#5F8D4E] focus:outline-none"
                  />
                  <p className="mt-2 text-xs text-[#A67B5B]">쉼표로 구분한 번호를 순서대로 우선 추첨합니다.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-b-3xl bg-[#FCFAF5] p-6">
          <div
            className="-ml-4 flex h-16 w-20 cursor-pointer items-center justify-start"
            onClick={() => setSecretClicks(count => count + 1)}
            title=" "
          >
            <div className="ml-4 h-2 w-2 rounded-full bg-[#A67B5B] opacity-10 transition-opacity hover:opacity-30" />
          </div>
          <button
            onClick={handleSave}
            className="rounded-xl bg-[#2C1E16] px-8 py-3 font-bold text-white shadow-md transition-colors hover:bg-[#4A3326]"
          >
            저장
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const getUniquePickedNumbers = (pickedNumbers: number[]) => {
  const seen = new Set<number>();
  return pickedNumbers.filter(number => {
    if (seen.has(number)) return false;
    seen.add(number);
    return true;
  });
};

export default function App() {
  const [scenarios, setScenarios] = useState<ScenarioState[]>(loadScenarios);
  const [activeScenarioId, setActiveScenarioId] = useState<ScenarioId>(() => {
    const saved = localStorage.getItem(ACTIVE_SCENARIO_KEY);
    return saved || loadScenarios()[0].id;
  });
  const [isPicking, setIsPicking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [clashAnimation, setClashAnimation] = useState<ClashAnimation | null>(null);
  const pickNumberRef = useRef<() => void>(() => {});
  const resetRef = useRef<() => void>(() => {});
  const scenariosRef = useRef<ScenarioState[]>(scenarios);
  const activeScenarioIdRef = useRef<ScenarioId>(activeScenarioId);
  const pickedBallRefs = useRef(new Map<number, HTMLSpanElement>());
  const drawStageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scenariosRef.current = scenarios;
  }, [scenarios]);

  useEffect(() => {
    activeScenarioIdRef.current = activeScenarioId;
  }, [activeScenarioId]);

  useEffect(() => {
    if (!scenarios.some(scenario => scenario.id === activeScenarioId) && scenarios[0]) {
      setActiveScenarioId(scenarios[0].id);
    }
  }, [activeScenarioId, scenarios]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  }, [scenarios]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_SCENARIO_KEY, activeScenarioId);
  }, [activeScenarioId]);

  const activeScenario = scenarios.find(scenario => scenario.id === activeScenarioId) ?? scenarios[0];

  const updateScenario = useCallback((scenarioId: ScenarioId, updater: (scenario: ScenarioState) => ScenarioState) => {
    setScenarios(prev =>
      prev.map(scenario => (scenario.id === scenarioId ? updater(scenario) : scenario)),
    );
  }, []);

  const reset = useCallback(() => {
    setClashAnimation(null);
    updateScenario(activeScenario.id, scenario => ({
      ...scenario,
      availableNumbers: createRange(scenario.min, scenario.max),
      pickedNumbers: [],
      currentNumber: null,
      repeatedNumbers: [],
    }));
  }, [activeScenario.id, updateScenario]);

  const handleSaveSettings = useCallback(
    ({
      label,
      min: rawMin,
      max: rawMax,
      riggedNumbers,
      repeatPickEnabled,
    }: {
      label: string;
      min: number;
      max: number;
      riggedNumbers: string;
      repeatPickEnabled: boolean;
    }) => {
      const min = Math.min(rawMin, rawMax);
      const max = Math.max(rawMin, rawMax);
      const normalizedLabel = label.trim() || '이름 없는 상황';

      setClashAnimation(null);
      updateScenario(activeScenario.id, scenario => ({
        ...scenario,
        label: normalizedLabel,
        min,
        max,
        riggedNumbers,
        repeatPickEnabled,
        availableNumbers: createRange(min, max),
        pickedNumbers: [],
        currentNumber: null,
        repeatedNumbers: [],
      }));
    },
    [activeScenario.id, updateScenario],
  );

  const handleRenameScenario = useCallback((scenarioId: ScenarioId, label: string) => {
    updateScenario(scenarioId, scenario => ({
      ...scenario,
      label,
    }));
  }, [updateScenario]);

  const handleAddScenario = useCallback(() => {
    const nextNumber = scenariosRef.current.length + 1;
    const nextScenario = createScenario(`새 상황 ${nextNumber}`);
    setScenarios(prev => [...prev, nextScenario]);
    setActiveScenarioId(nextScenario.id);
  }, []);

  const handleRemoveScenario = useCallback((scenarioId: ScenarioId) => {
    setScenarios(prev => {
      if (prev.length === 1) return prev;
      const next = prev.filter(scenario => scenario.id !== scenarioId);
      if (activeScenarioIdRef.current === scenarioId && next[0]) {
        setActiveScenarioId(next[0].id);
      }
      return next;
    });
  }, []);

  const runCelebration = useCallback(() => {
    confetti({
      particleCount: 250,
      spread: 120,
      startVelocity: 50,
      origin: { x: window.innerWidth > 1024 ? 0.35 : 0.5, y: 0.6 },
      colors: ['#A67B5B', '#5F8D4E', '#F3EFE0', '#2C1E16'],
      zIndex: 100,
    });
  }, []);

  const createClashAnimation = useCallback((repeatedNumber: number, displacedNumber: number): ClashAnimation => {
    const sourceNode = pickedBallRefs.current.get(repeatedNumber);
    const stageNode = drawStageRef.current;
    const sourceBounds = sourceNode?.getBoundingClientRect();
    const stageBounds = stageNode?.getBoundingClientRect();
    const sourceSize = sourceBounds ? Math.max(sourceBounds.width, sourceBounds.height) : 64;
    const targetSize = stageBounds ? Math.min(stageBounds.width, stageBounds.height) * 0.52 : 180;

    return {
      repeatedNumber,
      displacedNumber,
      sourceRect: {
        left: sourceBounds ? sourceBounds.left + sourceBounds.width / 2 - sourceSize / 2 : 40,
        top: sourceBounds ? sourceBounds.top + sourceBounds.height / 2 - sourceSize / 2 : window.innerHeight - 160,
        size: sourceSize,
      },
      targetRect: {
        left: stageBounds ? stageBounds.left + stageBounds.width / 2 - targetSize / 2 : window.innerWidth / 2 - targetSize / 2,
        top: stageBounds ? stageBounds.top + stageBounds.height / 2 - targetSize / 2 : window.innerHeight / 2 - targetSize / 2,
        size: targetSize,
      },
    };
  }, []);

  const finalizeStandardPick = useCallback(
    (scenarioId: ScenarioId, picked: number, remainingRigged: string[]) => {
      if (soundEnabled) playSound('pop');

      setTimeout(runCelebration, 280);

      updateScenario(scenarioId, scenario => ({
        ...scenario,
        currentNumber: picked,
        availableNumbers: scenario.availableNumbers.filter(n => n !== picked),
        pickedNumbers: [...scenario.pickedNumbers, picked],
        riggedNumbers: remainingRigged.join(', '),
      }));
      setIsPicking(false);
    },
    [runCelebration, soundEnabled, updateScenario],
  );

  const finalizeRepeatPick = useCallback(
    (scenarioId: ScenarioId, picked: number, displacedNumber: number, remainingRigged: string[]) => {
      if (soundEnabled) playSound('repeat');

      updateScenario(scenarioId, scenario => ({
        ...scenario,
        currentNumber: displacedNumber,
      }));

      setClashAnimation(createClashAnimation(picked, displacedNumber));

      window.setTimeout(() => {
        setClashAnimation(null);
        setTimeout(runCelebration, 120);
        updateScenario(scenarioId, scenario => ({
          ...scenario,
          currentNumber: picked,
          pickedNumbers: [...scenario.pickedNumbers, picked],
          repeatedNumbers: [...scenario.repeatedNumbers, picked],
          riggedNumbers: remainingRigged.join(', '),
        }));
        setIsPicking(false);
      }, 900);
    },
    [createClashAnimation, runCelebration, soundEnabled, updateScenario],
  );

  const pickNumber = useCallback(() => {
    const scenarioId = activeScenarioIdRef.current;
    const scenarioAtStart = scenariosRef.current.find(scenario => scenario.id === scenarioId);
    if (!scenarioAtStart || (scenarioAtStart.availableNumbers.length === 0 && !scenarioAtStart.repeatPickEnabled) || isPicking) return;

    if (soundEnabled) {
      getAudioContext();
    }

    setIsPicking(true);
    setClashAnimation(null);

    let ticks = 0;
    const totalTicks = 25;
    let delay = 120;

    const tick = () => {
      const currentScenario = scenariosRef.current.find(scenario => scenario.id === scenarioId);
      if (!currentScenario) {
        setIsPicking(false);
        return;
      }

      const previewPool = currentScenario.availableNumbers.length > 0
        ? currentScenario.availableNumbers
        : getUniquePickedNumbers(currentScenario.pickedNumbers).filter(number => !currentScenario.repeatedNumbers.includes(number));

      if (previewPool.length === 0) {
        setIsPicking(false);
        return;
      }

      if (soundEnabled) playSound('tick');
      const previewNumber = previewPool[Math.floor(Math.random() * previewPool.length)];

      updateScenario(scenarioId, scenario => ({
        ...scenario,
        currentNumber: previewNumber,
      }));

      ticks++;

      if (ticks < totalTicks) {
        delay = Math.max(40, delay * 0.85);
        setTimeout(tick, delay);
        return;
      }

      const finalScenario = scenariosRef.current.find(scenario => scenario.id === scenarioId);
      if (!finalScenario) {
        setIsPicking(false);
        return;
      }

      const riggedArray = finalScenario.riggedNumbers
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

      let picked: number;
      let remainingRigged = [...riggedArray];
      let isRepeatPick = false;
      let displacedNumber = previewNumber;

      const riggedIndex = riggedArray.findIndex(value => {
        const num = Number(value);
        return !Number.isNaN(num) && finalScenario.availableNumbers.includes(num);
      });

      if (riggedIndex >= 0) {
        picked = Number(riggedArray[riggedIndex]);
        remainingRigged.splice(riggedIndex, 1);
      } else {
        const repeatCandidates = finalScenario.repeatPickEnabled
          ? getUniquePickedNumbers(finalScenario.pickedNumbers).filter(number => !finalScenario.repeatedNumbers.includes(number))
          : [];
        const shouldRepeat = repeatCandidates.length > 0 && Math.random() < 0.1;

        if (shouldRepeat) {
          const repeatIndex = Math.floor(Math.random() * repeatCandidates.length);
          picked = repeatCandidates[repeatIndex];
          isRepeatPick = true;
          if (finalScenario.availableNumbers.length > 0) {
            displacedNumber = finalScenario.availableNumbers[Math.floor(Math.random() * finalScenario.availableNumbers.length)];
          }
        } else if (finalScenario.availableNumbers.length > 0) {
          const randomIndex = Math.floor(Math.random() * finalScenario.availableNumbers.length);
          picked = finalScenario.availableNumbers[randomIndex];
        } else {
          setIsPicking(false);
          return;
        }
      }

      if (isRepeatPick) {
        finalizeRepeatPick(scenarioId, picked, displacedNumber, remainingRigged);
        return;
      }

      finalizeStandardPick(scenarioId, picked, remainingRigged);
    };

    setTimeout(tick, delay);
  }, [finalizeRepeatPick, finalizeStandardPick, isPicking, soundEnabled, updateScenario]);

  useEffect(() => {
    pickNumberRef.current = pickNumber;
  }, [pickNumber]);

  useEffect(() => {
    resetRef.current = reset;
  }, [reset]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSettings) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        pickNumberRef.current();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        if (!isPicking) {
          resetRef.current();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPicking, showSettings]);

  const pickedCountMap = activeScenario.pickedNumbers.reduce<Record<number, number>>((acc, number) => {
    acc[number] = (acc[number] || 0) + 1;
    return acc;
  }, {});
  const uniquePickedNumbers = getUniquePickedNumbers(activeScenario.pickedNumbers);
  const canPick = activeScenario.availableNumbers.length > 0 || (
    activeScenario.repeatPickEnabled &&
    uniquePickedNumbers.some(number => !activeScenario.repeatedNumbers.includes(number))
  );

  return (
    <div className="min-h-screen gap-8 p-4 font-sans text-[#2C1E16] lg:flex lg:flex-row lg:p-8">
      <AnimatePresence>
        {clashAnimation && (
          <>
            {[0, 1].map(index => (
              <motion.div
                key={`trail-${index}-${clashAnimation.repeatedNumber}`}
                initial={{
                  left: clashAnimation.sourceRect.left - clashAnimation.sourceRect.size * 0.18,
                  top: clashAnimation.sourceRect.top - clashAnimation.sourceRect.size * 0.18,
                  width: clashAnimation.sourceRect.size * 1.34,
                  height: clashAnimation.sourceRect.size * 1.34,
                  opacity: 0.16 - index * 0.05,
                  scale: 0.72 + index * 0.04,
                }}
                animate={{
                  left: clashAnimation.targetRect.left + (index === 0 ? -18 : 14),
                  top: clashAnimation.targetRect.top + (index === 0 ? -20 : 12),
                  width: clashAnimation.targetRect.size * (0.94 - index * 0.08),
                  height: clashAnimation.targetRect.size * (0.94 - index * 0.08),
                  opacity: [0.14 - index * 0.04, 0.08, 0],
                  scale: [0.78 + index * 0.04, 1.04, 1.1],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.72 + index * 0.08, ease: [0.22, 0.84, 0.3, 1] }}
                className="pointer-events-none fixed z-40 flex items-center justify-center text-5xl font-black tracking-tighter text-[#F4D35E] blur-[2px] md:text-7xl lg:text-[9rem]"
              >
                {clashAnimation.repeatedNumber}
              </motion.div>
            ))}
            <motion.div
              key={`shockwave-${clashAnimation.repeatedNumber}`}
              initial={{ opacity: 0, scale: 0.62 }}
              animate={{ opacity: [0, 0.22, 0.12, 0], scale: [0.62, 0.96, 1.18, 1.34] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.82, ease: 'easeOut' }}
              className="pointer-events-none fixed z-40 rounded-full border-[16px] border-[#F4D35E]/75"
              style={{
                left: clashAnimation.targetRect.left,
                top: clashAnimation.targetRect.top,
                width: clashAnimation.targetRect.size,
                height: clashAnimation.targetRect.size,
              }}
            />
            <motion.div
              key={`spark-${clashAnimation.repeatedNumber}`}
              initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
              animate={{ opacity: [0, 0.3, 0.14, 0], scale: [0.4, 0.92, 1.08, 1.2], rotate: [0, 65, 110, 155] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.88, ease: 'easeOut' }}
              className="pointer-events-none fixed z-40 rounded-full bg-[conic-gradient(from_0deg,_rgba(244,211,94,0)_0deg,_rgba(244,211,94,0.55)_40deg,_rgba(255,255,255,0.9)_70deg,_rgba(244,211,94,0.18)_120deg,_rgba(244,211,94,0)_180deg,_rgba(244,211,94,0.4)_250deg,_rgba(255,255,255,0.85)_290deg,_rgba(244,211,94,0)_360deg)] blur-[3px]"
              style={{
                left: clashAnimation.targetRect.left - clashAnimation.targetRect.size * 0.08,
                top: clashAnimation.targetRect.top - clashAnimation.targetRect.size * 0.08,
                width: clashAnimation.targetRect.size * 1.16,
                height: clashAnimation.targetRect.size * 1.16,
              }}
            />
            <motion.div
              key={`fly-${clashAnimation.repeatedNumber}`}
              initial={{
                left: clashAnimation.sourceRect.left - clashAnimation.sourceRect.size * 0.2,
                top: clashAnimation.sourceRect.top - clashAnimation.sourceRect.size * 0.2,
                width: clashAnimation.sourceRect.size * 1.4,
                height: clashAnimation.sourceRect.size * 1.4,
                scale: 0.8,
                rotate: 0,
                opacity: 0.9,
              }}
              animate={{
                left: [
                  clashAnimation.sourceRect.left - clashAnimation.sourceRect.size * 0.2,
                  clashAnimation.targetRect.left - clashAnimation.targetRect.size * 0.08,
                  clashAnimation.targetRect.left,
                  clashAnimation.targetRect.left,
                ],
                top: [
                  clashAnimation.sourceRect.top - clashAnimation.sourceRect.size * 0.2,
                  clashAnimation.targetRect.top - clashAnimation.targetRect.size * 0.18,
                  clashAnimation.targetRect.top + clashAnimation.targetRect.size * 0.04,
                  clashAnimation.targetRect.top,
                ],
                width: [
                  clashAnimation.sourceRect.size * 1.4,
                  clashAnimation.targetRect.size * 0.9,
                  clashAnimation.targetRect.size * 1.02,
                  clashAnimation.targetRect.size,
                ],
                height: [
                  clashAnimation.sourceRect.size * 1.4,
                  clashAnimation.targetRect.size * 0.9,
                  clashAnimation.targetRect.size * 1.02,
                  clashAnimation.targetRect.size,
                ],
                scale: [0.8, 1.18, 1.04, 1],
                rotate: [0, -8, 4, 0],
                opacity: [0.9, 1, 1, 1],
                filter: [
                  'drop-shadow(0 8px 24px rgba(44,30,22,0.18))',
                  'drop-shadow(0 22px 42px rgba(44,30,22,0.36))',
                  'drop-shadow(0 18px 34px rgba(44,30,22,0.32))',
                  'drop-shadow(0 16px 28px rgba(44,30,22,0.28))',
                ],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: [0.2, 0.88, 0.28, 1], times: [0, 0.58, 0.82, 1] }}
              className="pointer-events-none fixed z-50 flex items-center justify-center bg-[linear-gradient(180deg,#FFF8D0_0%,#9FD46A_18%,#5F8D4E_55%,#2E5A2E_100%)] bg-clip-text text-5xl font-black tracking-tighter text-transparent md:text-7xl lg:text-[10rem]"
            >
              {clashAnimation.repeatedNumber}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="absolute left-6 top-6 z-10 flex gap-3">
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="rounded-full border-4 border-[#F3EFE0] bg-white p-4 text-[#A67B5B] shadow-md transition-shadow hover:shadow-lg hover:text-[#5F8D4E]"
        >
          {soundEnabled ? <Volume2 size={28} /> : <VolumeX size={28} />}
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="rounded-full border-4 border-[#F3EFE0] bg-white p-4 text-[#A67B5B] shadow-md transition-shadow hover:shadow-lg hover:text-[#5F8D4E]"
        >
          <Settings size={28} />
        </button>
      </div>

      <div className="relative flex min-h-[60vh] flex-1 flex-col items-center justify-center">
        <div className="mb-8 mt-20 flex flex-wrap justify-center gap-3 lg:mt-0">
          {scenarios.map(scenario => {
            const isActive = scenario.id === activeScenario.id;
            return (
              <button
                key={scenario.id}
                onClick={() => !isPicking && setActiveScenarioId(scenario.id)}
                disabled={isPicking}
                className={`rounded-full px-6 py-3 text-lg font-black transition-all ${
                  isActive
                    ? 'border-b-8 border-[#3E5C33] bg-[#5F8D4E] text-white shadow-xl'
                    : 'border-b-8 border-[#D9CDB8] bg-[#F3EFE0] text-[#A67B5B] shadow-md'
                } disabled:cursor-not-allowed disabled:opacity-70`}
              >
                {scenario.label.trim() || '이름 없는 상황'}
              </button>
            );
          })}
        </div>

        <motion.div
          ref={drawStageRef}
          animate={
            isPicking
              ? { scale: [1, 1.02, 0.98, 1.02, 0.98, 1], rotate: [0, -2, 2, -2, 2, 0] }
              : { scale: 1, rotate: 0 }
          }
          transition={isPicking ? { repeat: Infinity, duration: 0.2 } : { duration: 0.2 }}
          className="relative mb-16 flex h-72 w-72 items-center justify-center overflow-hidden rounded-full border-[16px] border-[#A67B5B] bg-white shadow-2xl md:h-[32rem] md:w-[32rem] md:border-[24px] lg:h-[40rem] lg:w-[40rem]"
        >
          <AnimatePresence mode="popLayout">
            {activeScenario.currentNumber !== null ? (
              <motion.div
                key={isPicking ? `${activeScenario.id}-picking` : `${activeScenario.id}-final-${activeScenario.currentNumber}`}
                initial={isPicking ? { scale: 0.5, opacity: 0.5, y: -50 } : { scale: 0, opacity: 0, y: 0 }}
                animate={
                  clashAnimation
                    ? {
                        x: [0, 24, 118, 212],
                        y: [0, -8, 10, -34],
                        scale: [1, 0.96, 0.82, 0.58],
                        rotate: [0, 6, 16, 22],
                        opacity: [1, 0.95, 0.55, 0],
                      }
                    : isPicking
                      ? { scale: 1, opacity: 1, y: 0 }
                      : { scale: [0, 2, 0.8, 1.15, 1], opacity: 1, y: 0 }
                }
                exit={{ scale: 0, opacity: 0, filter: 'blur(10px)' }}
                transition={{
                  duration: clashAnimation ? 0.86 : isPicking ? 0.05 : 0.9,
                  ease: clashAnimation ? [0.18, 0.82, 0.26, 1] : isPicking ? 'linear' : 'easeOut',
                  times: clashAnimation ? [0, 0.34, 0.72, 1] : isPicking ? undefined : [0, 0.3, 0.55, 0.8, 1],
                }}
                className={`text-8xl font-black tracking-tighter drop-shadow-xl md:text-[16rem] lg:text-[20rem] ${
                  isPicking ? 'text-[#A67B5B]/40' : clashAnimation ? 'text-[#C76D4B]' : 'text-[#5F8D4E]'
                }`}
              >
                {activeScenario.currentNumber}
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-5xl font-bold tracking-tight text-[#A67B5B]/30 md:text-7xl lg:text-8xl">
                준비
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {clashAnimation && (
              <motion.div
                initial={{ opacity: 0, scale: 0.72 }}
                animate={{ opacity: [0, 0.28, 0.14, 0], scale: [0.72, 1.02, 1.14, 1.24] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                className="absolute h-[55%] w-[55%] rounded-full bg-[radial-gradient(circle,_rgba(255,229,157,0.9)_0%,_rgba(255,229,157,0.25)_42%,_transparent_72%)]"
              />
            )}
            {clashAnimation && (
              <motion.div
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0, 0.22, 0.1, 0], scale: [0.6, 0.94, 1.08, 1.18] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.78 }}
                className="absolute h-[74%] w-[74%] rounded-full bg-[radial-gradient(circle,_rgba(95,141,78,0.28)_0%,_rgba(95,141,78,0.12)_34%,_rgba(255,229,157,0.08)_48%,_transparent_72%)]"
              />
            )}
          </AnimatePresence>
        </motion.div>

        <div className="flex gap-6">
          <button
            onClick={pickNumber}
            disabled={isPicking || !canPick}
            className="flex items-center gap-3 rounded-full border-b-8 border-[#3E5C33] bg-[#5F8D4E] px-12 py-6 text-3xl font-bold text-white shadow-xl transition-all hover:bg-[#4A703D] hover:shadow-2xl active:scale-95 disabled:border-transparent disabled:bg-[#A67B5B]/30"
          >
            <Play fill="currentColor" size={36} />
            {!canPick ? '완료!' : '뽑기!'}
          </button>

          <button
            onClick={reset}
            disabled={isPicking}
            className="flex items-center gap-2 rounded-full border-b-8 border-[#D9CDB8] bg-[#F3EFE0] px-8 py-6 text-2xl font-bold text-[#A67B5B] shadow-lg transition-all hover:bg-[#E8DFD5] hover:shadow-xl active:scale-95"
          >
            <RotateCcw size={28} />
            초기화
          </button>
        </div>
      </div>

      <div className="flex h-auto w-full flex-col rounded-[3rem] border-8 border-[#F3EFE0] bg-white p-8 shadow-xl lg:h-[calc(100vh-4rem)] lg:w-[400px] xl:w-[480px]">
        <div className="mb-6 border-b-4 border-[#F3EFE0] pb-6 text-center">
          <h3 className="mb-2 text-lg font-black text-[#A67B5B]">{activeScenario.label.trim() || '이름 없는 상황'}</h3>
          <h2 className="mb-3 text-3xl font-black text-[#2C1E16]">뽑힌 번호</h2>
          <p className="text-xl font-bold text-[#A67B5B]">
            남은 번호: {activeScenario.availableNumbers.length} / {activeScenario.max - activeScenario.min + 1}
          </p>
        </div>
        <div className="flex flex-1 flex-wrap content-start gap-3 overflow-y-auto">
          <AnimatePresence>
            {uniquePickedNumbers.map(n => {
              const count = pickedCountMap[n] || 0;
              const repeated = count >= 2;
              return (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={repeated ? { scale: [0.9, 1.1, 1], opacity: 1 } : { scale: 1, opacity: 1 }}
                  key={`${n}-${count}`}
                  ref={node => {
                    if (node) {
                      pickedBallRefs.current.set(n, node);
                    } else {
                      pickedBallRefs.current.delete(n);
                    }
                  }}
                  className={`relative inline-flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white shadow-md md:h-16 md:w-16 md:text-2xl ${
                    repeated ? 'bg-[#5F8D4E] ring-4 ring-[#FFE59D]' : 'bg-[#A67B5B]'
                  }`}
                >
                  <span className={repeated ? '' : 'line-through decoration-[3px] decoration-[#2C1E16]/40'}>{n}</span>
                  {count > 1 && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-[#FFE59D] px-1.5 py-0.5 text-[10px] font-black text-[#2C1E16]">
                      x{count}
                    </span>
                  )}
                </motion.span>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <SettingsModal
            scenario={activeScenario}
            scenarios={scenarios}
            onSave={handleSaveSettings}
            onRenameScenario={handleRenameScenario}
            onAddScenario={handleAddScenario}
            onRemoveScenario={handleRemoveScenario}
            onActivateScenario={setActiveScenarioId}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
