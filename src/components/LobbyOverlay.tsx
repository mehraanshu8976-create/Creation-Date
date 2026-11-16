import React, { useState } from 'react';
import {
  Crosshair,
  Gamepad2,
  Settings,
  Shield,
  Sliders,
  Sun,
  Sunset,
  Moon,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  CHARACTERS,
  EnvironmentPreset,
  GAME_MODES,
  GameModeId,
  GameSettings,
  GraphicsQuality,
  OUTFITS,
  WEAPONS,
} from '../game/types';
import { VorqenLogo } from './VorqenLogo';
import { audioEngine } from '../game/audio';

interface LobbyOverlayProps {
  selectedCharacterId: string;
  selectedOutfitId: string;
  selectedMode: GameModeId;
  settings: GameSettings;
  bestScore: number;
  onSelectCharacter: (id: string) => void;
  onSelectOutfit: (id: string) => void;
  onSelectMode: (mode: GameModeId) => void;
  onUpdateSettings: (next: GameSettings) => void;
  onStartMatch: () => void;
}

type LobbyTab = 'none' | 'character' | 'loadout' | 'settings';

export const LobbyOverlay: React.FC<LobbyOverlayProps> = ({
  selectedCharacterId,
  selectedOutfitId,
  selectedMode,
  settings,
  bestScore,
  onSelectCharacter,
  onSelectOutfit,
  onSelectMode,
  onUpdateSettings,
  onStartMatch,
}) => {
  const [activeTab, setActiveTab] = useState<LobbyTab>('none');

  const activeChar = CHARACTERS.find((c) => c.id === selectedCharacterId) || CHARACTERS[0];
  const activeMode = GAME_MODES.find((m) => m.id === selectedMode) || GAME_MODES[0];

  const toggleTab = (tab: LobbyTab) => {
    audioEngine.playUiClick(580);
    setActiveTab((prev) => (prev === tab ? 'none' : tab));
  };

  const setEnv = (environment: EnvironmentPreset) => {
    audioEngine.playUiClick(640);
    onUpdateSettings({ ...settings, environment });
  };

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 md:p-5 z-20 overflow-hidden">
      {/* Top Bar: Brand Logo Left + Environment & Audio Controls Right */}
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="w-36 sm:w-52 md:w-72 lg:w-88">
            <VorqenLogo compact />
          </div>
          {bestScore > 0 && (
            <div className="hidden sm:block px-2.5 py-0.5 bg-slate-950/80 border border-amber-500/40 text-xs font-bold tracking-wider text-amber-300 tabular-nums">
              BEST: {bestScore}
            </div>
          )}
        </div>

        {/* Top-Right Utility & Time-of-Day Selector */}
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex items-center bg-slate-950/85 border border-slate-700/80 p-1 rounded">
            <button
              type="button"
              onClick={() => setEnv('day')}
              aria-label="Daylight Arena"
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded transition-colors ${
                settings.environment === 'day'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">DAY</span>
            </button>
            <button
              type="button"
              onClick={() => setEnv('sunset')}
              aria-label="Sunset Arena"
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded transition-colors ${
                settings.environment === 'sunset'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Sunset className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">DUSK</span>
            </button>
            <button
              type="button"
              onClick={() => setEnv('midnight')}
              aria-label="Midnight Hunters Arena"
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded transition-colors ${
                settings.environment === 'midnight'
                  ? 'bg-red-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">MIDNIGHT</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const nextMuted = !settings.muted;
              audioEngine.playUiClick(500);
              onUpdateSettings({ ...settings, muted: nextMuted });
            }}
            aria-label={settings.muted ? 'Unmute Audio' : 'Mute Audio'}
            className="p-2.5 bg-slate-950/85 border border-slate-700/80 text-slate-200 hover:border-amber-400 rounded"
          >
            {settings.muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
          </button>
        </div>
      </div>

      {/* Middle Region: Left Menu Navigation + Optional Drawer, Right/Center 3D Character Unobstructed */}
      <div className="flex-1 flex items-center justify-between my-1.5 min-h-0 gap-2">
        <div className="pointer-events-auto flex items-stretch gap-2.5 h-full max-h-full min-h-0">
          {/* Primary Lobby Sidebar */}
          <div className="flex flex-col justify-center gap-1.5 w-36 sm:w-44 md:w-52 max-h-full overflow-y-auto vorqen-scroll pr-0.5">
            <button
              type="button"
              onClick={() => toggleTab('character')}
              className={`flex items-center gap-2 px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 border text-left font-bold tracking-wider text-xs sm:text-sm transition-colors ${
                activeTab === 'character'
                  ? 'bg-amber-500 text-slate-950 border-amber-300'
                  : 'bg-slate-950/85 text-slate-100 border-slate-700/80 hover:border-amber-400'
              }`}
            >
              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <div className="min-w-0">
                <div className="truncate">OPERATORS</div>
                <div className="text-[10px] sm:text-[11px] opacity-80 font-medium truncate">{activeChar.name}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => toggleTab('loadout')}
              className={`flex items-center gap-2 px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 border text-left font-bold tracking-wider text-xs sm:text-sm transition-colors ${
                activeTab === 'loadout'
                  ? 'bg-amber-500 text-slate-950 border-amber-300'
                  : 'bg-slate-950/85 text-slate-100 border-slate-700/80 hover:border-amber-400'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <div className="min-w-0">
                <div className="truncate">ARSENAL</div>
                <div className="text-[10px] sm:text-[11px] opacity-80 font-medium truncate">4 Weapons</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => toggleTab('settings')}
              className={`flex items-center gap-2 px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 border text-left font-bold tracking-wider text-xs sm:text-sm transition-colors ${
                activeTab === 'settings'
                  ? 'bg-amber-500 text-slate-950 border-amber-300'
                  : 'bg-slate-950/85 text-slate-100 border-slate-700/80 hover:border-amber-400'
              }`}
            >
              <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <div className="min-w-0">
                <div className="truncate">SETTINGS</div>
                <div className="text-[10px] sm:text-[11px] opacity-80 font-medium truncate">
                  {settings.graphics.toUpperCase()} · {settings.perspective.toUpperCase()}
                </div>
              </div>
            </button>

            {/* Mode Selector Box */}
            <div className="bg-slate-950/85 border border-slate-700/80 p-1.5 sm:p-2">
              <div className="text-[9px] sm:text-[10px] font-extrabold tracking-widest text-amber-400 mb-1 flex items-center gap-1">
                <Gamepad2 className="w-3 h-3" /> BATTLE MODE
              </div>
              <div className="grid grid-cols-1 gap-0.5 sm:gap-1">
                {GAME_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      audioEngine.playUiClick(620);
                      onSelectMode(m.id);
                    }}
                    className={`px-2 py-0.5 sm:py-1 text-left text-[11px] sm:text-xs font-bold flex items-center justify-between transition-colors ${
                      selectedMode === m.id
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{m.name}</span>
                    <span className="text-[10px] opacity-80 tabular-nums">{m.combatants}P</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Expandable Drawer (only shown when user clicks a Lobby tab) */}
          {activeTab !== 'none' && (
            <div className="w-56 sm:w-72 md:w-80 max-h-full overflow-y-auto vorqen-scroll bg-slate-950/92 border border-amber-500/40 p-3 text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <h2 className="text-sm font-black tracking-widest text-amber-400 uppercase">
                  {activeTab === 'character'
                    ? 'Operator & Outfits'
                    : activeTab === 'loadout'
                      ? 'Combat Arsenal'
                      : 'Graphics & Controls'}
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('none')}
                  aria-label="Close Drawer"
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {activeTab === 'character' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    {CHARACTERS.map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          audioEngine.playUiClick(660);
                          onSelectCharacter(ch.id);
                        }}
                        className={`w-full p-2 border text-left transition-colors ${
                          selectedCharacterId === ch.id
                            ? 'bg-amber-500/20 border-amber-400'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm">{ch.name}</span>
                          <span className="text-[11px] text-amber-300 font-bold">{ch.title}</span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-0.5">{ch.specialty}</div>
                      </button>
                    ))}
                  </div>

                  <div>
                    <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-1.5">
                      Outfit Finish
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {OUTFITS.map((of) => (
                        <button
                          key={of.id}
                          type="button"
                          onClick={() => {
                            audioEngine.playUiClick(700);
                            onSelectOutfit(of.id);
                          }}
                          className={`p-1.5 border text-left text-[11px] font-bold flex items-center gap-2 ${
                            selectedOutfitId === of.id
                              ? 'border-amber-400 bg-slate-800'
                              : 'border-slate-800 bg-slate-900/70'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-sm shrink-0 border border-white/25"
                            style={{ background: of.swatchCss }}
                          />
                          <span className="truncate">{of.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'loadout' && (
                <div className="space-y-2">
                  {Object.values(WEAPONS).map((w) => (
                    <div
                      key={w.id}
                      className="p-2 bg-slate-900/80 border border-slate-800 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm" style={{ color: w.color }}>
                          {w.name}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-800 text-slate-300">
                          {w.code}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">{w.role}</div>
                      <div className="grid grid-cols-3 gap-1 text-[10px] font-bold tabular-nums text-slate-300 pt-1">
                        <span>DMG {w.damage * w.pellets}</span>
                        <span>MAG {w.magSize}</span>
                        <span>RNG {w.range}m</span>
                      </div>
                    </div>
                  ))}
                  <div className="p-2 bg-slate-900/60 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Drop equipped with Pulse Carbine, Viper SMG, 2 Medkits, 2 Shield Cells & 2 Frag Cores.</span>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="font-bold text-slate-300 mb-1">Graphics Quality</div>
                    <div className="grid grid-cols-4 gap-1">
                      {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, graphics: q })}
                          className={`py-1.5 font-bold uppercase border ${
                            settings.graphics === q
                              ? 'bg-amber-500 text-slate-950 border-amber-300'
                              : 'bg-slate-900 text-slate-300 border-slate-700'
                          }`}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="font-bold text-slate-300 mb-1">Camera Perspective</div>
                    <div className="grid grid-cols-2 gap-1">
                      {(['tpp', 'fpp'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, perspective: p })}
                          className={`py-1.5 font-bold uppercase border ${
                            settings.perspective === p
                              ? 'bg-sky-500 text-slate-950 border-sky-300'
                              : 'bg-slate-900 text-slate-300 border-slate-700'
                          }`}
                        >
                          {p === 'tpp' ? '3rd Person' : '1st Person'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-2 space-y-2">
                    <div className="font-bold text-amber-400 flex items-center gap-1">
                      <Sliders className="w-3.5 h-3.5" /> Touch & Control Layout
                    </div>
                    <label className="block">
                      <span className="flex justify-between text-[11px] text-slate-300">
                        <span>Touch Button Scale</span>
                        <span className="tabular-nums">{settings.controls.buttonScale.toFixed(2)}x</span>
                      </span>
                      <input
                        type="range"
                        min={0.85}
                        max={1.25}
                        step={0.05}
                        value={settings.controls.buttonScale}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            controls: { ...settings.controls, buttonScale: Number(e.target.value) },
                          })
                        }
                        className="w-full accent-amber-500"
                      />
                    </label>

                    <label className="block">
                      <span className="flex justify-between text-[11px] text-slate-300">
                        <span>Aim Sensitivity</span>
                        <span className="tabular-nums">{settings.controls.touchSensitivity.toFixed(1)}</span>
                      </span>
                      <input
                        type="range"
                        min={0.5}
                        max={2.0}
                        step={0.1}
                        value={settings.controls.touchSensitivity}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            controls: { ...settings.controls, touchSensitivity: Number(e.target.value) },
                          })
                        }
                        className="w-full accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between text-[11px] text-slate-200 cursor-pointer">
                      <span>Always Show Touch Controls</span>
                      <input
                        type="checkbox"
                        checked={settings.controls.alwaysShowTouchControls}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            controls: {
                              ...settings.controls,
                              alwaysShowTouchControls: e.target.checked,
                            },
                          })
                        }
                        className="accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between text-[11px] text-slate-200 cursor-pointer">
                      <span>Auto-Sprint on Full Stick</span>
                      <input
                        type="checkbox"
                        checked={settings.controls.autoSprint}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            controls: { ...settings.controls, autoSprint: e.target.checked },
                          })
                        }
                        className="accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between text-[11px] text-slate-200 cursor-pointer">
                      <span>Gyroscope Aim (Mobile)</span>
                      <input
                        type="checkbox"
                        checked={settings.controls.gyroEnabled}
                        onChange={(e) =>
                          onUpdateSettings({
                            ...settings,
                            controls: { ...settings.controls, gyroEnabled: e.target.checked },
                          })
                        }
                        className="accent-amber-500"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Live Character Turntable Hint + Deploy CTA */}
        <div className="pointer-events-auto flex flex-col items-end justify-end self-end gap-1.5 shrink-0">
          <div className="text-[10px] sm:text-[11px] font-bold tracking-widest text-slate-200/90 hud-text-shadow uppercase">
            Drag to Rotate 360° · {activeChar.name}
          </div>
          <button
            type="button"
            data-start="true"
            onClick={() => {
              audioEngine.playUiClick(740);
              onStartMatch();
            }}
            className="px-5 sm:px-10 py-2.5 sm:py-3.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-sm sm:text-xl tracking-widest uppercase border-2 border-amber-200 shadow-lg transition-transform cursor-pointer whitespace-nowrap"
          >
            DEPLOY · {activeMode.name}
          </button>
        </div>
      </div>

      {/* Bottom Safe-Margin Flat Control Hint Line */}
      <div className="hidden md:block text-center text-[11px] sm:text-xs font-semibold tracking-wider text-slate-200/85 hud-text-shadow shrink-0">
        WASD / Joystick Move · Mouse / Drag Aim · Click / Fire · Space Jump · C Crouch · R Reload · Esc Pause
      </div>
    </div>
  );
};
