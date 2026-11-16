import * as THREE from 'three';
import { groundHeightAt, ISLAND_RADIUS, WATER_LEVEL } from './rules';
import { createBuildingGroup, BuildingKind } from './models';
import { ProceduralTextureSet } from './textures';

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
}

export interface WorldEnvironment {
  group: THREE.Group;
  colliders: BoxCollider[];
  raycastTargets: THREE.Object3D[];
  waterMaterial: THREE.MeshStandardMaterial;
  waterUniforms: { uTime: { value: number } };
  lootSpawnPoints: Array<{ x: number; z: number; highTier: boolean }>;
  dispose: () => void;
}

export function buildOpenWorldIsland(textures: ProceduralTextureSet): WorldEnvironment {
  const group = new THREE.Group();
  const colliders: BoxCollider[] = [];
  const raycastTargets: THREE.Object3D[] = [];
  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const materialsToDispose: THREE.Material[] = [];

  // 1. Sculpted Multi-Biome Island Terrain
  const terrainSize = (ISLAND_RADIUS + 55) * 2;
  const segs = 128;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const pos = terrainGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cSand = new THREE.Color(0xc2b280);
  const cGrass = new THREE.Color(0x3f6b3a);
  const cDarkGrass = new THREE.Color(0x2a4d2c);
  const cRock = new THREE.Color(0x595f69);
  const cAsphalt = new THREE.Color(0x414854);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeightAt(x, z);
    pos.setY(i, y);

    const cityD = Math.hypot(x - 42, z - 44);
    const milD = Math.hypot(x + 56, z - 6);

    if (y < 0.28) {
      tmpColor.copy(cSand);
    } else if (cityD < 29 || milD < 27) {
      tmpColor.copy(cAsphalt);
    } else if (y > 7.2) {
      tmpColor.lerpColors(cDarkGrass, cRock, Math.min(1, (y - 7.2) / 5.5));
    } else {
      const noise = Math.sin(x * 0.14) * Math.cos(z * 0.14) * 0.5 + 0.5;
      tmpColor.lerpColors(cDarkGrass, cGrass, noise);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();
  geometriesToDispose.push(terrainGeo);

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    bumpMap: textures.terrainBump,
    bumpScale: 0.18,
    roughness: 0.88,
    metalness: 0.04,
  });
  materialsToDispose.push(terrainMat);

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);
  raycastTargets.push(terrainMesh);

  // 2. Reflective Animated Ocean & Lake Water
  const waterUniforms = { uTime: { value: 0 } };
  const waterGeo = new THREE.PlaneGeometry(520, 520, 48, 48);
  waterGeo.rotateX(-Math.PI / 2);
  geometriesToDispose.push(waterGeo);

  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x0e4f73,
    roughness: 0.14,
    metalness: 0.72,
    envMapIntensity: 1.35,
    transparent: true,
    opacity: 0.9,
  });
  waterMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.y += sin(transformed.x * 0.18 + uTime * 1.9) * 0.08 + cos(transformed.z * 0.22 + uTime * 1.5) * 0.08;`
      );
  };
  materialsToDispose.push(waterMaterial);

  const waterMesh = new THREE.Mesh(waterGeo, waterMaterial);
  waterMesh.position.y = WATER_LEVEL;
  waterMesh.receiveShadow = true;
  group.add(waterMesh);

  // 3. Central Lake Bridge Causeway (X=0, Z from -30 to +8)
  const bridgeGroup = new THREE.Group();
  const bridgeConcrete = new THREE.MeshStandardMaterial({
    map: textures.concreteColor,
    color: 0xffffff,
    roughness: 0.8,
  });
  const bridgeRailMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.6,
  });
  materialsToDispose.push(bridgeConcrete, bridgeRailMat);

  const deckGeo = new THREE.BoxGeometry(7.2, 0.5, 38);
  const deck = new THREE.Mesh(deckGeo, bridgeConcrete);
  deck.position.set(0, 1.0, -11);
  deck.receiveShadow = true;
  deck.castShadow = true;
  bridgeGroup.add(deck);
  geometriesToDispose.push(deckGeo);

  // Side guardrails (low enough to shoot over, blocks lateral falls)
  const railGeo = new THREE.BoxGeometry(0.35, 1.05, 38);
  geometriesToDispose.push(railGeo);
  [-3.4, 3.4].forEach((rx) => {
    const rail = new THREE.Mesh(railGeo, bridgeRailMat);
    rail.position.set(rx, 1.75, -11);
    rail.castShadow = true;
    bridgeGroup.add(rail);
  });

  // Bridge support piers seated into lakebed
  const pierGeo = new THREE.BoxGeometry(1.4, 4.2, 1.6);
  geometriesToDispose.push(pierGeo);
  [-22, -11, 0].forEach((pz) => {
    [-2.4, 2.4].forEach((px) => {
      const pier = new THREE.Mesh(pierGeo, bridgeConcrete);
      pier.position.set(px, -1.1, pz);
      bridgeGroup.add(pier);
    });
  });
  group.add(bridgeGroup);
  raycastTargets.push(deck);

  // 4. Landmark Buildings across Island Biomes
  const placements: Array<{
    kind: BuildingKind;
    x: number;
    z: number;
    rotY: number;
  }> = [
    // Modern City (South-East)
    { kind: 'apartment', x: 34, z: 32, rotY: 0 },
    { kind: 'apartment', x: 54, z: 34, rotY: Math.PI / 2 },
    { kind: 'apartment', x: 36, z: 56, rotY: Math.PI },
    { kind: 'warehouse', x: 56, z: 54, rotY: -Math.PI / 2 },

    // Military Airbase (West)
    { kind: 'militaryHangar', x: -56, z: -4, rotY: 0 },
    { kind: 'militaryHangar', x: -56, z: 20, rotY: Math.PI },
    { kind: 'watchtower', x: -34, z: 6, rotY: 0 },
    { kind: 'warehouse', x: -76, z: 8, rotY: Math.PI / 2 },

    // Gothic Midnight Citadel (North-East)
    { kind: 'ruinTower', x: 46, z: -48, rotY: -0.35 },
    { kind: 'watchtower', x: 26, z: -44, rotY: 0.4 },

    // Riverside Village & Overlook (South-West & North-West)
    { kind: 'villageHouse', x: -26, z: 48, rotY: 0.4 },
    { kind: 'villageHouse', x: -42, z: 58, rotY: -0.6 },
    { kind: 'villageHouse', x: -12, z: 68, rotY: 0.1 },
    { kind: 'warehouse', x: -28, z: -46, rotY: 0.25 },
    { kind: 'ruinTower', x: 4, z: -84, rotY: 0 },
  ];

  const lootSpawnPoints: Array<{ x: number; z: number; highTier: boolean }> = [
    // Spawn plaza starter loot
    { x: -6, z: 34, highTier: false },
    { x: 6, z: 34, highTier: false },
    { x: 0, z: 25, highTier: false },
    // Bridge & Island hotspots
    { x: 0, z: -11, highTier: true },
    { x: 42, z: 44, highTier: true },
    { x: -56, z: 8, highTier: true },
    { x: 46, z: -36, highTier: true },
    { x: 4, z: -72, highTier: true },
  ];

  for (const p of placements) {
    const built = createBuildingGroup(p.kind, textures);
    const groundY = groundHeightAt(p.x, p.z);
    built.group.position.set(p.x, groundY - 0.15, p.z);
    built.group.rotation.y = p.rotY;
    group.add(built.group);
    raycastTargets.push(built.group);

    // Axis-aligned collision approximation rotated cleanly
    const cos = Math.abs(Math.cos(p.rotY));
    const sin = Math.abs(Math.sin(p.rotY));
    const hw = built.colliderHalfW * cos + built.colliderHalfD * sin;
    const hd = built.colliderHalfW * sin + built.colliderHalfD * cos;

    colliders.push({
      minX: p.x - hw,
      maxX: p.x + hw,
      minZ: p.z - hd,
      maxZ: p.z + hd,
      maxY: groundY + built.colliderHeight,
    });

    // Place loot near building entrance
    lootSpawnPoints.push({
      x: p.x + Math.sin(p.rotY) * (hd + 2.2),
      z: p.z + Math.cos(p.rotY) * (hd + 2.2),
      highTier: p.kind === 'militaryHangar' || p.kind === 'ruinTower',
    });
  }

  // 5. Instanced Forests (Trunks + Foliage Crowns with ±15% scale & tint variation)
  const treePositions: Array<{ x: number; z: number; scale: number; rot: number }> = [];
  let seed = 1337;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 180; i++) {
    const angle = nextRand() * Math.PI * 2;
    const radius = 18 + nextRand() * (ISLAND_RADIUS - 26);
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    const ty = groundHeightAt(tx, tz);

    // Avoid water, bridge, city pad, military pad, spawn plaza, or building footprints
    if (ty < 0.35 || ty > 12) continue;
    if (Math.hypot(tx, tz - 38) < 15) continue;
    if (Math.hypot(tx - 42, tz - 44) < 30) continue;
    if (Math.hypot(tx + 56, tz - 6) < 29) continue;
    if (Math.abs(tx) < 8 && tz > -35 && tz < 14) continue;
    if (colliders.some((c) => tx > c.minX - 3 && tx < c.maxX + 3 && tz > c.minZ - 3 && tz < c.maxZ + 3)) {
      continue;
    }

    treePositions.push({
      x: tx,
      z: tz,
      scale: 0.85 + nextRand() * 0.35,
      rot: nextRand() * Math.PI * 2,
    });
  }

  if (treePositions.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 2.8, 7);
    trunkGeo.translate(0, 1.4, 0);
    const crownLowGeo = new THREE.ConeGeometry(1.85, 3.6, 8);
    crownLowGeo.translate(0, 3.8, 0);
    const crownTopGeo = new THREE.ConeGeometry(1.3, 2.8, 8);
    crownTopGeo.translate(0, 5.4, 0);
    geometriesToDispose.push(trunkGeo, crownLowGeo, crownTopGeo);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.92 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 });
    materialsToDispose.push(trunkMat, leafMat);

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    const crownsLow = new THREE.InstancedMesh(crownLowGeo, leafMat, treePositions.length);
    const crownsTop = new THREE.InstancedMesh(crownTopGeo, leafMat, treePositions.length);
    trunks.castShadow = true;
    crownsLow.castShadow = true;
    crownsTop.castShadow = true;

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    treePositions.forEach((tp, idx) => {
      const ty = groundHeightAt(tp.x, tp.z);
      dummy.position.set(tp.x, ty - 0.1, tp.z);
      dummy.rotation.set(0, tp.rot, 0);
      dummy.scale.setScalar(tp.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(idx, dummy.matrix);
      crownsLow.setMatrixAt(idx, dummy.matrix);
      crownsTop.setMatrixAt(idx, dummy.matrix);

      const gTint = 0.72 + nextRand() * 0.28;
      tint.setRGB(0.18 * gTint, 0.44 * gTint, 0.2 * gTint);
      crownsLow.setColorAt(idx, tint);
      tint.multiplyScalar(1.12);
      crownsTop.setColorAt(idx, tint);

      colliders.push({
        minX: tp.x - 0.55,
        maxX: tp.x + 0.55,
        minZ: tp.z - 0.55,
        maxZ: tp.z + 0.55,
        maxY: ty + 4.5,
      });
    });

    trunks.instanceMatrix.needsUpdate = true;
    crownsLow.instanceMatrix.needsUpdate = true;
    crownsTop.instanceMatrix.needsUpdate = true;
    if (crownsLow.instanceColor) crownsLow.instanceColor.needsUpdate = true;
    if (crownsTop.instanceColor) crownsTop.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    crownsLow.computeBoundingSphere();
    crownsTop.computeBoundingSphere();

    group.add(trunks, crownsLow, crownsTop);
  }

  // 6. Instanced Rock Outcrops (Coastal & Mountain Cover)
  const rockPositions: Array<{ x: number; z: number; sx: number; sy: number; sz: number; rot: number }> = [];
  for (let i = 0; i < 95; i++) {
    const angle = nextRand() * Math.PI * 2;
    const radius = 22 + nextRand() * (ISLAND_RADIUS - 12);
    const rx = Math.cos(angle) * radius;
    const rz = Math.sin(angle) * radius;
    const ry = groundHeightAt(rx, rz);
    if (ry < -0.2) continue;
    if (Math.hypot(rx, rz - 38) < 12) continue;
    if (Math.abs(rx) < 6 && rz > -32 && rz < 10) continue;
    if (colliders.some((c) => rx > c.minX - 2 && rx < c.maxX + 2 && rz > c.minZ - 2 && rz < c.maxZ + 2)) {
      continue;
    }
    rockPositions.push({
      x: rx,
      z: rz,
      sx: 1.0 + nextRand() * 1.4,
      sy: 0.7 + nextRand() * 1.1,
      sz: 1.0 + nextRand() * 1.4,
      rot: nextRand() * Math.PI * 2,
    });
  }

  if (rockPositions.length > 0) {
    const rockGeo = new THREE.DodecahedronGeometry(1.15, 0);
    rockGeo.translate(0, 0.55, 0);
    geometriesToDispose.push(rockGeo);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.08,
      flatShading: true,
    });
    materialsToDispose.push(rockMat);

    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockPositions.length);
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const rTint = new THREE.Color();

    rockPositions.forEach((rp, idx) => {
      const ry = groundHeightAt(rp.x, rp.z);
      dummy.position.set(rp.x, ry - 0.15, rp.z);
      dummy.rotation.set(nextRand() * 0.25, rp.rot, nextRand() * 0.25);
      dummy.scale.set(rp.sx, rp.sy, rp.sz);
      dummy.updateMatrix();
      rocks.setMatrixAt(idx, dummy.matrix);

      const shade = 0.34 + nextRand() * 0.16;
      rTint.setRGB(shade, shade + 0.02, shade + 0.05);
      rocks.setColorAt(idx, rTint);

      colliders.push({
        minX: rp.x - rp.sx * 0.85,
        maxX: rp.x + rp.sx * 0.85,
        minZ: rp.z - rp.sz * 0.85,
        maxZ: rp.z + rp.sz * 0.85,
        maxY: ry + rp.sy * 1.4,
      });
    });

    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    rocks.computeBoundingSphere();
    group.add(rocks);
    raycastTargets.push(rocks);
  }

  return {
    group,
    colliders,
    raycastTargets,
    waterMaterial,
    waterUniforms,
    lootSpawnPoints,
    dispose: () => {
      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
    },
  };
}
