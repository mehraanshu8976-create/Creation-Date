export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type GameModeId = 'solo' | 'duo' | 'squad' | 'training' | 'practice';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export type EnvironmentPreset = 'day' | 'sunset' | 'midnight';

export type CameraPerspective = 'tpp' | 'fpp';

export type WeaponId = 'carbine' | 'smg' | 'railgun' | 'scatter';

export type BotArchetype = 'rusher' | 'flanker' | 'marksman';

export interface WeaponConfig {
  id: WeaponId;
  name: string;
  code: string;
  role: string;
  damage: number;
  fireRate: number; // shots per second
  magSize: number;
  reloadTime: number; // seconds
  projectileSpeed: number;
  spread: number;
  pellets: number;
  range: number;
  color: string;
  accentHex: number;
}

export interface CharacterPreset {
  id: string;
  name: string;
  title: string;
  specialty: string;
  helmetStyle: 'tactical' | 'visor' | 'juggernaut' | 'aero';
  baseSpeed: number;
  maxShield: number;
}

export interface OutfitPreset {
  id: string;
  name: string;
  primaryHex: number;
  secondaryHex: number;
  accentHex: number;
  swatchCss: string;
}

export interface ControlLayoutConfig {
  buttonScale: number; // 0.85 to 1.25
  actionOffsetY: number; // px shift
  joystickOffsetY: number; // px shift
  autoSprint: boolean;
  gyroEnabled: boolean;
  touchSensitivity: number; // 0.5 to 2.0
  alwaysShowTouchControls: boolean;
}

export interface GameSettings {
  graphics: GraphicsQuality;
  environment: EnvironmentPreset;
  perspective: CameraPerspective;
  muted: boolean;
  controls: ControlLayoutConfig;
}

export interface WeaponSlotState {
  weaponId: WeaponId;
  ammoInMag: number;
  reserveAmmo: number;
}

export interface KillFeedItem {
  id: number;
  killer: string;
  victim: string;
  weaponName: string;
  isPlayerInvolved: boolean;
  timestamp: number;
}

export interface NearbyLootPrompt {
  id: string;
  label: string;
  kind: 'weapon' | 'medkit' | 'shield' | 'ammo' | 'crate';
}

export interface MinimapActor {
  x: number;
  z: number;
  kind: 'player' | 'ally' | 'enemy' | 'crate';
}

export interface HudSnapshot {
  phase: 'parachute' | 'combat';
  altitude: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  stamina: number;
  isCrouching: boolean;
  isSprinting: boolean;
  isReloading: boolean;
  reloadProgress: number;
  activeSlot: 0 | 1;
  slots: [WeaponSlotState, WeaponSlotState | null];
  medkits: number;
  shieldCells: number;
  fragCores: number;
  aliveCount: number;
  totalCombatants: number;
  eliminations: number;
  damageDealt: number;
  matchTime: number;
  zonePhase: number;
  zoneTimer: number;
  zoneShrinking: boolean;
  inSafeZone: boolean;
  zoneCenterX: number;
  zoneCenterZ: number;
  zoneRadius: number;
  nextZoneRadius: number;
  playerX: number;
  playerZ: number;
  headingDeg: number;
  nearbyLoot: NearbyLootPrompt | null;
  hitMarkerTimer: number;
  damageFlashTimer: number;
  killFeed: KillFeedItem[];
  minimapActors: MinimapActor[];
  botTelegraphWarning: boolean;
  perspective: CameraPerspective;
}

export interface MatchResult {
  victory: boolean;
  rank: number;
  totalCombatants: number;
  eliminations: number;
  damageDealt: number;
  survivalTime: number;
  mode: GameModeId;
  score: number;
  bestScore: number;
}

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  carbine: {
    id: 'carbine',
    name: 'Pulse Carbine',
    code: 'AR-V7',
    role: 'All-Range Auto',
    damage: 24,
    fireRate: 7.5,
    magSize: 30,
    reloadTime: 1.6,
    projectileSpeed: 98,
    spread: 0.022,
    pellets: 1,
    range: 115,
    color: '#f59e0b',
    accentHex: 0xf59e0b,
  },
  smg: {
    id: 'smg',
    name: 'Viper SMG',
    code: 'VX-9',
    role: 'Rapid Close-Quarters',
    damage: 17,
    fireRate: 11.5,
    magSize: 36,
    reloadTime: 1.35,
    projectileSpeed: 88,
    spread: 0.042,
    pellets: 1,
    range: 75,
    color: '#06b6d4',
    accentHex: 0x06b6d4,
  },
  railgun: {
    id: 'railgun',
    name: 'Apex Railgun',
    code: 'XR-50',
    role: 'Long-Range Precision',
    damage: 62,
    fireRate: 1.35,
    magSize: 8,
    reloadTime: 2.1,
    projectileSpeed: 155,
    spread: 0.004,
    pellets: 1,
    range: 170,
    color: '#ef4444',
    accentHex: 0xef4444,
  },
  scatter: {
    id: 'scatter',
    name: 'Nova Scatter',
    code: 'SG-12',
    role: 'Heavy Spread Blast',
    damage: 15,
    fireRate: 1.8,
    magSize: 6,
    reloadTime: 1.9,
    projectileSpeed: 76,
    spread: 0.09,
    pellets: 6,
    range: 42,
    color: '#a855f7',
    accentHex: 0xa855f7,
  },
};

export const CHARACTERS: CharacterPreset[] = [
  {
    id: 'vanguard',
    name: 'VANGUARD',
    title: 'Strike Captain',
    specialty: 'Balanced Assault & Tactical Mobility',
    helmetStyle: 'tactical',
    baseSpeed: 8.8,
    maxShield: 100,
  },
  {
    id: 'spectre',
    name: 'SPECTRE',
    title: 'Phantom Recon',
    specialty: '+10% Sprint Velocity & Agile Strafe',
    helmetStyle: 'visor',
    baseSpeed: 9.5,
    maxShield: 90,
  },
  {
    id: 'titan',
    name: 'TITAN',
    title: 'Siege Breacher',
    specialty: '+25 Max Shield Capacity',
    helmetStyle: 'juggernaut',
    baseSpeed: 8.4,
    maxShield: 125,
  },
  {
    id: 'valkyrie',
    name: 'VALKYRIE',
    title: 'Skyborne Ace',
    specialty: 'Precision Glide & Fast Reload Ready',
    helmetStyle: 'aero',
    baseSpeed: 9.1,
    maxShield: 100,
  },
];

export const OUTFITS: OutfitPreset[] = [
  {
    id: 'apex-gold',
    name: 'Apex Gold & Crimson',
    primaryHex: 0x1e2433,
    secondaryHex: 0xd97706,
    accentHex: 0xef4444,
    swatchCss: 'linear-gradient(135deg, #1e2433 0%, #d97706 55%, #ef4444 100%)',
  },
  {
    id: 'cyber-cyan',
    name: 'Neon Recon Cyan',
    primaryHex: 0x111827,
    secondaryHex: 0x0284c7,
    accentHex: 0x22d3ee,
    swatchCss: 'linear-gradient(135deg, #111827 0%, #0284c7 55%, #22d3ee 100%)',
  },
  {
    id: 'emerald-ops',
    name: 'Emerald Jungle Ops',
    primaryHex: 0x1f2d24,
    secondaryHex: 0x15803d,
    accentHex: 0x84cc16,
    swatchCss: 'linear-gradient(135deg, #1f2d24 0%, #15803d 55%, #84cc16 100%)',
  },
  {
    id: 'obsidian-blood',
    name: 'Midnight Hunter',
    primaryHex: 0x18181b,
    secondaryHex: 0x991b1b,
    accentHex: 0xf97316,
    swatchCss: 'linear-gradient(135deg, #18181b 0%, #991b1b 55%, #f97316 100%)',
  },
];

export const GAME_MODES: Array<{
  id: GameModeId;
  name: string;
  subtitle: string;
  combatants: number;
  allies: number;
}> = [
  { id: 'solo', name: 'SOLO BR', subtitle: '50-Combatant Free-For-All', combatants: 50, allies: 0 },
  { id: 'duo', name: 'DUO OPS', subtitle: '50-Combatant w/ AI Wingman', combatants: 50, allies: 1 },
  { id: 'squad', name: 'SQUAD 4X', subtitle: '50-Combatant Tactical Squad', combatants: 50, allies: 3 },
  { id: 'practice', name: 'BLITZ 20', subtitle: 'Fast 20-Bot Skirmish Ring', combatants: 20, allies: 0 },
  { id: 'training', name: 'TRAINING', subtitle: 'Open Combat Range & Drills', combatants: 12, allies: 0 },
];
