import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDamage,
  calculateMatchScore,
  createInitialSafeZone,
  createWeaponSlot,
  decideBotAction,
  groundHeightAt,
  isInsideSafeZone,
  reloadWeaponSlot,
  stepSafeZone,
} from './rules';

test('groundHeightAt yields valid island terrain, bridge elevation, and coastal dropoff', () => {
  const spawnH = groundHeightAt(0, 38);
  const bridgeH = groundHeightAt(0, -10);
  const mountainH = groundHeightAt(6, -95);
  const oceanH = groundHeightAt(180, 180);

  assert.ok(spawnH > 0, 'spawn plaza should sit above water level');
  assert.ok(bridgeH > 1.0, 'central lake bridge should stay elevated above water');
  assert.ok(mountainH > 10, 'northern mountain ridge should rise sharply');
  assert.ok(oceanH < -2, 'outer perimeter should drop below sea level');
});

test('applyDamage absorbs with shield first unless bypassed by storm', () => {
  const res1 = applyDamage(100, 50, 35);
  assert.equal(res1.newShield, 15);
  assert.equal(res1.newHp, 100);
  assert.equal(res1.eliminated, false);

  const res2 = applyDamage(100, 20, 45);
  assert.equal(res2.newShield, 0);
  assert.equal(res2.newHp, 75);
  assert.equal(res2.absorbedByShield, 20);
  assert.equal(res2.hpDamage, 25);

  const stormRes = applyDamage(10, 80, 15, true);
  assert.equal(stormRes.newShield, 80);
  assert.equal(stormRes.newHp, 0);
  assert.equal(stormRes.eliminated, true);
});

test('safe zone transitions from waiting to shrinking and detects out-of-bounds', () => {
  let zone = createInitialSafeZone();
  const initialR = zone.currentRadius;
  assert.equal(zone.shrinking, false);

  // Fast-forward past initial wait timer
  zone = stepSafeZone(zone, zone.timer + 0.5, () => 0.25);
  assert.equal(zone.shrinking, true);

  // Step during shrink
  zone = stepSafeZone(zone, 5, () => 0.25);
  assert.ok(zone.currentRadius < initialR, 'radius should shrink');

  assert.equal(isInsideSafeZone(zone.centerX, zone.centerZ, zone), true);
  assert.equal(isInsideSafeZone(zone.centerX + 500, zone.centerZ, zone), false);
});

test('reloadWeaponSlot transfers reserve ammo up to magazine capacity', () => {
  const slot = createWeaponSlot('carbine', 2); // 30 mag, 60 reserve
  slot.ammoInMag = 12;
  const reloaded = reloadWeaponSlot(slot);
  assert.equal(reloaded.ammoInMag, 30);
  assert.equal(reloaded.reserveAmmo, 42);
});

test('decideBotAction differentiates rusher, flanker, and marksman policies', () => {
  const common = {
    botX: 0,
    botZ: 20,
    targetX: 0,
    targetZ: 0,
    zoneCenterX: 0,
    zoneCenterZ: 0,
    zoneRadius: 100,
    strafeSign: 1,
    hasLineOfSight: true,
  };

  const rusher = decideBotAction({ ...common, archetype: 'rusher' });
  const flanker = decideBotAction({ ...common, archetype: 'flanker' });
  const marksman = decideBotAction({ ...common, archetype: 'marksman' });

  // Rusher moves mostly forward (-Z), Flanker moves mostly laterally (+X), Marksman backs away (+Z) at 20m
  assert.ok(rusher.desiredMoveDirZ < -0.5);
  assert.ok(Math.abs(flanker.desiredMoveDirX) > 0.7);
  assert.ok(marksman.desiredMoveDirZ > 0.4);
});

test('calculateMatchScore awards victory bonus and elimination points', () => {
  const winScore = calculateMatchScore({
    victory: true,
    rank: 1,
    totalCombatants: 50,
    eliminations: 6,
    damageDealt: 600,
    survivalTime: 180,
    mode: 'solo',
  });
  const lossScore = calculateMatchScore({
    victory: false,
    rank: 25,
    totalCombatants: 50,
    eliminations: 1,
    damageDealt: 120,
    survivalTime: 60,
    mode: 'solo',
  });
  assert.ok(winScore > lossScore + 1000);
});
