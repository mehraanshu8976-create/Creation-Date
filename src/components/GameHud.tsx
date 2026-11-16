import React, { useEffect, useRef, useState } from 'react';
import { Eye, Pause, Volume2, VolumeX } from 'lucide-react';
import { VorqenGameEngine } from '../game/engine';
import { ISLAND_RADIUS } from '../game/rules';
import { GameSettings, HudSnapshot, WEAPONS } from '../game/types';
import { HudIcon } from './VorqenLogo';
import { audioEngine } from '../game/audio';

interface GameHudProps {
  hud: HudSnapshot;
  settings: GameSettings;
  engineRef: React.MutableRefObject<VorqenGameEngine | null>;
  minimapBgCanvas: HTMLCanvasElement | null;
  onToggleMute: () => void;
  onTogglePerspective: () => void;
  onPause: () => void;
}

const COMPASS_LABELS: Array<{ deg: number; label: string }> = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
];

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  settings,
  engineRef,
  minimapBgCanvas,
  onToggleMute,
  onTogglePerspective,
  onPause,
}) => {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });
  const joyPointerId = useRef<number | null>(null);
  const aimPointerId = useRef<number | null>(null);
  const lastAimPos = useRef({ x: 0, y: 0 });

  const [isTouchViewport, setIsTouchViewport] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsTouchViewport(hasTouch || window.innerWidth < 1024);
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  const showTouchControls = settings.controls.alwaysShowTouchControls || isTouchViewport;

  // Draw live minimap (Terrain + Safe Zone + Next Zone + Actors)
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvas.width;
    const worldSpan = (ISLAND_RADIUS + 20) * 2;
    const toPx = (wx: number, wz: number) => ({
      x: (wx / worldSpan + 0.5) * size,
      y: (wz / worldSpan + 0.5) * size,
    });

    ctx.clearRect(0, 0, size, size);
    if (minimapBgCanvas) {
      ctx.drawImage(minimapBgCanvas, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, size, size);
    }

    // Current safe zone circle
    const zc = toPx(hud.zoneCenterX, hud.zoneCenterZ);
    const zr = (hud.zoneRadius / worldSpan) * size;
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(zc.x, zc.y, zr, 0, Math.PI * 2);
    ctx.stroke();

    // Next safe zone circle
    const nzr = (hud.nextZoneRadius / worldSpan) * size;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(zc.x, zc.y, nzr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Actors & Supply Crates
    for (const a of hud.minimapActors) {
      const pt = toPx(a.x, a.z);
      if (a.kind === 'crate') {
        ctx.fillStyle = '#facc15';
        ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
      } else if (a.kind === 'ally') {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (a.kind === 'enemy') {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player heading arrow
    const pp = toPx(hud.playerX, hud.playerZ);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate((hud.headingDeg * Math.PI) / 180);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [hud, minimapBgCanvas]);

  const handleJoystickDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    joyPointerId.current = e.pointerId;
    updateJoystickFromClient(e.clientX, e.clientY);
  };

  const handleJoystickMove = (e: React.PointerEvent) => {
    if (joyPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    updateJoystickFromClient(e.clientX, e.clientY);
  };

  const handleJoystickUp = (e: React.PointerEvent) => {
    if (joyPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    joyPointerId.current = null;
    setJoyKnob({ x: 0, y: 0 });
    engineRef.current?.setVirtualJoystick(0, 0);
  };

  const updateJoystickFromClient = (clientX: number, clientY: number) => {
    const el = joystickBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.42;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setJoyKnob({ x: dx, y: dy });
    engineRef.current?.setVirtualJoystick(dx / maxR, dy / maxR);
  };

  // Right-side touch drag zone for camera rotation
  const handleAimDown = (e: React.PointerEvent) => {
    if (aimPointerId.current !== null) return;
    aimPointerId.current = e.pointerId;
    lastAimPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleAimMove = (e: React.PointerEvent) => {
    if (aimPointerId.current !== e.pointerId) return;
    const dx = e.clientX - lastAimPos.current.x;
    const dy = e.clientY - lastAimPos.current.y;
    lastAimPos.current = { x: e.clientX, y: e.clientY };
    engineRef.current?.addCameraDelta(dx * 1.4, dy * 1.4);
  };

  const handleAimUp = (e: React.PointerEvent) => {
    if (aimPointerId.current === e.pointerId) {
      aimPointerId.current = null;
    }
  };

  const activeSlot = hud.slots[hud.activeSlot] || hud.slots[0];
  const activeWeapon = WEAPONS[activeSlot.weaponId];
  const btnScale = settings.controls.buttonScale;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-20 overflow-hidden">
      {/* Peripheral Damage / Storm Vignette */}
      {(hud.damageFlashTimer > 0 || !hud.inSafeZone) && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            boxShadow: !hud.inSafeZone
              ? 'inset 0 0 85px rgba(6, 182, 212, 0.55)'
              : 'inset 0 0 95px rgba(239, 68, 68, 0.65)',
          }}
        />
      )}

      {/* Right-Half Touch Aim Surface (behind HUD buttons, only on touch devices) */}
      {showTouchControls && (
        <div
          onPointerDown={handleAimDown}
          onPointerMove={handleAimMove}
          onPointerUp={handleAimUp}
          onPointerCancel={handleAimUp}
          className="fixed top-0 right-0 w-1/2 h-full pointer-events-auto"
          aria-hidden="true"
        />
      )}

      {/* TOP-LEFT CLUSTER: Alive, Eliminations & Safe Zone Timer */}
      <div className="fixed top-2.5 left-2.5 sm:top-4 sm:left-4 flex items-center gap-2">
        <div className="bg-slate-950/82 border-l-4 border-amber-400 px-2.5 py-1.5 flex items-center gap-3">
          <div>
            <div className="text-[10px] font-bold tracking-widest text-slate-400">ALIVE</div>
            <div className="text-xl sm:text-2xl font-black text-white leading-none tabular-nums hud-stroke">
              {hud.aliveCount}
            </div>
          </div>
          <div className="w-px h-7 bg-slate-700" />
          <div>
            <div className="text-[10px] font-bold tracking-widest text-slate-400">ELIMS</div>
            <div className="text-xl sm:text-2xl font-black text-amber-400 leading-none tabular-nums hud-stroke">
              {hud.eliminations}
            </div>
          </div>
        </div>

        <div
          className={`px-2.5 py-1.5 bg-slate-950/82 border-l-4 ${
            hud.zoneShrinking ? 'border-red-500' : 'border-cyan-400'
          }`}
        >
          <div className="text-[10px] font-bold tracking-widest text-slate-400">
            ZONE {hud.zonePhase} {hud.zoneShrinking ? 'CLOSING' : 'HOLD'}
          </div>
          <div className="text-sm sm:text-base font-black text-cyan-300 leading-tight tabular-nums">
            {formatTimer(hud.zoneTimer)}
          </div>
        </div>
      </div>

      {/* TOP-CENTER: Tactical Compass + Killfeed + Parachute Altitude */}
      <div className="fixed top-2.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        <div className="bg-slate-950/78 border border-slate-700/70 px-3 py-1 flex items-center gap-3 text-xs font-extrabold tracking-widest text-slate-200 tabular-nums">
          {COMPASS_LABELS.map((c) => {
            let diff = ((c.deg - hud.headingDeg + 540) % 360) - 180;
            if (Math.abs(diff) > 65) return null;
            return (
              <span
                key={c.label}
                className={c.label === 'N' ? 'text-amber-400' : 'text-slate-300'}
              >
                {c.label}
              </span>
            );
          })}
          <span className="text-amber-300 border-l border-slate-700 pl-2">
            {String(hud.headingDeg).padStart(3, '0')}°
          </span>
        </div>

        {hud.phase === 'parachute' && (
          <div className="bg-amber-500 text-slate-950 px-3 py-1 font-black text-xs tracking-wider uppercase shadow">
            DROP ALT {hud.altitude}m · STEER TO LAND · SPACE FAST DIVE
          </div>
        )}

        {hud.botTelegraphWarning && (
          <div className="bg-red-600/90 text-white px-2.5 py-0.5 text-[11px] font-black tracking-wider uppercase">
            INCOMING LOCK-ON
          </div>
        )}

        {/* Killfeed */}
        <div className="flex flex-col items-center gap-0.5">
          {hud.killFeed.slice(0, 3).map((kf) => (
            <div
              key={kf.id}
              className={`px-2 py-0.5 text-[11px] font-bold tracking-wide ${
                kf.isPlayerInvolved
                  ? 'bg-amber-500/90 text-slate-950'
                  : 'bg-slate-950/75 text-slate-200'
              }`}
            >
              {kf.killer} [{kf.weaponName}] {kf.victim}
            </div>
          ))}
        </div>
      </div>

      {/* TOP-RIGHT CLUSTER: Minimap + Utility Buttons */}
      <div className="fixed top-2.5 right-2.5 sm:top-4 sm:right-4 flex items-start gap-2">
        <div className="pointer-events-auto flex flex-col gap-1.5">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause Game [P]"
            className="w-9 h-9 bg-slate-950/85 border border-slate-700 text-slate-100 hover:border-amber-400 flex items-center justify-center cursor-pointer"
          >
            <Pause className="w-4 h-4" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label="Toggle Mute [M]"
            className="w-9 h-9 bg-slate-950/85 border border-slate-700 text-slate-100 hover:border-amber-400 flex items-center justify-center cursor-pointer"
          >
            {settings.muted ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-amber-400" />
            )}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onTogglePerspective();
            }}
            aria-label="Switch Camera Perspective"
            className="w-9 h-9 bg-slate-950/85 border border-slate-700 text-[10px] font-black text-sky-300 hover:border-amber-400 flex flex-col items-center justify-center cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{hud.perspective.toUpperCase()}</span>
          </button>
        </div>

        <div className="border-2 border-slate-700 bg-slate-950/90 p-0.5 shadow-lg">
          <canvas
            ref={minimapRef}
            width={118}
            height={118}
            className="w-24 h-24 sm:w-28 sm:h-28 block"
          />
        </div>
      </div>

      {/* EXACT CENTER RETICLE + HITMARKER */}
      {hud.phase === 'combat' && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <svg viewBox="0 0 36 36" className="w-8 h-8">
            <circle cx="18" cy="18" r="1.8" fill="#ffffff" stroke="#090d16" strokeWidth="1" />
            <line x1="18" y1="6" x2="18" y2="12" stroke="#ffffff" strokeWidth="2" />
            <line x1="18" y1="24" x2="18" y2="30" stroke="#ffffff" strokeWidth="2" />
            <line x1="6" y1="18" x2="12" y2="18" stroke="#ffffff" strokeWidth="2" />
            <line x1="24" y1="18" x2="30" y2="18" stroke="#ffffff" strokeWidth="2" />
            {hud.hitMarkerTimer > 0 && (
              <g stroke="#ef4444" strokeWidth="2.5">
                <line x1="9" y1="9" x2="14" y2="14" />
                <line x1="27" y1="9" x2="22" y2="14" />
                <line x1="9" y1="27" x2="14" y2="22" />
                <line x1="27" y1="27" x2="22" y2="22" />
              </g>
            )}
          </svg>
        </div>
      )}

      {/* NEARBY LOOT INTERACTION PROMPT */}
      {hud.nearbyLoot && hud.phase === 'combat' && (
        <div className="fixed left-1/2 top-[60%] -translate-x-1/2 pointer-events-auto">
          <button
            type="button"
            onClick={() => engineRef.current?.triggerInteract()}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-950/90 border border-amber-400 text-amber-300 text-xs font-extrabold tracking-wider shadow cursor-pointer"
          >
            <HudIcon kind={hud.nearbyLoot.kind} className="w-4 h-4" />
            <span>[E] {hud.nearbyLoot.label}</span>
          </button>
        </div>
      )}

      {/* BOTTOM-CENTER CLUSTER: Vitality Bars + Quick Consumables + 2 Weapon Slots */}
      <div className="fixed bottom-1.5 sm:bottom-2.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 w-[min(370px,54vw)] sm:w-[min(430px,92vw)]">
        {/* Shield & HP Bars */}
        <div className="w-full bg-slate-950/85 border border-slate-700/80 px-3 py-1.5">
          <div className="flex items-center justify-between text-[11px] font-extrabold tracking-wider mb-1 tabular-nums">
            <span className="text-sky-300">SHIELD {hud.shield}</span>
            <span className="text-white text-sm">HP {hud.hp}</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 mb-1 overflow-hidden">
            <div
              className="h-full bg-sky-400 transition-all duration-100"
              style={{ width: `${Math.min(100, (hud.shield / Math.max(1, hud.maxShield)) * 100)}%` }}
            />
          </div>
          <div className="w-full h-2.5 bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                hud.hp > 50 ? 'bg-emerald-500' : hud.hp > 25 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100)}%` }}
            />
          </div>
        </div>

        {/* Weapon Slots & Quick Consumables */}
        <div className="pointer-events-auto flex items-center justify-center gap-1.5 w-full">
          {/* Quick Consumables */}
          <button
            type="button"
            onClick={() => engineRef.current?.useMedkit()}
            aria-label="Use Medkit [H]"
            className="flex items-center gap-1 px-2 py-1.5 bg-slate-950/88 border border-slate-700 hover:border-emerald-400 text-xs font-bold tabular-nums cursor-pointer"
          >
            <HudIcon kind="medkit" className="w-4 h-4" />
            <span className="text-emerald-300">{hud.medkits}</span>
          </button>

          <button
            type="button"
            onClick={() => engineRef.current?.useShieldCell()}
            aria-label="Use Shield Cell [V]"
            className="flex items-center gap-1 px-2 py-1.5 bg-slate-950/88 border border-slate-700 hover:border-sky-400 text-xs font-bold tabular-nums cursor-pointer"
          >
            <HudIcon kind="shield" className="w-4 h-4" />
            <span className="text-sky-300">{hud.shieldCells}</span>
          </button>

          <button
            type="button"
            onClick={() => engineRef.current?.throwGrenade()}
            aria-label="Throw Frag Core [G]"
            className="flex items-center gap-1 px-2 py-1.5 bg-slate-950/88 border border-slate-700 hover:border-red-400 text-xs font-bold tabular-nums cursor-pointer"
          >
            <HudIcon kind="frag" className="w-4 h-4" />
            <span className="text-red-300">{hud.fragCores}</span>
          </button>

          {/* Weapon Slots */}
          {[0, 1].map((idx) => {
            const slot = hud.slots[idx as 0 | 1];
            if (!slot) return null;
            const cfg = WEAPONS[slot.weaponId];
            const isActive = hud.activeSlot === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => engineRef.current?.switchWeaponSlot(idx as 0 | 1)}
                className={`flex-1 px-2.5 py-1 border text-left transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-slate-900/95 border-amber-400'
                    : 'bg-slate-950/80 border-slate-700/80 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-black">
                  <span style={{ color: cfg.color }}>
                    [{idx + 1}] {cfg.name}
                  </span>
                  {hud.isReloading && isActive && (
                    <span className="text-amber-300">RELOADING</span>
                  )}
                </div>
                <div className="text-sm font-black text-white tabular-nums leading-tight">
                  {slot.ammoInMag}{' '}
                  <span className="text-[11px] text-slate-400">/ {slot.reserveAmmo}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MOBILE / TOUCH CONTROLS (Left Joystick + Right Action Cluster) */}
      {showTouchControls && (
        <>
          {/* Left-Side Virtual Joystick + Left Secondary Fire Button */}
          <div
            className="fixed left-3 bottom-4 sm:left-4 sm:bottom-20 pointer-events-auto flex flex-col items-center gap-2.5"
            style={{ transform: `scale(${btnScale})`, transformOrigin: 'bottom left' }}
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                engineRef.current?.setTouchFire(true);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                engineRef.current?.setTouchFire(false);
              }}
              onPointerLeave={() => engineRef.current?.setTouchFire(false)}
              aria-label="Left Fire Button"
              className="w-11 h-11 rounded-full bg-red-600/85 border-2 border-amber-300 text-[10px] font-black text-white shadow active:scale-95"
            >
              FIRE
            </button>

            <div
              ref={joystickBaseRef}
              onPointerDown={handleJoystickDown}
              onPointerMove={handleJoystickMove}
              onPointerUp={handleJoystickUp}
              onPointerCancel={handleJoystickUp}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-slate-950/60 border-2 border-slate-400/50 relative flex items-center justify-center touch-none"
              aria-label="Virtual Movement Joystick"
            >
              <div
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-400/90 border-2 border-white shadow"
                style={{
                  transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
                }}
              />
            </div>
          </div>

          {/* Right-Side Action Buttons Cluster */}
          <div
            className="fixed right-3 bottom-4 sm:right-4 sm:bottom-20 pointer-events-auto grid grid-cols-3 gap-1.5 sm:gap-2 items-end"
            style={{ transform: `scale(${btnScale})`, transformOrigin: 'bottom right' }}
          >
            <button
              type="button"
              onClick={() => engineRef.current?.toggleSprint()}
              className={`w-12 h-12 rounded-full border text-[10px] font-black ${
                hud.isSprinting
                  ? 'bg-amber-500 text-slate-950 border-white'
                  : 'bg-slate-950/75 text-slate-200 border-slate-500'
              }`}
            >
              RUN
            </button>
            <button
              type="button"
              onClick={() => engineRef.current?.toggleAds()}
              className="w-12 h-12 rounded-full bg-slate-950/75 border border-slate-500 text-[10px] font-black text-sky-300"
            >
              AIM
            </button>
            <button
              type="button"
              onClick={() => engineRef.current?.triggerJump()}
              className="w-12 h-12 rounded-full bg-slate-950/75 border border-slate-500 text-[10px] font-black text-white"
            >
              JUMP
            </button>

            <button
              type="button"
              onClick={() => engineRef.current?.triggerReload()}
              className="w-12 h-12 rounded-full bg-slate-950/75 border border-slate-500 text-[10px] font-black text-amber-300"
            >
              RLD
            </button>
            <button
              type="button"
              onClick={() => engineRef.current?.toggleCrouch()}
              className={`w-12 h-12 rounded-full border text-[10px] font-black ${
                hud.isCrouching
                  ? 'bg-cyan-500 text-slate-950 border-white'
                  : 'bg-slate-950/75 text-slate-200 border-slate-500'
              }`}
            >
              CRCH
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                audioEngine.playUiClick(300);
                engineRef.current?.setTouchFire(true);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                engineRef.current?.setTouchFire(false);
              }}
              onPointerLeave={() => engineRef.current?.setTouchFire(false)}
              aria-label="Primary Fire Button"
              className="w-16 h-16 rounded-full bg-red-600/90 border-2 border-amber-300 text-xs font-black text-white shadow-lg active:scale-95"
            >
              FIRE
            </button>
          </div>
        </>
      )}

      {/* Subtle Active Weapon Badge on Desktop */}
      {!showTouchControls && (
        <div className="fixed bottom-3 right-4 text-[11px] font-bold text-slate-300/80 hud-text-shadow">
          {activeWeapon.code} · [LMB] Fire · [RMB] Aim · [G] Frag · [E] Loot
        </div>
      )}
    </div>
  );
};
