import { useCallback, useEffect, useRef, useState } from 'react';
import { VorqenGameEngine } from './game/engine';
import {
  CHARACTERS,
  GameModeId,
  GameScreenState,
  GameSettings,
  HudSnapshot,
  MatchResult,
  OUTFITS,
} from './game/types';
import { audioEngine } from './game/audio';
import { LobbyOverlay } from './components/LobbyOverlay';
import { GameHud } from './components/GameHud';
import { PauseModal, ResultModal } from './components/Modals';

const DEFAULT_SETTINGS: GameSettings = {
  graphics: 'high',
  environment: 'sunset',
  perspective: 'tpp',
  muted: false,
  controls: {
    buttonScale: 1.0,
    actionOffsetY: 0,
    joystickOffsetY: 0,
    autoSprint: false,
    gyroEnabled: false,
    touchSensitivity: 1.0,
    alwaysShowTouchControls: false,
  },
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VorqenGameEngine | null>(null);

  const [screenState, setScreenState] = useState<GameScreenState>('title');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(CHARACTERS[0].id);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string>(OUTFITS[0].id);
  const [selectedMode, setSelectedMode] = useState<GameModeId>('solo');
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [minimapBgCanvas, setMinimapBgCanvas] = useState<HTMLCanvasElement | null>(null);
  const [bestScore, setBestScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('vorqen_best_score')) || 0;
    } catch {
      return 0;
    }
  });
  const [portraitDismissed, setPortraitDismissed] = useState(false);
  const [isNarrowPortrait, setIsNarrowPortrait] = useState(false);

  const screenStateRef = useRef<GameScreenState>('title');
  useEffect(() => {
    screenStateRef.current = screenState;
    document.body.dataset.state = screenState;
  }, [screenState]);

  useEffect(() => {
    const checkOrientation = () => {
      setIsNarrowPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 640);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  const startMatch = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    // Attempt automatic landscape lock on mobile browsers that allow it
    try {
      const orient = screen.orientation as unknown as { lock?: (mode: string) => Promise<void> };
      orient?.lock?.('landscape').catch(() => {});
    } catch {
      // ignore on unsupported desktop/iframe contexts
    }
    setMatchResult(null);
    setScreenState('playing');
    document.body.dataset.state = 'playing';
    engine.startMatch();
  }, []);

  // Initialize Three.js GameEngine once in isolated container
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new VorqenGameEngine(mount, DEFAULT_SETTINGS, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onMatchEnd: (result) => {
        setMatchResult(result);
        setBestScore(result.bestScore);
        setScreenState('gameover');
        document.body.dataset.state = 'gameover';
      },
      onMinimapBackgroundReady: (canvas) => {
        setMinimapBgCanvas(canvas);
      },
    });
    engineRef.current = engine;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      setScreenState('playing');
      document.body.dataset.state = 'playing';
      engine.startMatch();
    } else {
      document.body.dataset.state = 'title';
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Sync customization changes to engine
  useEffect(() => {
    engineRef.current?.setCustomization(selectedCharacterId, selectedOutfitId, selectedMode);
  }, [selectedCharacterId, selectedOutfitId, selectedMode]);

  // Sync settings changes to engine
  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    engineRef.current?.updateSettings(next);
  }, []);

  const handlePause = useCallback(() => {
    if (screenStateRef.current !== 'playing') return;
    setScreenState('paused');
    engineRef.current?.setScreenState('paused');
  }, []);

  const handleResume = useCallback(() => {
    if (screenStateRef.current !== 'paused') return;
    setScreenState('playing');
    engineRef.current?.setScreenState('playing');
  }, []);

  const handleReturnLobby = useCallback(() => {
    setMatchResult(null);
    setScreenState('title');
    engineRef.current?.setScreenState('title');
  }, []);

  const handleToggleMute = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, muted: !prev.muted };
      engineRef.current?.updateSettings(next);
      return next;
    });
  }, []);

  const handleTogglePerspective = useCallback(() => {
    setSettings((prev) => {
      const next = {
        ...prev,
        perspective: prev.perspective === 'tpp' ? ('fpp' as const) : ('tpp' as const),
      };
      engineRef.current?.updateSettings(next);
      return next;
    });
  }, []);

  // Global Keyboard Shortcuts (Enter/Space Start in Title, Esc/P Pause, M Mute)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const st = screenStateRef.current;
      if (st === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        audioEngine.playUiClick(740);
        startMatch();
      } else if (st === 'playing' && (e.code === 'Escape' || e.code === 'KeyP')) {
        e.preventDefault();
        handlePause();
      } else if (st === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) {
        e.preventDefault();
        handleResume();
      } else if (e.code === 'KeyM') {
        handleToggleMute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startMatch, handlePause, handleResume, handleToggleMute]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#080b12]">
      {/* Isolated WebGL Three.js Canvas Mount */}
      <div
        ref={canvasMountRef}
        data-testid="game-viewport"
        className="fixed inset-0 w-full h-full"
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Portrait Mobile Orientation Banner (non-blocking & dismissible) */}
      {isNarrowPortrait && !portraitDismissed && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40 bg-slate-950/95 border border-amber-400 px-3 py-1.5 text-[11px] font-bold text-amber-300 flex items-center gap-2 shadow-lg">
          <span>Rotate phone to Landscape for optimal Arena view</span>
          <button
            type="button"
            onClick={() => setPortraitDismissed(true)}
            className="text-slate-300 hover:text-white underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Title / Lobby Screen */}
      {screenState === 'title' && (
        <LobbyOverlay
          selectedCharacterId={selectedCharacterId}
          selectedOutfitId={selectedOutfitId}
          selectedMode={selectedMode}
          settings={settings}
          bestScore={bestScore}
          onSelectCharacter={setSelectedCharacterId}
          onSelectOutfit={setSelectedOutfitId}
          onSelectMode={setSelectedMode}
          onUpdateSettings={handleUpdateSettings}
          onStartMatch={startMatch}
        />
      )}

      {/* Active Gameplay HUD */}
      {screenState === 'playing' && hud && (
        <GameHud
          hud={hud}
          settings={settings}
          engineRef={engineRef}
          minimapBgCanvas={minimapBgCanvas}
          onToggleMute={handleToggleMute}
          onTogglePerspective={handleTogglePerspective}
          onPause={handlePause}
        />
      )}

      {/* Pause Modal */}
      {screenState === 'paused' && (
        <PauseModal
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onResume={handleResume}
          onRestart={startMatch}
          onReturnLobby={handleReturnLobby}
        />
      )}

      {/* Victory / Match Over Modal */}
      {screenState === 'gameover' && matchResult && (
        <ResultModal
          result={matchResult}
          onPlayAgain={startMatch}
          onReturnLobby={handleReturnLobby}
        />
      )}
    </main>
  );
}
