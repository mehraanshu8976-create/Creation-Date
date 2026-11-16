import * as THREE from 'three';
import { CharacterPreset, OutfitPreset, WEAPONS, WeaponId } from './types';
import { ProceduralTextureSet } from './textures';

export interface CharacterRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  parachuteGroup: THREE.Group;
  weaponMount: THREE.Group;
  contactShadow: THREE.Mesh;
  materialsToFlash: THREE.MeshStandardMaterial[];
  walkPhase: number;
  hitFlashTimer: number;
  squashY: number;
}

export function createWeaponMesh(weaponId: WeaponId): THREE.Group {
  const cfg = WEAPONS[weaponId];
  const group = new THREE.Group();

  const gunMetal = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.78,
    roughness: 0.28,
  });
  const polymer = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.15,
    roughness: 0.72,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: cfg.accentHex,
    emissive: cfg.accentHex,
    emissiveIntensity: 0.65,
    roughness: 0.25,
    metalness: 0.4,
  });

  const bodyLen = weaponId === 'railgun' ? 0.92 : weaponId === 'smg' ? 0.52 : 0.72;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, bodyLen), gunMetal);
  receiver.position.set(0, 0.04, bodyLen * 0.25);
  group.add(receiver);

  const barrelLen = weaponId === 'railgun' ? 0.55 : weaponId === 'smg' ? 0.22 : 0.36;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, barrelLen, 8), gunMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.06, bodyLen * 0.65 + barrelLen * 0.35);
  group.add(barrel);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), polymer);
  grip.rotation.x = 0.25;
  grip.position.set(0, -0.06, 0.04);
  group.add(grip);

  const mag = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, weaponId === 'smg' ? 0.22 : 0.16, 0.09),
    polymer
  );
  mag.rotation.x = -0.15;
  mag.position.set(0, -0.08, 0.26);
  group.add(mag);

  const optic = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.16), accent);
  optic.position.set(0, 0.13, 0.22);
  group.add(optic);

  return group;
}

export function createCharacterRig(
  preset: CharacterPreset,
  outfit: OutfitPreset,
  weaponId: WeaponId,
  contactShadowTex: THREE.Texture
): CharacterRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const primaryMat = new THREE.MeshStandardMaterial({
    color: outfit.primaryHex,
    roughness: 0.72,
    metalness: 0.15,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: outfit.secondaryHex,
    roughness: 0.38,
    metalness: 0.55,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: outfit.accentHex,
    emissive: outfit.accentHex,
    emissiveIntensity: 0.55,
    roughness: 0.15,
    metalness: 0.85,
  });
  const darkBootMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.85,
    metalness: 0.1,
  });

  const materialsToFlash = [primaryMat, armorMat];

  // Legs (hip pivot at y=0.92, boots reach down to y=0.0)
  const makeLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.17, 0.92, 0);

    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 0.24), primaryMat);
    thigh.position.y = -0.22;
    thigh.castShadow = true;
    hip.add(thigh);

    const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.27), armorMat);
    kneePad.position.set(0, -0.44, 0.02);
    hip.add(kneePad);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.44, 0.3), darkBootMat);
    boot.position.set(0, -0.7, 0.03);
    boot.castShadow = true;
    hip.add(boot);

    return hip;
  };

  const leftLegPivot = makeLeg(-1);
  const rightLegPivot = makeLeg(1);
  bodyPivot.add(leftLegPivot, rightLegPivot);

  // Torso & Tactical Vest
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.34), primaryMat);
  torso.position.y = 1.26;
  torso.castShadow = true;
  bodyPivot.add(torso);

  const chestRig = new THREE.Mesh(
    new THREE.BoxGeometry(
      preset.helmetStyle === 'juggernaut' ? 0.66 : 0.6,
      0.46,
      0.4
    ),
    armorMat
  );
  chestRig.position.y = 1.32;
  chestRig.castShadow = true;
  bodyPivot.add(chestRig);

  const chestCore = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.43), visorMat);
  chestCore.position.set(0, 1.36, 0.01);
  bodyPivot.add(chestCore);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.11, 0.37), darkBootMat);
  belt.position.y = 0.96;
  bodyPivot.add(belt);

  // Tactical Backpack
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.22), armorMat);
  backpack.position.set(0, 1.32, -0.26);
  backpack.castShadow = true;
  bodyPivot.add(backpack);

  const packStrip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.24), visorMat);
  packStrip.position.set(0, 1.44, -0.27);
  bodyPivot.add(packStrip);

  // Head & Character-Specific Helmet Silhouette
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.66, 0);
  bodyPivot.add(headGroup);

  const headCore = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.36), primaryMat);
  headCore.position.y = 0.18;
  headCore.castShadow = true;
  headGroup.add(headCore);

  const helmetCrown = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.2, 0.41), armorMat);
  helmetCrown.position.y = 0.28;
  headGroup.add(helmetCrown);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.08), visorMat);
  visor.position.set(0, 0.2, 0.18);
  headGroup.add(visor);

  if (preset.helmetStyle === 'aero') {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.42), visorMat);
    fin.position.set(0, 0.4, -0.05);
    headGroup.add(fin);
  } else if (preset.helmetStyle === 'juggernaut') {
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.46), armorMat);
    collar.position.set(0, 0.02, -0.02);
    headGroup.add(collar);
  } else if (preset.helmetStyle === 'visor') {
    const antennae = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6), visorMat);
    antennae.position.set(0.18, 0.36, -0.08);
    headGroup.add(antennae);
  }

  // Arms + Weapon Mount
  const makeArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.37, 1.52, 0);

    const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.26), armorMat);
    pauldron.position.y = -0.06;
    shoulder.add(pauldron);

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.52, 0.2), primaryMat);
    sleeve.position.y = -0.3;
    sleeve.castShadow = true;
    shoulder.add(sleeve);

    return shoulder;
  };

  const leftArmPivot = makeArm(-1);
  const rightArmPivot = makeArm(1);
  bodyPivot.add(leftArmPivot, rightArmPivot);

  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, -0.52, 0.16);
  weaponMount.rotation.x = Math.PI / 2 - 0.1;
  weaponMount.add(createWeaponMesh(weaponId));
  rightArmPivot.add(weaponMount);

  // Parachute rig (hidden when grounded)
  const parachuteGroup = new THREE.Group();
  parachuteGroup.position.set(0, 2.05, 0);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: outfit.secondaryHex,
    roughness: 0.62,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const canopyAccentMat = new THREE.MeshStandardMaterial({
    color: outfit.accentHex,
    roughness: 0.48,
    side: THREE.DoubleSide,
  });
  const canopyGeo = new THREE.CylinderGeometry(1.6, 1.95, 2.6, 12, 1, true, 0, Math.PI);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.rotation.z = Math.PI / 2;
  canopy.rotation.y = Math.PI / 2;
  canopy.position.y = 1.25;
  parachuteGroup.add(canopy);

  const trimBandGeo = new THREE.CylinderGeometry(1.64, 1.99, 0.48, 12, 1, true, 0, Math.PI);
  const trimBand = new THREE.Mesh(trimBandGeo, canopyAccentMat);
  trimBand.rotation.z = Math.PI / 2;
  trimBand.rotation.y = Math.PI / 2;
  trimBand.position.y = 1.25;
  parachuteGroup.add(trimBand);

  const cordMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
  [
    [-1.4, -0.75],
    [1.4, -0.75],
    [-1.4, 0.75],
    [1.4, 0.75],
  ].forEach(([cx, cz]) => {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 4), cordMat);
    cord.position.set(cx * 0.55, 0.9, cz * 0.55);
    cord.rotation.z = cx * -0.28;
    cord.rotation.x = cz * 0.25;
    parachuteGroup.add(cord);
  });
  parachuteGroup.visible = false;
  root.add(parachuteGroup);

  // Ground Contact Shadow Disc
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  return {
    root,
    bodyPivot,
    headGroup,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    parachuteGroup,
    weaponMount,
    contactShadow,
    materialsToFlash,
    walkPhase: 0,
    hitFlashTimer: 0,
    squashY: 1,
  };
}

export function setRigWeapon(rig: CharacterRig, weaponId: WeaponId) {
  while (rig.weaponMount.children.length > 0) {
    rig.weaponMount.remove(rig.weaponMount.children[0]);
  }
  rig.weaponMount.add(createWeaponMesh(weaponId));
}

export function animateCharacterRig(
  rig: CharacterRig,
  params: {
    speed: number;
    isGrounded: boolean;
    isCrouching: boolean;
    isParachuting: boolean;
    isVictory?: boolean;
    time: number;
    dt: number;
  }
) {
  const { speed, isGrounded, isCrouching, isParachuting, isVictory, time, dt } = params;

  // Hit flash decay
  if (rig.hitFlashTimer > 0) {
    rig.hitFlashTimer = Math.max(0, rig.hitFlashTimer - dt);
    const active = rig.hitFlashTimer > 0;
    for (const mat of rig.materialsToFlash) {
      mat.emissive.setHex(active ? 0xffffff : 0x000000);
      mat.emissiveIntensity = active ? 0.85 : 0;
    }
  }

  // Smooth squash-and-stretch recovery
  rig.squashY = THREE.MathUtils.damp(rig.squashY, 1, 14, dt);
  const invXZ = 1 / Math.sqrt(Math.max(0.5, rig.squashY));
  rig.bodyPivot.scale.set(invXZ, rig.squashY, invXZ);

  rig.parachuteGroup.visible = isParachuting;
  rig.contactShadow.visible = isGrounded && !isParachuting;

  if (isVictory) {
    rig.bodyPivot.position.y = Math.abs(Math.sin(time * 5)) * 0.18;
    rig.rightArmPivot.rotation.x = -2.4 + Math.sin(time * 6) * 0.25;
    rig.leftArmPivot.rotation.x = -2.2 + Math.cos(time * 6) * 0.25;
    rig.leftLegPivot.rotation.x = 0;
    rig.rightLegPivot.rotation.x = 0;
    return;
  }

  if (isParachuting) {
    rig.bodyPivot.position.y = 0;
    rig.leftArmPivot.rotation.x = -2.5;
    rig.rightArmPivot.rotation.x = -2.5;
    rig.leftLegPivot.rotation.x = 0.25 + Math.sin(time * 4) * 0.1;
    rig.rightLegPivot.rotation.x = -0.2 - Math.sin(time * 4) * 0.1;
    rig.parachuteGroup.rotation.z = Math.sin(time * 2.5) * 0.06;
    return;
  }

  // Gait-synced leg/arm swing based on actual distance traveled
  if (isGrounded && speed > 0.25) {
    rig.walkPhase += speed * dt * 1.35;
    const swing = Math.sin(rig.walkPhase) * Math.min(0.85, speed * 0.1);
    rig.leftLegPivot.rotation.x = swing;
    rig.rightLegPivot.rotation.x = -swing;
    rig.leftArmPivot.rotation.x = -swing * 0.7;
    rig.rightArmPivot.rotation.x = -1.15 + swing * 0.15;
    rig.bodyPivot.position.y =
      (isCrouching ? -0.32 : 0) + Math.abs(Math.cos(rig.walkPhase)) * 0.06;
  } else if (!isGrounded) {
    rig.leftLegPivot.rotation.x = 0.35;
    rig.rightLegPivot.rotation.x = -0.25;
    rig.leftArmPivot.rotation.x = -0.6;
    rig.rightArmPivot.rotation.x = -1.2;
    rig.bodyPivot.position.y = 0;
  } else {
    rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0, 12, dt);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, 0, 12, dt);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, 0.15, 10, dt);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, -1.1, 10, dt);
    rig.bodyPivot.position.y = THREE.MathUtils.damp(
      rig.bodyPivot.position.y,
      isCrouching ? -0.36 : 0,
      12,
      dt
    );
  }
}

export type BuildingKind =
  | 'apartment'
  | 'militaryHangar'
  | 'watchtower'
  | 'warehouse'
  | 'ruinTower'
  | 'villageHouse';

export interface BuildingResult {
  group: THREE.Group;
  colliderHalfW: number;
  colliderHalfD: number;
  colliderHeight: number;
}

export function createBuildingGroup(
  kind: BuildingKind,
  textures: ProceduralTextureSet
): BuildingResult {
  const group = new THREE.Group();

  const concreteMat = new THREE.MeshStandardMaterial({
    map: textures.concreteColor,
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.05,
  });
  const aptMat = new THREE.MeshStandardMaterial({
    map: textures.apartmentFacade,
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.04,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    map: textures.metalPanel,
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.62,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMasonry,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.05,
  });
  const roofTerracotta = new THREE.MeshStandardMaterial({
    color: 0x9a462f,
    roughness: 0.76,
    metalness: 0.05,
  });
  const darkTrim = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.5,
  });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 1.4,
    roughness: 0.25,
  });

  if (kind === 'apartment') {
    const w = 12;
    const h = 11.5;
    const d = 8.5;
    // Plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), concreteMat);
    plinth.position.y = 0.4;
    plinth.receiveShadow = true;
    // Main facade
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), aptMat);
    body.position.y = 0.8 + h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    // Sloped Roof + Parapet
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.9, d + 0.8), roofTerracotta);
    roof.position.y = 0.8 + h + 0.45;
    roof.castShadow = true;
    // AC / Penthouse unit
    const ac = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 2.2), darkTrim);
    ac.position.set(2.5, 0.8 + h + 1.5, -1);
    // Doorframe jambs
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.1, 0.5), darkTrim);
    door.position.set(0, 2.0, d / 2 + 0.1);
    group.add(plinth, body, roof, ac, door);
    return { group, colliderHalfW: w / 2 + 0.3, colliderHalfD: d / 2 + 0.3, colliderHeight: h + 1 };
  }

  if (kind === 'militaryHangar') {
    const w = 13;
    const h = 7.5;
    const d = 15;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.4, d + 1), concreteMat);
    pad.position.y = 0.2;
    pad.receiveShadow = true;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metalMat);
    shell.position.y = 0.4 + h / 2;
    shell.castShadow = true;
    shell.receiveShadow = true;
    const archRoof = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.52, w * 0.52, d + 0.4, 12, 1, false, 0, Math.PI),
      darkTrim
    );
    archRoof.rotation.z = Math.PI / 2;
    archRoof.rotation.y = Math.PI / 2;
    archRoof.position.y = 0.4 + h;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 4.5, 6), darkTrim);
    mast.position.set(-4, h + 3.2, -5);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), emberMat);
    beacon.position.set(-4, h + 5.5, -5);
    group.add(pad, shell, archRoof, mast, beacon);
    return { group, colliderHalfW: w / 2 + 0.4, colliderHalfD: d / 2 + 0.4, colliderHeight: h + 3 };
  }

  if (kind === 'watchtower') {
    const w = 4.6;
    const d = 4.6;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), concreteMat);
    base.position.y = 0.3;
    group.add(base);
    // 4 support pillars
    [
      [-1.7, -1.7],
      [1.7, -1.7],
      [-1.7, 1.7],
      [1.7, 1.7],
    ].forEach(([px, pz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 7.2, 0.45), darkTrim);
      leg.position.set(px, 4.0, pz);
      leg.castShadow = true;
      group.add(leg);
    });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 5.6), metalMat);
    deck.position.y = 7.6;
    deck.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.8, 4.4), metalMat);
    cabin.position.y = 9.2;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(4.0, 2.0, 4), darkTrim);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = 11.6;
    group.add(deck, cabin, cap);
    return { group, colliderHalfW: 2.5, colliderHalfD: 2.5, colliderHeight: 12 };
  }

  if (kind === 'ruinTower') {
    const w = 9;
    const h = 11;
    const d = 9;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, d + 1), stoneMat);
    base.position.y = 0.6;
    const keep = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
    keep.position.y = 1.2 + h / 2;
    keep.castShadow = true;
    keep.receiveShadow = true;
    // Corner gothic spires
    [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [-w / 2, d / 2],
      [w / 2, d / 2],
    ].forEach(([cx, cz]) => {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, h + 3.2, 8), stoneMat);
      turret.position.set(cx, (h + 3.2) / 2, cz);
      turret.castShadow = true;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.8, 8), darkTrim);
      spire.position.set(cx, h + 4.4, cz);
      group.add(turret, spire);
    });
    // Crimson brazier accents (Midnight Hunters nod)
    const brazierL = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), emberMat);
    brazierL.position.set(-2.2, 3.0, d / 2 + 0.7);
    const brazierR = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), emberMat);
    brazierR.position.set(2.2, 3.0, d / 2 + 0.7);
    group.add(base, keep, brazierL, brazierR);
    return { group, colliderHalfW: w / 2 + 1.0, colliderHalfD: d / 2 + 1.0, colliderHeight: h + 4 };
  }

  if (kind === 'warehouse') {
    const w = 11;
    const h = 6.2;
    const d = 9;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.4, d + 0.8), concreteMat);
    pad.position.y = 0.2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metalMat);
    body.position.y = 0.4 + h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), darkTrim);
    roof.position.y = 0.4 + h + 0.25;
    const awning = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 2.0), roofTerracotta);
    awning.position.set(0, 3.8, d / 2 + 0.9);
    group.add(pad, body, roof, awning);
    return { group, colliderHalfW: w / 2 + 0.3, colliderHalfD: d / 2 + 0.3, colliderHeight: h + 1 };
  }

  // 'villageHouse'
  const w = 7.2;
  const h = 4.4;
  const d = 6.2;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), concreteMat);
  plinth.position.y = 0.25;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), aptMat);
  walls.position.y = 0.5 + h / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  const pitchedRoof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.8, 4), roofTerracotta);
  pitchedRoof.rotation.y = Math.PI / 4;
  pitchedRoof.position.y = 0.5 + h + 1.3;
  pitchedRoof.castShadow = true;
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), stoneMat);
  chimney.position.set(1.8, 0.5 + h + 1.4, -1.2);
  group.add(plinth, walls, pitchedRoof, chimney);
  return { group, colliderHalfW: w / 2 + 0.3, colliderHalfD: d / 2 + 0.3, colliderHeight: h + 2 };
}

export function createLootPickupGroup(
  kind: 'weapon' | 'medkit' | 'shield' | 'ammo' | 'crate',
  weaponId?: WeaponId
): THREE.Group {
  const g = new THREE.Group();
  const glowColor =
    kind === 'medkit'
      ? 0x22c55e
      : kind === 'shield'
        ? 0x38bdf8
        : kind === 'ammo'
          ? 0xfacc15
          : kind === 'crate'
            ? 0xef4444
            : weaponId
              ? WEAPONS[weaponId].accentHex
              : 0xf59e0b;

  const ringMat = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 18), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);

  const boxMat = new THREE.MeshStandardMaterial({
    color: kind === 'crate' ? 0x1e3a8a : 0x1e293b,
    roughness: 0.35,
    metalness: 0.55,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 0.85,
    roughness: 0.25,
  });

  if (kind === 'crate') {
    const chest = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.75, 0.85), boxMat);
    chest.position.y = 0.42;
    chest.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.2, 0.92), accentMat);
    lid.position.y = 0.85;
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8, 6), ringMat);
    beacon.position.y = 4.5;
    g.add(chest, lid, beacon);
  } else if (kind === 'weapon' && weaponId) {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.14, 10), boxMat);
    ped.position.y = 0.07;
    const gun = createWeaponMesh(weaponId);
    gun.position.set(0, 0.52, -0.2);
    gun.rotation.y = Math.PI / 4;
    gun.scale.setScalar(1.25);
    g.add(ped, gun);
  } else {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.36, 0.42), boxMat);
    pack.position.y = 0.45;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.46), accentMat);
    cross.position.y = 0.45;
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.46), accentMat);
    crossV.position.y = 0.45;
    g.add(pack, cross, crossV);
  }

  return g;
}
