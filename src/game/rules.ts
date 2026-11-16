import { BotArchetype, GameModeId, WEAPONS, WeaponId, WeaponSlotState } from './types';

export const ISLAND_RADIUS = 135;
export const WATER_LEVEL = -0.35;

export interface SafeZoneState {
  phase: number;
  centerX: number;
  centerZ: number;
  currentRadius: number;
  targetCenterX: number;
  targetCenterZ: number;
  targetRadius: number;
  timer: number;
  shrinking: boolean;
  damagePerSecond: number;
}

export interface DamageResult {
  newHp: number;
  newShield: number;
  absorbedByShield: number;
  hpDamage: number;
  eliminated: boolean;
}

export interface ZoneStepInput {
  zone: SafeZoneState;
  dt: number;
}

export const ZONE_PHASES: Array<{
  waitSec: number;
  shrinkSec: number;
  radius: number;
  dps: number;
}> = [
  { waitSec: 18, shrinkSec: 22, radius: 98, dps: 2 },
  { waitSec: 15, shrinkSec: 20, radius: 66, dps: 4 },
  { waitSec: 12, shrinkSec: 18, radius: 38, dps: 7 },
  { waitSec: 10, shrinkSec: 16, radius: 18, dps: 12 },
  { waitSec: 8, shrinkSec: 14, radius: 5, dps: 18 },
];

/**
 * Deterministic multi-biome open-world island heightfield.
 * - Center (0, 0) has a scenic lake basin spanned by a stone/steel bridge along X=0.
 * - North (-Z < -55) rises into the Northern Mountain Ridge (Chiliad-inspired peak).
 * - South-West & South-East feature flat coastal city & military airstrip pads.
 * - Perimeter (> 118m) slopes naturally into coastal beaches and shallow water.
 */
export function groundHeightAt(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);

  // Island outer coast falloff
  if (distFromCenter > ISLAND_RADIUS + 30) {
    return -3.2;
  }

  // Rolling natural terrain hills
  let h =
    Math.sin(x * 0.045) * Math.cos(z * 0.045) * 1.4 +
    Math.sin(x * 0.11 + 1.2) * Math.sin(z * 0.09 - 0.6) * 0.55;

  // Flatten Modern City pad (South-East: x in [18, 72], z in [18, 72])
  const cityDist = Math.hypot(x - 42, z - 44);
  if (cityDist < 34) {
    const blend = Math.max(0, Math.min(1, (34 - cityDist) / 10));
    h = h * (1 - blend) + 0.45 * blend;
  }

  // Flatten Military Base / Airstrip pad (West: x in [-88, -28], z in [-22, 34])
  const milDist = Math.hypot(x + 56, z - 6);
  if (milDist < 32) {
    const blend = Math.max(0, Math.min(1, (32 - milDist) / 10));
    h = h * (1 - blend) + 0.5 * blend;
  }

  // Flatten Spawn Plaza / Village overlook (South: x in [-26, 26], z in [24, 62])
  const spawnDist = Math.hypot(x, z - 38);
  if (spawnDist < 24) {
    const blend = Math.max(0, Math.min(1, (24 - spawnDist) / 8));
    h = h * (1 - blend) + 0.55 * blend;
  }

  // Northern Mountain Ridge (z < -50)
  if (z < -42) {
    const mFactor = Math.min(1, (-42 - z) / 55);
    const ridge = Math.exp(-Math.pow((x - 6) / 48, 2)) * 16.5 * mFactor;
    h += ridge;
  }

  // Central Lake Basin (around x = 0, z = -12)
  const lakeDx = x / 28;
  const lakeDz = (z + 12) / 16;
  const lakeR = Math.hypot(lakeDx, lakeDz);
  if (lakeR < 1.2) {
    const depthFactor = Math.max(0, 1 - lakeR / 1.2);
    h -= depthFactor * 3.1;
  }

  // Bridge causeway across central lake (x in [-4, 4], z in [-30, 8])
  if (Math.abs(x) < 4.2 && z > -30 && z < 8) {
    const bridgeDeckY = 1.15;
    const edge = Math.max(0, 1 - Math.max(0, Math.abs(x) - 3.0) / 1.2);
    h = Math.max(h, bridgeDeckY * edge);
  }

  // Natural coastal beach slope beyond 112m
  if (distFromCenter > 112) {
    const coastT = Math.min(1, (distFromCenter - 112) / 28);
    h = h * (1 - coastT) + (-2.8) * coastT;
  }

  return h;
}

export function createInitialSafeZone(): SafeZoneState {
  const first = ZONE_PHASES[0];
  return {
    phase: 1,
    centerX: 0,
    centerZ: 0,
    currentRadius: ISLAND_RADIUS + 8,
    targetCenterX: 4,
    targetCenterZ: 10,
    targetRadius: first.radius,
    timer: first.waitSec,
    shrinking: false,
    damagePerSecond: first.dps,
  };
}

export function stepSafeZone(
  zone: SafeZoneState,
  dt: number,
  rng: () => number = Math.random
): SafeZoneState {
  const next = { ...zone };
  const phaseCfg = ZONE_PHASES[Math.min(next.phase - 1, ZONE_PHASES.length - 1)];
  next.timer -= dt;

  if (!next.shrinking) {
    if (next.timer <= 0) {
      next.shrinking = true;
      next.timer = phaseCfg.shrinkSec;
    }
    return next;
  }

  // Shrink linearly over remaining shrink time
  const remaining = Math.max(0.016, next.timer + dt);
  const frac = Math.min(1, dt / remaining);
  next.currentRadius += (next.targetRadius - next.currentRadius) * frac;
  next.centerX += (next.targetCenterX - next.centerX) * frac;
  next.centerZ += (next.targetCenterZ - next.centerZ) * frac;

  if (next.timer <= 0) {
    next.currentRadius = next.targetRadius;
    next.centerX = next.targetCenterX;
    next.centerZ = next.targetCenterZ;
    next.shrinking = false;

    if (next.phase < ZONE_PHASES.length) {
      next.phase += 1;
      const upcoming = ZONE_PHASES[next.phase - 1];
      const maxShift = Math.max(0, next.currentRadius - upcoming.radius) * 0.45;
      const angle = rng() * Math.PI * 2;
      next.targetCenterX = next.centerX + Math.cos(angle) * maxShift;
      next.targetCenterZ = next.centerZ + Math.sin(angle) * maxShift;
      next.targetRadius = upcoming.radius;
      next.timer = upcoming.waitSec;
      next.damagePerSecond = upcoming.dps;
    } else {
      next.timer = 999;
    }
  }

  return next;
}

export function isInsideSafeZone(
  x: number,
  z: number,
  zone: Pick<SafeZoneState, 'centerX' | 'centerZ' | 'currentRadius'>
): boolean {
  return Math.hypot(x - zone.centerX, z - zone.centerZ) <= zone.currentRadius;
}

export function applyDamage(
  hp: number,
  shield: number,
  amount: number,
  bypassShield = false
): DamageResult {
  const dmg = Math.max(0, amount);
  let nextShield = Math.max(0, shield);
  let nextHp = Math.max(0, hp);
  let absorbedByShield = 0;

  if (!bypassShield && nextShield > 0) {
    absorbedByShield = Math.min(nextShield, dmg);
    nextShield -= absorbedByShield;
  }

  const hpDamage = dmg - absorbedByShield;
  nextHp = Math.max(0, nextHp - hpDamage);

  return {
    newHp: nextHp,
    newShield: nextShield,
    absorbedByShield,
    hpDamage,
    eliminated: nextHp <= 0,
  };
}

export function reloadWeaponSlot(slot: WeaponSlotState): WeaponSlotState {
  const cfg = WEAPONS[slot.weaponId];
  const needed = Math.max(0, cfg.magSize - slot.ammoInMag);
  if (needed === 0 || slot.reserveAmmo <= 0) {
    return slot;
  }
  const transfer = Math.min(needed, slot.reserveAmmo);
  return {
    ...slot,
    ammoInMag: slot.ammoInMag + transfer,
    reserveAmmo: slot.reserveAmmo - transfer,
  };
}

export function createWeaponSlot(weaponId: WeaponId, reserveMult = 3): WeaponSlotState {
  const cfg = WEAPONS[weaponId];
  return {
    weaponId,
    ammoInMag: cfg.magSize,
    reserveAmmo: cfg.magSize * reserveMult,
  };
}

export interface BotBehaviorDecision {
  desiredMoveDirX: number;
  desiredMoveDirZ: number;
  shouldFire: boolean;
  shouldTelegraph: boolean;
  desiredSpeedFactor: number;
}

/**
 * Pure AI policy selector with 3 genuinely distinct bot archetypes:
 * - 'rusher': aggressively closes distance to 6m while weaving slightly.
 * - 'flanker': orbits/strafes laterally around target at ~18m range.
 * - 'marksman': holds 30-48m standoff distance and backs away if target gets too close.
 */
export function decideBotAction(params: {
  archetype: BotArchetype;
  botX: number;
  botZ: number;
  targetX: number;
  targetZ: number;
  zoneCenterX: number;
  zoneCenterZ: number;
  zoneRadius: number;
  strafeSign: number;
  hasLineOfSight: boolean;
}): BotBehaviorDecision {
  const {
    archetype,
    botX,
    botZ,
    targetX,
    targetZ,
    zoneCenterX,
    zoneCenterZ,
    zoneRadius,
    strafeSign,
    hasLineOfSight,
  } = params;

  const zoneDist = Math.hypot(botX - zoneCenterX, botZ - zoneCenterZ);
  if (zoneDist > zoneRadius * 0.92) {
    const zx = (zoneCenterX - botX) / Math.max(0.01, zoneDist);
    const zz = (zoneCenterZ - botZ) / Math.max(0.01, zoneDist);
    return {
      desiredMoveDirX: zx,
      desiredMoveDirZ: zz,
      shouldFire: false,
      shouldTelegraph: false,
      desiredSpeedFactor: 1.15,
    };
  }

  const dx = targetX - botX;
  const dz = targetZ - botZ;
  const dist = Math.hypot(dx, dz);
  const nx = dx / Math.max(0.01, dist);
  const nz = dz / Math.max(0.01, dist);
  // Perpendicular vector for flanking/strafing
  const px = -nz * strafeSign;
  const pz = nx * strafeSign;

  if (archetype === 'rusher') {
    const moveFwd = dist > 7 ? 0.88 : 0.1;
    const mx = nx * moveFwd + px * 0.35;
    const mz = nz * moveFwd + pz * 0.35;
    const mLen = Math.hypot(mx, mz) || 1;
    return {
      desiredMoveDirX: mx / mLen,
      desiredMoveDirZ: mz / mLen,
      shouldFire: hasLineOfSight && dist < 44,
      shouldTelegraph: hasLineOfSight && dist < 48,
      desiredSpeedFactor: 1.05,
    };
  }

  if (archetype === 'flanker') {
    const radial = dist > 22 ? 0.55 : dist < 12 ? -0.45 : 0.05;
    const mx = nx * radial + px * 0.85;
    const mz = nz * radial + pz * 0.85;
    const mLen = Math.hypot(mx, mz) || 1;
    return {
      desiredMoveDirX: mx / mLen,
      desiredMoveDirZ: mz / mLen,
      shouldFire: hasLineOfSight && dist < 52,
      shouldTelegraph: hasLineOfSight && dist < 56,
      desiredSpeedFactor: 0.98,
    };
  }

  // 'marksman'
  const radial = dist > 48 ? 0.65 : dist < 24 ? -0.75 : 0;
  const mx = nx * radial + px * 0.4;
  const mz = nz * radial + pz * 0.4;
  const mLen = Math.hypot(mx, mz) || 1;
  return {
    desiredMoveDirX: mx / mLen,
    desiredMoveDirZ: mz / mLen,
    shouldFire: hasLineOfSight && dist < 76,
    shouldTelegraph: hasLineOfSight && dist < 82,
    desiredSpeedFactor: 0.82,
  };
}

export function calculateMatchScore(params: {
  victory: boolean;
  rank: number;
  totalCombatants: number;
  eliminations: number;
  damageDealt: number;
  survivalTime: number;
  mode: GameModeId;
}): number {
  const placementRatio = Math.max(
    0,
    (params.totalCombatants - params.rank + 1) / Math.max(1, params.totalCombatants)
  );
  const placementPts = Math.round(placementRatio * 600);
  const elimPts = params.eliminations * 150;
  const dmgPts = Math.round(params.damageDealt * 0.5);
  const timePts = Math.round(params.survivalTime * 1.5);
  const winBonus = params.victory ? 500 : 0;
  const modeMult = params.mode === 'training' ? 0.4 : 1;
  return Math.round((placementPts + elimPts + dmgPts + timePts + winBonus) * modeMult);
}
