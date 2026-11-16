import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  animateCharacterRig,
  CharacterRig,
  createCharacterRig,
  createLootPickupGroup,
  setRigWeapon,
} from './models';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import { BoxCollider, buildOpenWorldIsland, WorldEnvironment } from './world';
import {
  applyDamage,
  calculateMatchScore,
  createInitialSafeZone,
  createWeaponSlot,
  decideBotAction,
  groundHeightAt,
  ISLAND_RADIUS,
  isInsideSafeZone,
  reloadWeaponSlot,
  SafeZoneState,
  stepSafeZone,
  WATER_LEVEL,
} from './rules';
import {
  BotArchetype,
  CHARACTERS,
  CharacterPreset,
  EnvironmentPreset,
  GAME_MODES,
  GameModeId,
  GameScreenState,
  GameSettings,
  HudSnapshot,
  KillFeedItem,
  MatchResult,
  MinimapActor,
  OUTFITS,
  OutfitPreset,
  WEAPONS,
  WeaponId,
  WeaponSlotState,
} from './types';
import { audioEngine } from './audio';

// Module-scope reusable math helpers (Zero GC in render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

interface BotEntity {
  id: number;
  name: string;
  isAlly: boolean;
  archetype: BotArchetype;
  weaponId: WeaponId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  shield: number;
  alive: boolean;
  koTimer: number;
  fireCooldown: number;
  telegraphTimer: number;
  hasAttackToken: boolean;
  strafeSign: number;
  strafeTimer: number;
  characterIdx: number;
  outfitIdx: number;
  rigIndex: number; // -1 if currently culled / off-stage
}

interface LootEntity {
  id: string;
  kind: 'weapon' | 'medkit' | 'shield' | 'ammo' | 'crate';
  weaponId?: WeaponId;
  label: string;
  x: number;
  y: number;
  z: number;
  collected: boolean;
  respawnTimer: number;
  mesh: THREE.Group;
}

interface Projectile {
  active: boolean;
  ownerId: number; // -1 = player, >=0 = bot id
  ownerName: string;
  ownerIsAlly: boolean;
  weaponId: WeaponId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  life: number;
}

interface Grenade {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  mesh: THREE.Mesh;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

const BOT_CALLSIGNS = [
  'Kestrel', 'Ronin', 'Vortex', 'Blaze', 'Kobra', 'Havoc', 'Reaper', 'Shadow',
  'Maverick', 'Talon', 'Nyx', 'Cipher', 'Drifter', 'Jinx', 'Sable', 'Riptide',
  'TitanX', 'Apex99', 'Vector', 'Banshee', 'Nomad', 'Striker', 'Cinder', 'Fury',
  'Phantom', 'Blitz', 'Delta7', 'Onyx', 'Raider', 'Falcon', 'Echo', 'Zeus',
  'Wraith', 'Pulse', 'Kodiak', 'Aegis', 'Scorpion', 'Lynx', 'Viper', 'Frost',
  'Razor', 'Nova', 'Rogue', 'Dagger', 'Hydra', 'Zero', 'Bolt', 'Tempest', 'Grim',
];

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onMatchEnd: (result: MatchResult) => void;
  onMinimapBackgroundReady: (canvas: HTMLCanvasElement) => void;
}

export class VorqenGameEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private textures: ProceduralTextureSet;
  private world: WorldEnvironment;

  private frameId = 0;
  private destroyed = false;
  private lastTime = 0;
  private elapsed = 0;

  private screenState: GameScreenState = 'title';
  private settings: GameSettings;
  private selectedCharacter: CharacterPreset = CHARACTERS[0];
  private selectedOutfit: OutfitPreset = OUTFITS[0];
  private selectedMode: GameModeId = 'solo';

  // Showcase / Player Rig
  private playerRig: CharacterRig;
  private showcaseYaw = -0.35;
  private lobbyDragActive = false;
  private lobbyLastX = 0;

  // Pooled Bot Rigs (max 16 rendered simultaneously for 60fps mobile/WebGL perf)
  private botRigPool: Array<{ rig: CharacterRig; assignedBotId: number }> = [];
  private telegraphBeam: THREE.Line;

  // Safe Zone Visual Barrier
  private safeZoneMesh: THREE.Mesh;
  private safeZoneState: SafeZoneState = createInitialSafeZone();

  // Simulation State
  private phase: 'parachute' | 'combat' = 'combat';
  private playerX = 0;
  private playerY = 0.55;
  private playerZ = 38;
  private playerVx = 0;
  private playerVy = 0;
  private playerVz = 0;
  private playerYaw = 0; // 0 faces -Z (North toward bridge & mountains)
  private cameraPitch = 0.22;
  private isGrounded = true;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private isCrouching = false;
  private isSprinting = false;
  private isAds = false;
  private hp = 100;
  private maxHp = 100;
  private shield = 50;
  private maxShield = 100;
  private stamina = 100;

  private activeSlot: 0 | 1 = 0;
  private slots: [WeaponSlotState, WeaponSlotState | null] = [
    createWeaponSlot('carbine', 4),
    createWeaponSlot('scatter', 3),
  ];
  private medkits = 2;
  private shieldCells = 2;
  private fragCores = 2;
  private fireCooldown = 0;
  private reloadTimer = 0;
  private isReloading = false;
  private footstepTimer = 0;

  private bots: BotEntity[] = [];
  private loots: LootEntity[] = [];
  private projectiles: Projectile[] = [];
  private projectileMesh: THREE.InstancedMesh;
  private grenades: Grenade[] = [];
  private particles: Particle[] = [];
  private particleMesh: THREE.InstancedMesh;
  private particleCursor = 0;

  private weatherMesh: THREE.InstancedMesh;
  private weatherPositions: Float32Array;

  private matchTime = 0;
  private eliminations = 0;
  private damageDealt = 0;
  private bestScore = 0;
  private hitstopTimer = 0;
  private cameraTrauma = 0;
  private hitMarkerTimer = 0;
  private damageFlashTimer = 0;
  private killFeed: KillFeedItem[] = [];
  private killFeedCounter = 1;
  private hudEmitAccum = 0;
  private skirmishAccum = 0;

  // Input State (Edge-triggered + Held)
  private keysHeld = new Set<string>();
  private fireHeld = false;
  private joystickX = 0;
  private joystickY = 0;
  private gyroEnabled = false;
  private lastGyroBeta: number | null = null;
  private lastGyroGamma: number | null = null;

  // Camera Smoothing
  private camPos = new THREE.Vector3(0, 4, 46);
  private camLook = new THREE.Vector3(0, 2, 30);
  private camRaycaster = new THREE.Raycaster();

  constructor(
    container: HTMLElement,
    initialSettings: GameSettings,
    callbacks: EngineCallbacks
  ) {
    this.container = container;
    this.settings = initialSettings;
    this.callbacks = callbacks;

    try {
      const savedBest = localStorage.getItem('vorqen_best_score');
      if (savedBest) this.bestScore = Number(savedBest) || 0;
    } catch {
      // ignore storage failure
    }

    // 1. Software WebGL probe (only scales rendering cost, never scene content)
    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyGraphicsSettings(initialSettings.graphics);

    const w = Math.max(320, container.clientWidth || window.innerWidth);
    const h = Math.max(240, container.clientHeight || window.innerHeight);
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    // 3. Scene & Studio RoomEnvironment Map (IBL for metallic armor & water)
    this.scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 4. Camera
    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.25, 420);

    // 5. Warm Key Light + Cool Hemisphere Fill
    this.hemiLight = new THREE.HemisphereLight(0x8ec5ff, 0x3a2e25, 0.78);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xffeedd, 2.0);
    this.keyLight.position.set(45, 75, 40);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 5;
    this.keyLight.shadow.camera.far = 190;
    const d = 55;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    // 6. Procedural Textures & Open-World Island
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.callbacks.onMinimapBackgroundReady(this.textures.minimapCanvas);

    this.world = buildOpenWorldIsland(this.textures);
    this.scene.add(this.world.group);

    // 7. Safe Zone Holographic Cylinder
    const zoneGeo = new THREE.CylinderGeometry(1, 1, 70, 48, 1, true);
    const zoneMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.safeZoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    this.safeZoneMesh.position.y = 25;
    this.scene.add(this.safeZoneMesh);

    // 8. Player Rig
    this.playerRig = createCharacterRig(
      this.selectedCharacter,
      this.selectedOutfit,
      'carbine',
      this.textures.contactShadow
    );
    this.scene.add(this.playerRig.root);

    // 9. Pooled Bot Rigs (16)
    for (let i = 0; i < 16; i++) {
      const rig = createCharacterRig(
        CHARACTERS[i % CHARACTERS.length],
        OUTFITS[(i + 1) % OUTFITS.length],
        'carbine',
        this.textures.contactShadow
      );
      rig.root.visible = false;
      this.scene.add(rig.root);
      this.botRigPool.push({ rig, assignedBotId: -1 });
    }

    // Telegraph laser sight line
    const beamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ]);
    const beamMat = new THREE.LineBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.85,
    });
    this.telegraphBeam = new THREE.Line(beamGeo, beamMat);
    this.telegraphBeam.visible = false;
    this.scene.add(this.telegraphBeam);

    // 10. Pooled Projectiles (InstancedMesh)
    const projGeo = new THREE.BoxGeometry(0.14, 0.14, 1.3);
    const projMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.projectileMesh = new THREE.InstancedMesh(projGeo, projMat, 64);
    this.projectileMesh.frustumCulled = false;
    this.scene.add(this.projectileMesh);
    for (let i = 0; i < 64; i++) {
      this.projectiles.push({
        active: false,
        ownerId: -1,
        ownerName: '',
        ownerIsAlly: false,
        weaponId: 'carbine',
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        damage: 20,
        life: 0,
      });
      _mat4.makeTranslation(0, -999, 0);
      this.projectileMesh.setMatrixAt(i, _mat4);
      this.projectileMesh.setColorAt(i, _color.setHex(0xf59e0b));
    }

    // 11. Pooled Grenades
    const grenGeo = new THREE.SphereGeometry(0.24, 10, 10);
    const grenMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.9,
      roughness: 0.3,
    });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(grenGeo, grenMat);
      m.visible = false;
      this.scene.add(m);
      this.grenades.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        fuse: 0,
        mesh: m,
      });
    }

    // 12. Pooled Particle Burst Ring Buffer (InstancedMesh)
    const partGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    const partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(partGeo, partMat, 180);
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    for (let i = 0; i < 180; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        size: 1,
        r: 1,
        g: 0.7,
        b: 0.2,
      });
      _mat4.makeTranslation(0, -999, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0xf59e0b));
    }

    // 13. Atmospheric Weather Particles (80 floating motes / midnight rain)
    const wGeo = new THREE.BoxGeometry(0.06, 0.45, 0.06);
    const wMat = new THREE.MeshBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.45,
    });
    this.weatherMesh = new THREE.InstancedMesh(wGeo, wMat, 80);
    this.weatherMesh.frustumCulled = false;
    this.weatherPositions = new Float32Array(80 * 3);
    for (let i = 0; i < 80; i++) {
      this.weatherPositions[i * 3] = (Math.random() - 0.5) * 70;
      this.weatherPositions[i * 3 + 1] = Math.random() * 24;
      this.weatherPositions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    this.scene.add(this.weatherMesh);

    this.applyEnvironmentPreset(initialSettings.environment);
    this.setupLootPickups();
    this.resetLobbyShowcase();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindInputListeners();
    this.lastTime = performance.now();
    this.tick();
  }

  private applyGraphicsSettings(quality: GameSettings['graphics']) {
    const cap =
      quality === 'low'
        ? 0.85
        : quality === 'medium'
          ? 1.15
          : quality === 'high'
            ? 1.5
            : 2.0;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, cap)
    );
    if (this.keyLight) {
      this.keyLight.castShadow = !this.isSoftwareGl && quality !== 'low';
    }
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && quality !== 'low';
  }

  private applyEnvironmentPreset(env: EnvironmentPreset) {
    if (env === 'day') {
      this.scene.background = new THREE.Color(0x6eb5e5);
      this.scene.fog = new THREE.FogExp2(0x7ac0eb, 0.0052);
      this.keyLight.color.setHex(0xfff1d6);
      this.keyLight.intensity = 2.15;
      this.keyLight.position.set(50, 82, 35);
      this.hemiLight.color.setHex(0x9bd4ff);
      this.hemiLight.groundColor.setHex(0x433b2c);
      this.hemiLight.intensity = 0.85;
      this.world.waterMaterial.color.setHex(0x0c597e);
    } else if (env === 'sunset') {
      this.scene.background = new THREE.Color(0xd96b38);
      this.scene.fog = new THREE.FogExp2(0xc45c3c, 0.0064);
      this.keyLight.color.setHex(0xffa952);
      this.keyLight.intensity = 2.35;
      this.keyLight.position.set(-70, 38, -45);
      this.hemiLight.color.setHex(0x5274b8);
      this.hemiLight.groundColor.setHex(0x3a1d20);
      this.hemiLight.intensity = 0.78;
      this.world.waterMaterial.color.setHex(0x164266);
    } else {
      // 'midnight' (Midnight Hunters atmospheric moonlit arena)
      this.scene.background = new THREE.Color(0x0d1526);
      this.scene.fog = new THREE.FogExp2(0x111a2e, 0.0082);
      this.keyLight.color.setHex(0x9cb8ff);
      this.keyLight.intensity = 1.45;
      this.keyLight.position.set(40, 68, -50);
      this.hemiLight.color.setHex(0x48629c);
      this.hemiLight.groundColor.setHex(0x1b1520);
      this.hemiLight.intensity = 0.75;
      this.world.waterMaterial.color.setHex(0x09243d);
    }
  }

  public updateSettings(next: GameSettings) {
    this.settings = next;
    this.gyroEnabled = next.controls.gyroEnabled;
    audioEngine.setMuted(next.muted);
    this.applyGraphicsSettings(next.graphics);
    this.applyEnvironmentPreset(next.environment);
  }

  public setCustomization(charId: string, outfitId: string, mode: GameModeId) {
    const ch = CHARACTERS.find((c) => c.id === charId) || CHARACTERS[0];
    const of = OUTFITS.find((o) => o.id === outfitId) || OUTFITS[0];
    this.selectedCharacter = ch;
    this.selectedOutfit = of;
    this.selectedMode = mode;
    this.rebuildPlayerRig();
  }

  private rebuildPlayerRig() {
    const currentWeapon = this.slots[this.activeSlot]?.weaponId || 'carbine';
    this.scene.remove(this.playerRig.root);
    this.playerRig = createCharacterRig(
      this.selectedCharacter,
      this.selectedOutfit,
      currentWeapon,
      this.textures.contactShadow
    );
    this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.scene.add(this.playerRig.root);
  }

  private setupLootPickups() {
    this.loots.forEach((l) => this.scene.remove(l.mesh));
    this.loots = [];

    const weaponPool: WeaponId[] = ['carbine', 'smg', 'railgun', 'scatter'];
    this.world.lootSpawnPoints.forEach((pt, idx) => {
      const y = groundHeightAt(pt.x, pt.z);
      let kind: LootEntity['kind'] = 'ammo';
      let weaponId: WeaponId | undefined;
      let label = 'Energy Ammo Pack';

      if (pt.highTier && idx % 3 === 0) {
        kind = 'crate';
        weaponId = weaponPool[idx % weaponPool.length];
        label = `Apex Drop (${WEAPONS[weaponId].name})`;
      } else if (idx % 4 === 0) {
        kind = 'weapon';
        weaponId = weaponPool[(idx + 1) % weaponPool.length];
        label = `${WEAPONS[weaponId].name} (${WEAPONS[weaponId].code})`;
      } else if (idx % 4 === 1) {
        kind = 'medkit';
        label = 'Tactical Medkit (+60 HP)';
      } else if (idx % 4 === 2) {
        kind = 'shield';
        label = 'Shield Cell (+50 Shield)';
      }

      const mesh = createLootPickupGroup(kind, weaponId);
      mesh.position.set(pt.x, y, pt.z);
      this.scene.add(mesh);

      this.loots.push({
        id: `loot-${idx}`,
        kind,
        weaponId,
        label,
        x: pt.x,
        y,
        z: pt.z,
        collected: false,
        respawnTimer: 0,
        mesh,
      });
    });
  }

  private resetLobbyShowcase() {
    this.screenState = 'title';
    this.showcaseYaw = -0.35;
    this.playerX = 0;
    this.playerZ = 38;
    this.playerY = groundHeightAt(0, 38);
    this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.root.rotation.y = this.showcaseYaw;
    this.playerRig.root.visible = true;
    this.safeZoneMesh.visible = false;
    this.telegraphBeam.visible = false;
    this.botRigPool.forEach((p) => {
      p.rig.root.visible = false;
      p.assignedBotId = -1;
    });
  }

  public setScreenState(state: GameScreenState) {
    this.screenState = state;
    if (state === 'title') {
      this.resetLobbyShowcase();
    } else if (state === 'paused') {
      this.clearHeldInputs();
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
  }

  public startMatch() {
    this.clearHeldInputs();
    this.screenState = 'playing';
    this.matchTime = 0;
    this.eliminations = 0;
    this.damageDealt = 0;
    this.hitstopTimer = 0;
    this.cameraTrauma = 0;
    this.hitMarkerTimer = 0;
    this.damageFlashTimer = 0;
    this.killFeed = [];
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.isReloading = false;

    const modeCfg = GAME_MODES.find((m) => m.id === this.selectedMode) || GAME_MODES[0];

    // Player stats & starter loadout
    this.maxHp = 100;
    this.hp = 100;
    this.maxShield = this.selectedCharacter.maxShield;
    this.shield = 50;
    this.stamina = 100;
    this.isCrouching = false;
    this.isSprinting = false;

    this.activeSlot = 0;
    this.slots = [createWeaponSlot('carbine', 4), createWeaponSlot('smg', 3)];
    this.medkits = 2;
    this.shieldCells = 2;
    this.fragCores = 2;
    setRigWeapon(this.playerRig, 'carbine');

    // Spawn player at clear south plaza facing North (-Z) toward Central Bridge & Mountain Peak
    this.playerX = 0;
    this.playerZ = 38;
    const groundY = groundHeightAt(this.playerX, this.playerZ);
    const isTraining = this.selectedMode === 'training';
    this.phase = isTraining ? 'combat' : 'parachute';
    this.playerY = isTraining ? groundY : groundY + 13;
    this.playerVx = 0;
    this.playerVy = 0;
    this.playerVz = 0;
    this.playerYaw = 0;
    this.cameraPitch = isTraining ? 0.16 : 0.34;
    this.isGrounded = isTraining;

    // Reset camera immediately behind player facing North
    this.camPos.set(this.playerX + 1.2, this.playerY + 3.4, this.playerZ + 6.5);
    this.camLook.set(this.playerX, this.playerY + 0.5, this.playerZ - 14);

    this.safeZoneState = createInitialSafeZone();
    this.safeZoneMesh.visible = !isTraining;

    // Reset loot
    for (const l of this.loots) {
      l.collected = false;
      l.respawnTimer = 0;
      l.mesh.visible = true;
    }

    // Spawn Combatants (up to 50 total)
    this.bots = [];
    const archetypes: BotArchetype[] = ['rusher', 'flanker', 'marksman'];
    const weaponChoices: WeaponId[] = ['carbine', 'smg', 'railgun', 'scatter'];
    const botCount = modeCfg.combatants - 1;

    for (let i = 0; i < botCount; i++) {
      const isAlly = i < modeCfg.allies;
      let bx = 0;
      let bz = 0;

      if (isAlly) {
        bx = (i - 1) * 4.5 + 3;
        bz = 40;
      } else if (isTraining) {
        const angle = (i / botCount) * Math.PI * 1.4 - Math.PI * 0.7;
        const dist = 22 + (i % 3) * 12;
        bx = Math.sin(angle) * dist;
        bz = 38 - Math.cos(angle) * dist;
      } else {
        // Spread enemies across island biomes, keeping initial 22m around spawn safe for landing
        const angle = ((i * 137.5) % 360) * (Math.PI / 180);
        const dist = 26 + ((i * 19) % 88);
        bx = Math.cos(angle) * dist;
        bz = Math.sin(angle) * dist;
        if (Math.hypot(bx - this.playerX, bz - this.playerZ) < 24) {
          bz -= 28;
        }
      }

      const by = Math.max(WATER_LEVEL + 0.3, groundHeightAt(bx, bz));
      this.bots.push({
        id: i,
        name: isAlly ? `Squad-${i + 1}` : BOT_CALLSIGNS[i % BOT_CALLSIGNS.length],
        isAlly,
        archetype: archetypes[i % archetypes.length],
        weaponId: weaponChoices[(i + 1) % weaponChoices.length],
        x: bx,
        y: by,
        z: bz,
        vx: 0,
        vz: 0,
        yaw: Math.random() * Math.PI * 2,
        hp: 100,
        maxHp: 100,
        shield: isTraining ? 25 : 40,
        alive: true,
        koTimer: 0,
        fireCooldown: 1.0 + Math.random() * 1.5,
        telegraphTimer: 0,
        hasAttackToken: false,
        strafeSign: i % 2 === 0 ? 1 : -1,
        strafeTimer: 1.5 + Math.random() * 2,
        characterIdx: i % CHARACTERS.length,
        outfitIdx: (i + 1) % OUTFITS.length,
        rigIndex: -1,
      });
    }

    // Clear active projectiles & grenades
    this.projectiles.forEach((p) => (p.active = false));
    this.grenades.forEach((g) => {
      g.active = false;
      g.mesh.visible = false;
    });

    this.emitHudSnapshot();
  }

  public clearHeldInputs() {
    this.keysHeld.clear();
    this.fireHeld = false;
    this.joystickX = 0;
    this.joystickY = 0;
  }

  // Mobile / HUD action triggers
  public setVirtualJoystick(x: number, y: number) {
    this.joystickX = THREE.MathUtils.clamp(x, -1, 1);
    this.joystickY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public setTouchFire(held: boolean) {
    this.fireHeld = held;
  }

  public addCameraDelta(dx: number, dy: number) {
    if (this.screenState === 'title') {
      this.showcaseYaw += dx * 0.01;
      return;
    }
    if (this.screenState !== 'playing') return;
    const sens = 0.0038 * this.settings.controls.touchSensitivity;
    this.playerYaw -= dx * sens;
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dy * sens, -0.45, 0.85);
  }

  public triggerJump() {
    this.jumpBufferTimer = 0.14;
  }

  public toggleCrouch() {
    this.isCrouching = !this.isCrouching;
    if (this.isCrouching) this.isSprinting = false;
    audioEngine.playUiClick(420);
  }

  public toggleSprint() {
    this.isSprinting = !this.isSprinting;
    if (this.isSprinting) this.isCrouching = false;
    audioEngine.playUiClick(560);
  }

  public toggleAds() {
    this.isAds = !this.isAds;
    audioEngine.playUiClick(700);
  }

  public switchWeaponSlot(slotIdx: 0 | 1) {
    if (!this.slots[slotIdx] || this.activeSlot === slotIdx) return;
    this.activeSlot = slotIdx;
    this.isReloading = false;
    this.reloadTimer = 0;
    setRigWeapon(this.playerRig, this.slots[slotIdx]!.weaponId);
    audioEngine.playUiClick(520);
    this.emitHudSnapshot();
  }

  public triggerReload() {
    const slot = this.slots[this.activeSlot];
    if (!slot || this.isReloading) return;
    const cfg = WEAPONS[slot.weaponId];
    if (slot.ammoInMag >= cfg.magSize || slot.reserveAmmo <= 0) return;
    this.isReloading = true;
    this.reloadTimer = cfg.reloadTime;
    audioEngine.playUiClick(340);
  }

  public useMedkit() {
    if (this.medkits <= 0 || this.hp >= this.maxHp) return;
    this.medkits -= 1;
    this.hp = Math.min(this.maxHp, this.hp + 60);
    audioEngine.playPickup();
    this.emitHudSnapshot();
  }

  public useShieldCell() {
    if (this.shieldCells <= 0 || this.shield >= this.maxShield) return;
    this.shieldCells -= 1;
    this.shield = Math.min(this.maxShield, this.shield + 50);
    audioEngine.playPickup();
    this.emitHudSnapshot();
  }

  public throwGrenade() {
    if (this.fragCores <= 0 || this.screenState !== 'playing' || this.phase === 'parachute') return;
    const g = this.grenades.find((item) => !item.active);
    if (!g) return;
    this.fragCores -= 1;
    g.active = true;
    g.fuse = 1.65;
    g.x = this.playerX - Math.sin(this.playerYaw) * 0.7;
    g.y = this.playerY + 1.5;
    g.z = this.playerZ - Math.cos(this.playerYaw) * 0.7;
    const speed = 22;
    g.vx = -Math.sin(this.playerYaw) * Math.cos(this.cameraPitch) * speed;
    g.vy = 6.5 - Math.sin(this.cameraPitch) * 9;
    g.vz = -Math.cos(this.playerYaw) * Math.cos(this.cameraPitch) * speed;
    g.mesh.visible = true;
    g.mesh.position.set(g.x, g.y, g.z);
    audioEngine.playJump(false);
    this.emitHudSnapshot();
  }

  public triggerInteract() {
    const near = this.findNearestLoot();
    if (!near) return;
    this.collectLoot(near);
  }

  private bindInputListeners() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('deviceorientation', this.handleDeviceOrientation);
    document.addEventListener('visibilitychange', this.handleVisibility);

    const dom = this.renderer.domElement;
    dom.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
  }

  private handleResize = () => {
    const w = Math.max(320, this.container.clientWidth || window.innerWidth);
    const h = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.screenState !== 'playing') return;
    const code = e.code;
    if (!this.keysHeld.has(code)) {
      if (code === 'Space') this.triggerJump();
      if (code === 'KeyC') this.toggleCrouch();
      if (code === 'KeyR') this.triggerReload();
      if (code === 'KeyE' || code === 'KeyF') this.triggerInteract();
      if (code === 'Digit1') this.switchWeaponSlot(0);
      if (code === 'Digit2') this.switchWeaponSlot(1);
      if (code === 'KeyG') this.throwGrenade();
      if (code === 'KeyH') this.useMedkit();
      if (code === 'KeyV') this.useShieldCell();
    }
    this.keysHeld.add(code);
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.code);
  };

  private handleBlur = () => {
    this.clearHeldInputs();
  };

  private handleVisibility = () => {
    if (document.hidden) this.clearHeldInputs();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (this.screenState === 'title') {
      this.lobbyDragActive = true;
      this.lobbyLastX = e.clientX;
      return;
    }
    if (this.screenState !== 'playing') return;
    if (e.button === 0) {
      this.fireHeld = true;
      if (document.pointerLockElement !== this.renderer.domElement && window.innerWidth > 900) {
        this.renderer.domElement.requestPointerLock?.();
      }
    } else if (e.button === 2) {
      this.isAds = true;
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.screenState === 'title' && this.lobbyDragActive) {
      const dx = e.clientX - this.lobbyLastX;
      this.lobbyLastX = e.clientX;
      this.showcaseYaw += dx * 0.012;
      return;
    }
    if (this.screenState !== 'playing') return;
    if (document.pointerLockElement === this.renderer.domElement || this.fireHeld) {
      const sens = 0.0024 * this.settings.controls.touchSensitivity;
      this.playerYaw -= e.movementX * sens;
      this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + e.movementY * sens, -0.45, 0.85);
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    this.lobbyDragActive = false;
    if (e.button === 0) this.fireHeld = false;
    if (e.button === 2) this.isAds = false;
  };

  private handleDeviceOrientation = (e: DeviceOrientationEvent) => {
    if (!this.gyroEnabled || this.screenState !== 'playing') return;
    if (e.beta == null || e.gamma == null) return;
    if (this.lastGyroBeta !== null && this.lastGyroGamma !== null) {
      const dGamma = e.gamma - this.lastGyroGamma;
      const dBeta = e.beta - this.lastGyroBeta;
      if (Math.abs(dGamma) < 20 && Math.abs(dBeta) < 20) {
        this.playerYaw -= dGamma * 0.012;
        this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dBeta * 0.01, -0.45, 0.85);
      }
    }
    this.lastGyroBeta = e.beta;
    this.lastGyroGamma = e.gamma;
  };

  // Software WebGL loop pacing via GPU sync fence
  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || !gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.destroyed) return;
      const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (status === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.destroyed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsed += dt;

    // Animate water waves & atmospheric weather
    this.world.waterUniforms.uTime.value = this.elapsed;
    this.updateWeatherParticles(dt);

    if (this.screenState === 'title') {
      this.updateLobbyShowcase(dt);
    } else if (this.screenState === 'playing') {
      this.updateGameplay(dt);
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private updateWeatherParticles(dt: number) {
    const isRain = this.settings.environment === 'midnight';
    const fallSpeed = isRain ? 14 : 1.4;
    const cx = this.playerX;
    const cz = this.playerZ;
    for (let i = 0; i < 80; i++) {
      const ix = i * 3;
      this.weatherPositions[ix + 1] -= fallSpeed * dt;
      if (!isRain) {
        this.weatherPositions[ix] += Math.sin(this.elapsed + i) * 0.4 * dt;
      }
      if (this.weatherPositions[ix + 1] < 0) {
        this.weatherPositions[ix] = cx + (Math.random() - 0.5) * 60;
        this.weatherPositions[ix + 1] = 16 + Math.random() * 12;
        this.weatherPositions[ix + 2] = cz + (Math.random() - 0.5) * 60;
      }
      _mat4.makeTranslation(
        this.weatherPositions[ix],
        this.weatherPositions[ix + 1],
        this.weatherPositions[ix + 2]
      );
      if (!isRain) _mat4.scale(_scale.set(0.7, 0.15, 0.7));
      this.weatherMesh.setMatrixAt(i, _mat4);
    }
    this.weatherMesh.instanceMatrix.needsUpdate = true;
  }

  private updateLobbyShowcase(dt: number) {
    this.showcaseYaw += dt * 0.22;
    this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.root.rotation.y = this.showcaseYaw;
    animateCharacterRig(this.playerRig, {
      speed: 0,
      isGrounded: true,
      isCrouching: false,
      isParachuting: false,
      time: this.elapsed,
      dt,
    });

    // Subtle heroic orbit framing character + Central Bridge & Mountain Vista behind
    const targetCamX = this.playerX + Math.sin(this.elapsed * 0.18) * 1.1 - 1.1;
    const targetCamY = this.playerY + 1.85;
    const targetCamZ = this.playerZ + 4.35;
    this.camPos.x = THREE.MathUtils.damp(this.camPos.x, targetCamX, 5, dt);
    this.camPos.y = THREE.MathUtils.damp(this.camPos.y, targetCamY, 5, dt);
    this.camPos.z = THREE.MathUtils.damp(this.camPos.z, targetCamZ, 5, dt);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.playerX - 0.5, this.playerY + 1.25, this.playerZ - 1.2);
  }

  private updateGameplay(dt: number) {
    // Visual timers always tick even during brief impact hitstop
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.2);
    this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateCamera(dt);
      return;
    }

    this.matchTime += dt;

    // 1. Safe Zone Step & Storm Damage
    if (this.selectedMode !== 'training') {
      this.safeZoneState = stepSafeZone(this.safeZoneState, dt);
      this.safeZoneMesh.position.x = this.safeZoneState.centerX;
      this.safeZoneMesh.position.z = this.safeZoneState.centerZ;
      this.safeZoneMesh.scale.set(
        Math.max(1, this.safeZoneState.currentRadius),
        1,
        Math.max(1, this.safeZoneState.currentRadius)
      );

      if (
        this.phase === 'combat' &&
        !isInsideSafeZone(this.playerX, this.playerZ, this.safeZoneState)
      ) {
        const res = applyDamage(this.hp, this.shield, this.safeZoneState.damagePerSecond * dt, true);
        this.hp = res.newHp;
        if (res.eliminated) {
          this.finishMatch(false);
          return;
        }
      }
    }

    // 2. Player Movement (Parachute vs Ground Combat)
    this.updatePlayerMovement(dt);

    // 3. Weapons, Reload & Shooting
    this.updatePlayerCombat(dt);

    // 4. Loot Rotation, Auto-Ammo Pickup & Respawns
    this.updateLoots(dt);

    // 5. AI Bots, Archetype Policies, Telegraphs & Offscreen BR Skirmishes
    this.updateBots(dt);

    // 6. Projectiles, Grenades & Particles
    this.updateProjectiles(dt);
    this.updateGrenades(dt);
    this.updateParticles(dt);

    // 7. Keep shadow camera centered around player for crisp shadows everywhere
    this.keyLight.target.position.set(this.playerX, 0, this.playerZ);

    // 8. Smooth Over-The-Shoulder / FPP Camera with Wall Pull-In
    this.updateCamera(dt);

    // 9. Throttled HUD Snapshot (<= 10Hz)
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.1) {
      this.hudEmitAccum = 0;
      this.emitHudSnapshot();
    }
  }

  private updatePlayerMovement(dt: number) {
    // Combine WASD + Arrows + Mobile Virtual Joystick
    let inputX = this.joystickX;
    let inputZ = this.joystickY;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) inputX -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) inputX += 1;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) inputZ -= 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) inputZ += 1;

    const len = Math.hypot(inputX, inputZ);
    if (len > 1) {
      inputX /= len;
      inputZ /= len;
    }

    const forwardX = -Math.sin(this.playerYaw);
    const forwardZ = -Math.cos(this.playerYaw);
    const rightX = Math.cos(this.playerYaw);
    const rightZ = -Math.sin(this.playerYaw);

    const worldMoveX = rightX * inputX + forwardX * -inputZ;
    const worldMoveZ = rightZ * inputX + forwardZ * -inputZ;

    if (this.phase === 'parachute') {
      const glideSpeed = 13.5;
      this.playerVx = THREE.MathUtils.damp(this.playerVx, worldMoveX * glideSpeed, 5, dt);
      this.playerVz = THREE.MathUtils.damp(this.playerVz, worldMoveZ * glideSpeed, 5, dt);
      const diveFast = this.keysHeld.has('Space') || this.keysHeld.has('ShiftLeft');
      this.playerVy = diveFast ? -11.5 : -6.4;

      this.playerX += this.playerVx * dt;
      this.playerZ += this.playerVz * dt;
      this.playerY += this.playerVy * dt;

      const ground = Math.max(WATER_LEVEL + 0.15, groundHeightAt(this.playerX, this.playerZ));
      if (this.playerY <= ground) {
        this.playerY = ground;
        this.playerVy = 0;
        this.phase = 'combat';
        this.isGrounded = true;
        this.cameraPitch = 0.16;
        this.playerRig.squashY = 0.76;
        audioEngine.playJump(true);
        this.spawnParticleBurst(this.playerX, this.playerY + 0.2, this.playerZ, 12, 0.85, 0.78, 0.6);
        this.emitHudSnapshot();
      }
      this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
      this.playerRig.root.rotation.y = this.playerYaw + Math.PI;
      animateCharacterRig(this.playerRig, {
        speed: Math.hypot(this.playerVx, this.playerVz),
        isGrounded: false,
        isCrouching: false,
        isParachuting: true,
        time: this.elapsed,
        dt,
      });
      return;
    }

    // Ground / Combat Movement
    const shiftHeld = this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight');
    const wantsSprint =
      (shiftHeld || this.isSprinting || (this.settings.controls.autoSprint && len > 0.88)) &&
      !this.isCrouching &&
      !this.isAds &&
      this.stamina > 4;

    if (wantsSprint && len > 0.1) {
      this.stamina = Math.max(0, this.stamina - 22 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + 16 * dt);
    }

    let speed = this.selectedCharacter.baseSpeed;
    if (this.isCrouching) speed *= 0.56;
    else if (this.isAds) speed *= 0.68;
    else if (wantsSprint) speed *= 1.42;

    const targetVx = worldMoveX * speed;
    const targetVz = worldMoveZ * speed;
    this.playerVx = THREE.MathUtils.damp(this.playerVx, targetVx, 14, dt);
    this.playerVz = THREE.MathUtils.damp(this.playerVz, targetVz, 14, dt);

    this.playerX += this.playerVx * dt;
    this.playerZ += this.playerVz * dt;

    // Resolve building/rock colliders & island coast bounds
    const resolved = this.resolveEntityCollision(this.playerX, this.playerZ, 0.55);
    this.playerX = resolved.x;
    this.playerZ = resolved.z;

    // Jump buffering & coyote time
    if (this.isGrounded) this.coyoteTimer = 0.1;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
      if (this.coyoteTimer > 0) {
        this.playerVy = 8.4;
        this.isGrounded = false;
        this.isCrouching = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.playerRig.squashY = 1.22;
        audioEngine.playJump(false);
      }
    }

    // Gravity & landing
    this.playerVy -= 22 * dt;
    this.playerY += this.playerVy * dt;
    const groundY = Math.max(WATER_LEVEL - 0.1, groundHeightAt(this.playerX, this.playerZ));
    if (this.playerY <= groundY) {
      if (!this.isGrounded && this.playerVy < -3) {
        this.playerRig.squashY = 0.78;
        audioEngine.playJump(true);
      }
      this.playerY = groundY;
      this.playerVy = 0;
      this.isGrounded = true;
    } else if (this.playerY > groundY + 0.12) {
      this.isGrounded = false;
    }

    const horizSpeed = Math.hypot(this.playerVx, this.playerVz);
    if (this.isGrounded && horizSpeed > 1.2) {
      this.footstepTimer -= dt * (wantsSprint ? 1.5 : 1);
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.36;
        audioEngine.playFootstep(wantsSprint);
      }
    }

    this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.root.rotation.y = this.playerYaw + Math.PI;
    this.playerRig.root.visible = this.settings.perspective !== 'fpp';
    animateCharacterRig(this.playerRig, {
      speed: horizSpeed,
      isGrounded: this.isGrounded,
      isCrouching: this.isCrouching,
      isParachuting: false,
      time: this.elapsed,
      dt,
    });
  }

  private updatePlayerCombat(dt: number) {
    if (this.phase === 'parachute') return;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const slot = this.slots[this.activeSlot];
        if (slot) {
          this.slots[this.activeSlot] = reloadWeaponSlot(slot);
        }
        this.isReloading = false;
        this.reloadTimer = 0;
        audioEngine.playUiClick(780);
        this.emitHudSnapshot();
      }
      return;
    }

    const slot = this.slots[this.activeSlot];
    if (!slot) return;
    const cfg = WEAPONS[slot.weaponId];

    if (this.fireHeld && this.fireCooldown <= 0) {
      if (slot.ammoInMag <= 0) {
        this.triggerReload();
        return;
      }

      slot.ammoInMag -= 1;
      this.fireCooldown = 1 / cfg.fireRate;

      // Aim direction from camera look
      const cosP = Math.cos(this.cameraPitch);
      const dirX = -Math.sin(this.playerYaw) * cosP;
      const dirY = -Math.sin(this.cameraPitch);
      const dirZ = -Math.cos(this.playerYaw) * cosP;

      const muzzleX = this.playerX + dirX * 0.85;
      const muzzleY = this.playerY + (this.isCrouching ? 1.05 : 1.45);
      const muzzleZ = this.playerZ + dirZ * 0.85;

      const spreadMult = this.isAds ? 0.35 : this.isCrouching ? 0.65 : 1.0;
      for (let p = 0; p < cfg.pellets; p++) {
        const sp = cfg.spread * spreadMult;
        const sx = dirX + (Math.random() - 0.5) * sp;
        const sy = dirY + (Math.random() - 0.5) * sp;
        const sz = dirZ + (Math.random() - 0.5) * sp;
        const n = Math.hypot(sx, sy, sz) || 1;
        this.spawnProjectile({
          ownerId: -1,
          ownerName: 'YOU',
          ownerIsAlly: true,
          weaponId: cfg.id,
          x: muzzleX,
          y: muzzleY,
          z: muzzleZ,
          vx: (sx / n) * cfg.projectileSpeed,
          vy: (sy / n) * cfg.projectileSpeed,
          vz: (sz / n) * cfg.projectileSpeed,
          damage: cfg.damage,
          life: cfg.range / cfg.projectileSpeed,
        });
      }

      audioEngine.playShot(cfg.id, 1);
      this.cameraTrauma = Math.min(1, this.cameraTrauma + (cfg.id === 'railgun' ? 0.32 : 0.12));
      this.spawnParticleBurst(muzzleX, muzzleY, muzzleZ, 4, 1, 0.78, 0.25);

      if (slot.ammoInMag === 0 && slot.reserveAmmo > 0) {
        this.triggerReload();
      }
    }
  }

  private findNearestLoot(): LootEntity | null {
    let best: LootEntity | null = null;
    let bestD = 3.2;
    for (const l of this.loots) {
      if (l.collected) continue;
      const d = Math.hypot(l.x - this.playerX, l.z - this.playerZ);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  private collectLoot(l: LootEntity) {
    l.collected = true;
    l.mesh.visible = false;
    l.respawnTimer = this.selectedMode === 'training' ? 10 : 0;

    if (l.kind === 'medkit') {
      this.medkits += 1;
    } else if (l.kind === 'shield') {
      this.shieldCells += 1;
    } else if (l.kind === 'ammo') {
      const slot = this.slots[this.activeSlot];
      if (slot) slot.reserveAmmo += WEAPONS[slot.weaponId].magSize * 2;
    } else if ((l.kind === 'weapon' || l.kind === 'crate') && l.weaponId) {
      this.slots[this.activeSlot] = createWeaponSlot(l.weaponId, 4);
      setRigWeapon(this.playerRig, l.weaponId);
      if (l.kind === 'crate') {
        this.medkits += 1;
        this.shieldCells += 1;
        this.fragCores += 1;
      }
    }

    audioEngine.playPickup();
    this.spawnParticleBurst(l.x, l.y + 0.5, l.z, 10, 0.25, 0.9, 0.6);
    this.emitHudSnapshot();
  }

  private updateLoots(dt: number) {
    for (const l of this.loots) {
      if (l.collected) {
        if (l.respawnTimer > 0) {
          l.respawnTimer -= dt;
          if (l.respawnTimer <= 0) {
            l.collected = false;
            l.mesh.visible = true;
          }
        }
        continue;
      }
      l.mesh.rotation.y += dt * 1.4;
      // Auto-pickup ammo/medkits if walking right over them
      const d = Math.hypot(l.x - this.playerX, l.z - this.playerZ);
      if (d < 1.35 && (l.kind === 'ammo' || l.kind === 'medkit' || l.kind === 'shield')) {
        this.collectLoot(l);
      }
    }
  }

  private updateBots(dt: number) {
    // 1. Simulate periodic realistic bot-vs-bot BR skirmishes across the island
    if (this.selectedMode !== 'training') {
      this.skirmishAccum += dt;
      if (this.skirmishAccum >= 4.2) {
        this.skirmishAccum = 0;
        const farEnemies = this.bots.filter(
          (b) =>
            b.alive &&
            !b.isAlly &&
            Math.hypot(b.x - this.playerX, b.z - this.playerZ) > 65
        );
        if (farEnemies.length >= 2) {
          const victim = farEnemies[Math.floor(Math.random() * farEnemies.length)];
          const killer = farEnemies.find((k) => k.id !== victim.id) || farEnemies[0];
          this.eliminateBot(victim, killer.name, WEAPONS[killer.weaponId].name, false);
        }
      }
    }

    // 2. Attack token pool (max 3 concurrent ranged attackers on player for fair combat)
    let tokensUsed = 0;
    let anyTelegraphing = false;
    this.telegraphBeam.visible = false;

    for (const bot of this.bots) {
      if (!bot.alive) {
        if (bot.koTimer > 0) {
          bot.koTimer = Math.max(0, bot.koTimer - dt);
          if (bot.rigIndex >= 0) {
            const rig = this.botRigPool[bot.rigIndex].rig;
            rig.root.rotation.x = THREE.MathUtils.damp(rig.root.rotation.x, Math.PI / 2, 10, dt);
            if (bot.koTimer === 0) {
              rig.root.visible = false;
              rig.root.rotation.x = 0;
              this.botRigPool[bot.rigIndex].assignedBotId = -1;
              bot.rigIndex = -1;
            }
          }
        } else if (this.selectedMode === 'training') {
          // Respawn training bot
          bot.alive = true;
          bot.hp = bot.maxHp;
          bot.shield = 25;
        }
        continue;
      }

      // Zone storm damage for bots outside zone
      if (
        this.selectedMode !== 'training' &&
        !isInsideSafeZone(bot.x, bot.z, this.safeZoneState)
      ) {
        const zRes = applyDamage(bot.hp, bot.shield, this.safeZoneState.damagePerSecond * dt, true);
        bot.hp = zRes.newHp;
        if (zRes.eliminated) {
          this.eliminateBot(bot, 'Safe Zone', 'Storm', false);
          continue;
        }
      }

      // Target selection
      let targetX = this.playerX;
      let targetZ = this.playerZ;
      let targetY = this.playerY;
      let targetIsPlayer = !bot.isAlly;

      if (bot.isAlly) {
        // Ally targets nearest alive enemy bot, otherwise follows player
        let nearestEnemy: BotEntity | null = null;
        let bestD = 55;
        for (const other of this.bots) {
          if (!other.alive || other.isAlly) continue;
          const d = Math.hypot(other.x - bot.x, other.z - bot.z);
          if (d < bestD) {
            bestD = d;
            nearestEnemy = other;
          }
        }
        if (nearestEnemy) {
          targetX = nearestEnemy.x;
          targetZ = nearestEnemy.z;
          targetY = nearestEnemy.y;
        } else {
          targetX = this.playerX + 4;
          targetZ = this.playerZ + 4;
          targetY = this.playerY;
        }
      }

      const distToTarget = Math.hypot(targetX - bot.x, targetZ - bot.z);

      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeSign *= -1;
        bot.strafeTimer = 1.6 + Math.random() * 2.2;
      }

      const decision = decideBotAction({
        archetype: bot.archetype,
        botX: bot.x,
        botZ: bot.z,
        targetX,
        targetZ,
        zoneCenterX: this.safeZoneState.centerX,
        zoneCenterZ: this.safeZoneState.centerZ,
        zoneRadius: this.safeZoneState.currentRadius,
        strafeSign: bot.strafeSign,
        hasLineOfSight: distToTarget < 78,
      });

      const moveSpeed = 5.8 * decision.desiredSpeedFactor;
      bot.vx = THREE.MathUtils.damp(bot.vx, decision.desiredMoveDirX * moveSpeed, 8, dt);
      bot.vz = THREE.MathUtils.damp(bot.vz, decision.desiredMoveDirZ * moveSpeed, 8, dt);
      bot.x += bot.vx * dt;
      bot.z += bot.vz * dt;
      const res = this.resolveEntityCollision(bot.x, bot.z, 0.52);
      bot.x = res.x;
      bot.z = res.z;
      bot.y = Math.max(WATER_LEVEL + 0.1, groundHeightAt(bot.x, bot.z));

      bot.yaw = Math.atan2(-(targetX - bot.x), -(targetZ - bot.z));

      // Combat firing with visible 0.42s telegraph & token budget
      if (
        decision.shouldFire &&
        this.phase === 'combat' &&
        (bot.isAlly ? targetX !== this.playerX + 4 : tokensUsed < 3)
      ) {
        if (!bot.isAlly) tokensUsed += 1;
        bot.fireCooldown -= dt;
        if (bot.fireCooldown <= 0.42 && bot.fireCooldown > 0) {
          bot.telegraphTimer = bot.fireCooldown;
          if (targetIsPlayer && distToTarget < 52) {
            anyTelegraphing = true;
            const posAttr = this.telegraphBeam.geometry.attributes.position as THREE.BufferAttribute;
            posAttr.setXYZ(0, bot.x, bot.y + 1.45, bot.z);
            posAttr.setXYZ(1, this.playerX, this.playerY + 1.25, this.playerZ);
            posAttr.needsUpdate = true;
            this.telegraphBeam.visible = true;
          }
        }
        if (bot.fireCooldown <= 0) {
          const wCfg = WEAPONS[bot.weaponId];
          bot.fireCooldown = Math.max(0.65, 1.8 / Math.sqrt(wCfg.fireRate));
          const dx = targetX - bot.x;
          const dy = targetY + 1.2 - (bot.y + 1.4);
          const dz = targetZ - bot.z;
          const dLen = Math.hypot(dx, dy, dz) || 1;
          const inaccuracy = 0.085;
          const sx = dx / dLen + (Math.random() - 0.5) * inaccuracy;
          const sy = dy / dLen + (Math.random() - 0.5) * inaccuracy * 0.5;
          const sz = dz / dLen + (Math.random() - 0.5) * inaccuracy;
          const n = Math.hypot(sx, sy, sz) || 1;

          this.spawnProjectile({
            ownerId: bot.id,
            ownerName: bot.name,
            ownerIsAlly: bot.isAlly,
            weaponId: bot.weaponId,
            x: bot.x + (dx / dLen) * 0.8,
            y: bot.y + 1.4,
            z: bot.z + (dz / dLen) * 0.8,
            vx: (sx / n) * wCfg.projectileSpeed * 0.72,
            vy: (sy / n) * wCfg.projectileSpeed * 0.72,
            vz: (sz / n) * wCfg.projectileSpeed * 0.72,
            damage: Math.round(wCfg.damage * 0.48),
            life: 1.4,
          });
          const atten = Math.max(0, 1 - distToTarget / 55) * 0.45;
          audioEngine.playShot(bot.weaponId, atten);
        }
      }
    }

    // 3. Assign nearest 16 alive/KO bots to pooled 3D CharacterRigs
    const candidates = this.bots
      .filter((b) => b.alive || b.koTimer > 0)
      .map((b) => ({
        bot: b,
        dist: Math.hypot(b.x - this.playerX, b.z - this.playerZ),
      }))
      .filter((item) => item.dist < 95)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 16);

    const activeIds = new Set(candidates.map((c) => c.bot.id));

    // Free rigs whose bots moved out of range
    for (const slot of this.botRigPool) {
      if (slot.assignedBotId !== -1 && !activeIds.has(slot.assignedBotId)) {
        const oldBot = this.bots[slot.assignedBotId];
        if (oldBot) oldBot.rigIndex = -1;
        slot.assignedBotId = -1;
        slot.rig.root.visible = false;
        slot.rig.root.rotation.x = 0;
      }
    }

    // Bind & animate visible bots
    for (const { bot } of candidates) {
      let poolIdx = bot.rigIndex;
      if (poolIdx < 0) {
        poolIdx = this.botRigPool.findIndex((p) => p.assignedBotId === -1);
        if (poolIdx >= 0) {
          bot.rigIndex = poolIdx;
          this.botRigPool[poolIdx].assignedBotId = bot.id;
          this.botRigPool[poolIdx].rig.root.visible = true;
          this.botRigPool[poolIdx].rig.root.rotation.x = 0;
          setRigWeapon(this.botRigPool[poolIdx].rig, bot.weaponId);
        }
      }
      if (poolIdx >= 0) {
        const rig = this.botRigPool[poolIdx].rig;
        rig.root.position.set(bot.x, bot.y, bot.z);
        if (bot.alive) {
          rig.root.rotation.y = bot.yaw + Math.PI;
          animateCharacterRig(rig, {
            speed: Math.hypot(bot.vx, bot.vz),
            isGrounded: true,
            isCrouching: false,
            isParachuting: false,
            time: this.elapsed,
            dt,
          });
        }
      }
    }

    // Store warning flag for HUD
    this.botTelegraphFlag = anyTelegraphing;
  }

  private botTelegraphFlag = false;

  private spawnProjectile(p: Omit<Projectile, 'active'>) {
    const slot = this.projectiles.find((item) => !item.active);
    if (!slot) return;
    Object.assign(slot, p, { active: true });
  }

  private updateProjectiles(dt: number) {
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.active) {
        _mat4.makeTranslation(0, -999, 0);
        this.projectileMesh.setMatrixAt(i, _mat4);
        continue;
      }

      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      if (p.life <= 0 || p.y < groundHeightAt(p.x, p.z)) {
        p.active = false;
        this.spawnParticleBurst(p.x, p.y, p.z, 4, 0.9, 0.75, 0.4);
        continue;
      }

      // Check hit on Player (only enemy projectiles)
      if (p.ownerId >= 0 && !p.ownerIsAlly && this.phase === 'combat') {
        const dPlayer = Math.hypot(p.x - this.playerX, p.z - this.playerZ);
        if (dPlayer < 0.75 && p.y >= this.playerY && p.y <= this.playerY + 1.95) {
          p.active = false;
          const res = applyDamage(this.hp, this.shield, p.damage);
          this.hp = res.newHp;
          this.shield = res.newShield;
          this.damageFlashTimer = 0.25;
          this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.36);
          this.playerRig.hitFlashTimer = 0.05;
          this.spawnParticleBurst(p.x, p.y, p.z, 8, 1, 0.25, 0.25);

          if (res.eliminated) {
            this.finishMatch(false);
            return;
          }
          continue;
        }
      }

      // Check hit on Bots
      let hitBot = false;
      for (const bot of this.bots) {
        if (!bot.alive || bot.id === p.ownerId) continue;
        if (p.ownerIsAlly && bot.isAlly) continue;
        const db = Math.hypot(p.x - bot.x, p.z - bot.z);
        if (db < 0.8 && p.y >= bot.y && p.y <= bot.y + 1.95) {
          p.active = false;
          hitBot = true;
          const res = applyDamage(bot.hp, bot.shield, p.damage);
          bot.hp = res.newHp;
          bot.shield = res.newShield;

          if (bot.rigIndex >= 0) {
            this.botRigPool[bot.rigIndex].rig.hitFlashTimer = 0.05;
          }

          if (p.ownerId === -1) {
            this.damageDealt += p.damage;
            this.hitMarkerTimer = 0.16;
            audioEngine.playHitMarker(res.eliminated);
          }

          this.spawnParticleBurst(p.x, p.y, p.z, 10, 1, 0.55, 0.15);

          if (res.eliminated) {
            this.eliminateBot(bot, p.ownerName, WEAPONS[p.weaponId].name, p.ownerId === -1);
          }
          break;
        }
      }
      if (hitBot) continue;

      // Update instance transform aligned with velocity
      _v1.set(p.x, p.y, p.z);
      _v2.set(p.vx, p.vy, p.vz).normalize();
      _quat.setFromUnitVectors(_v3.set(0, 0, 1), _v2);
      _scale.set(1, 1, 1);
      _mat4.compose(_v1, _quat, _scale);
      this.projectileMesh.setMatrixAt(i, _mat4);
      this.projectileMesh.setColorAt(i, _color.setHex(WEAPONS[p.weaponId].accentHex));
    }

    this.projectileMesh.instanceMatrix.needsUpdate = true;
    if (this.projectileMesh.instanceColor) {
      this.projectileMesh.instanceColor.needsUpdate = true;
    }
  }

  private eliminateBot(bot: BotEntity, killerName: string, weaponName: string, byPlayer: boolean) {
    if (!bot.alive) return;
    bot.alive = false;
    bot.koTimer = 0.4;
    if (byPlayer) {
      this.eliminations += 1;
      this.hitstopTimer = 0.045;
      this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.3);
      // Drop shield boost reward on elimination
      this.shield = Math.min(this.maxShield, this.shield + 15);
    }

    this.killFeed.unshift({
      id: this.killFeedCounter++,
      killer: killerName,
      victim: bot.name,
      weaponName,
      isPlayerInvolved: byPlayer,
      timestamp: this.matchTime,
    });
    if (this.killFeed.length > 4) this.killFeed.pop();

    // Check Victory in BR modes (all enemy bots eliminated)
    if (this.selectedMode !== 'training') {
      const enemiesLeft = this.bots.filter((b) => b.alive && !b.isAlly).length;
      if (enemiesLeft === 0) {
        this.finishMatch(true);
      }
    }
  }

  private updateGrenades(dt: number) {
    for (const g of this.grenades) {
      if (!g.active) continue;
      g.fuse -= dt;
      g.vy -= 19 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;

      const gy = groundHeightAt(g.x, g.z) + 0.2;
      if (g.y < gy) {
        g.y = gy;
        g.vy = Math.abs(g.vy) * 0.35;
        g.vx *= 0.65;
        g.vz *= 0.65;
      }
      g.mesh.position.set(g.x, g.y, g.z);
      g.mesh.rotation.x += dt * 8;

      if (g.fuse <= 0) {
        g.active = false;
        g.mesh.visible = false;
        audioEngine.playExplosion();
        this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.65);
        this.spawnParticleBurst(g.x, g.y + 0.4, g.z, 28, 1.0, 0.45, 0.1);

        // Area blast damage
        for (const bot of this.bots) {
          if (!bot.alive || bot.isAlly) continue;
          const d = Math.hypot(bot.x - g.x, bot.z - g.z);
          if (d < 8.5) {
            const dmg = Math.round(95 * (1 - d / 9.5));
            const res = applyDamage(bot.hp, bot.shield, dmg);
            bot.hp = res.newHp;
            bot.shield = res.newShield;
            this.damageDealt += dmg;
            if (res.eliminated) {
              this.eliminateBot(bot, 'YOU', 'Frag Core', true);
            }
          }
        }
      }
    }
  }

  private spawnParticleBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    r: number,
    g: number,
    b: number
  ) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particles.length;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      const a = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 6.5;
      p.vx = Math.cos(a) * spd;
      p.vy = 1.5 + Math.random() * 5;
      p.vz = Math.sin(a) * spd;
      p.maxLife = 0.3 + Math.random() * 0.35;
      p.life = p.maxLife;
      p.size = 0.6 + Math.random() * 1.1;
      p.r = r;
      p.g = g;
      p.b = b;
    }
  }

  private updateParticles(dt: number) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) {
        _mat4.makeTranslation(0, -999, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _mat4.makeTranslation(0, -999, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const s = p.size * (p.life / p.maxLife);
      _v1.set(p.x, p.y, p.z);
      _quat.identity();
      _scale.set(s, s, s);
      _mat4.compose(_v1, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setRGB(p.r, p.g, p.b));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private resolveEntityCollision(x: number, z: number, radius: number): { x: number; z: number } {
    let rx = x;
    let rz = z;
    // Clamp inside island coastline
    const d = Math.hypot(rx, rz);
    if (d > ISLAND_RADIUS - 3) {
      const scale = (ISLAND_RADIUS - 3) / d;
      rx *= scale;
      rz *= scale;
    }

    for (const c of this.world.colliders) {
      const cx = THREE.MathUtils.clamp(rx, c.minX, c.maxX);
      const cz = THREE.MathUtils.clamp(rz, c.minZ, c.maxZ);
      const dx = rx - cx;
      const dz = rz - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const push = radius - dist;
          rx += (dx / dist) * push;
          rz += (dz / dist) * push;
        } else {
          rx = c.maxX + radius;
        }
      }
    }
    return { x: rx, z: rz };
  }

  private updateCamera(dt: number) {
    const isFpp = this.settings.perspective === 'fpp' && this.phase === 'combat';
    const eyeHeight = this.isCrouching ? 1.15 : 1.62;

    if (isFpp) {
      const targetX = this.playerX;
      const targetY = this.playerY + eyeHeight;
      const targetZ = this.playerZ;
      this.camPos.x = THREE.MathUtils.damp(this.camPos.x, targetX, 24, dt);
      this.camPos.y = THREE.MathUtils.damp(this.camPos.y, targetY, 24, dt);
      this.camPos.z = THREE.MathUtils.damp(this.camPos.z, targetZ, 24, dt);
      const cosP = Math.cos(this.cameraPitch);
      this.camLook.set(
        this.camPos.x - Math.sin(this.playerYaw) * cosP * 20,
        this.camPos.y - Math.sin(this.cameraPitch) * 20,
        this.camPos.z - Math.cos(this.playerYaw) * cosP * 20
      );
    } else {
      const dist = this.phase === 'parachute' ? 7.5 : this.isAds ? 2.6 : 4.6;
      const shoulder = this.phase === 'parachute' ? 0 : 0.72;
      const anchorX = this.playerX;
      const anchorY = this.playerY + eyeHeight;
      const anchorZ = this.playerZ;

      const backX = Math.sin(this.playerYaw) * Math.cos(this.cameraPitch);
      const backY = Math.sin(this.cameraPitch) + 0.18;
      const backZ = Math.cos(this.playerYaw) * Math.cos(this.cameraPitch);
      const rightX = Math.cos(this.playerYaw);
      const rightZ = -Math.sin(this.playerYaw);

      let desiredX = anchorX + backX * dist + rightX * shoulder;
      let desiredY = anchorY + backY * dist;
      let desiredZ = anchorZ + backZ * dist + rightZ * shoulder;

      // Wall pull-in raycast so camera never clips behind walls/terrain
      _v1.set(anchorX, anchorY, anchorZ);
      _v2.set(desiredX - anchorX, desiredY - anchorY, desiredZ - anchorZ);
      const targetDist = _v2.length();
      if (targetDist > 0.1) {
        _v2.divideScalar(targetDist);
        this.camRaycaster.set(_v1, _v2);
        this.camRaycaster.far = targetDist;
        const hits = this.camRaycaster.intersectObjects(this.world.raycastTargets, true);
        if (hits.length > 0 && hits[0].distance < targetDist) {
          const pull = Math.max(1.1, hits[0].distance - 0.35);
          desiredX = anchorX + _v2.x * pull;
          desiredY = anchorY + _v2.y * pull;
          desiredZ = anchorZ + _v2.z * pull;
        }
      }

      const groundBelowCam = groundHeightAt(desiredX, desiredZ) + 0.45;
      if (desiredY < groundBelowCam) desiredY = groundBelowCam;

      this.camPos.x = THREE.MathUtils.damp(this.camPos.x, desiredX, 16, dt);
      this.camPos.y = THREE.MathUtils.damp(this.camPos.y, desiredY, 16, dt);
      this.camPos.z = THREE.MathUtils.damp(this.camPos.z, desiredZ, 16, dt);

      const lookDist = 28;
      const cosP = Math.cos(this.cameraPitch);
      this.camLook.set(
        anchorX - Math.sin(this.playerYaw) * cosP * lookDist,
        anchorY - Math.sin(this.cameraPitch) * lookDist,
        anchorZ - Math.cos(this.playerYaw) * cosP * lookDist
      );
    }

    // Apply decaying trauma*trauma camera shake
    const shake = this.cameraTrauma * this.cameraTrauma * 0.28;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camLook);

    const targetFov = this.isAds ? 46 : this.isSprinting ? 68 : 62;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 12, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private finishMatch(victory: boolean) {
    this.clearHeldInputs();
    this.screenState = 'gameover';
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }

    const modeCfg = GAME_MODES.find((m) => m.id === this.selectedMode) || GAME_MODES[0];
    const enemiesAlive = this.bots.filter((b) => b.alive && !b.isAlly).length;
    const rank = victory ? 1 : enemiesAlive + 1;
    const score = calculateMatchScore({
      victory,
      rank,
      totalCombatants: modeCfg.combatants,
      eliminations: this.eliminations,
      damageDealt: this.damageDealt,
      survivalTime: this.matchTime,
      mode: this.selectedMode,
    });

    if (score > this.bestScore) {
      this.bestScore = score;
      try {
        localStorage.setItem('vorqen_best_score', String(this.bestScore));
      } catch {
        // ignore
      }
    }

    audioEngine.playMatchEnd(victory);
    this.emitHudSnapshot();
    this.callbacks.onMatchEnd({
      victory,
      rank,
      totalCombatants: modeCfg.combatants,
      eliminations: this.eliminations,
      damageDealt: this.damageDealt,
      survivalTime: this.matchTime,
      mode: this.selectedMode,
      score,
      bestScore: this.bestScore,
    });
  }

  private emitHudSnapshot() {
    const modeCfg = GAME_MODES.find((m) => m.id === this.selectedMode) || GAME_MODES[0];
    const aliveBots = this.bots.filter((b) => b.alive).length;
    const aliveCount = aliveBots + (this.hp > 0 ? 1 : 0);
    const groundY = groundHeightAt(this.playerX, this.playerZ);

    const near = this.findNearestLoot();
    const minimapActors: MinimapActor[] = [{ x: this.playerX, z: this.playerZ, kind: 'player' }];
    for (const b of this.bots) {
      if (!b.alive) continue;
      if (b.isAlly) {
        minimapActors.push({ x: b.x, z: b.z, kind: 'ally' });
      } else if (Math.hypot(b.x - this.playerX, b.z - this.playerZ) < 62) {
        minimapActors.push({ x: b.x, z: b.z, kind: 'enemy' });
      }
    }
    for (const l of this.loots) {
      if (!l.collected && l.kind === 'crate') {
        minimapActors.push({ x: l.x, z: l.z, kind: 'crate' });
      }
    }

    const activeWeapon = this.slots[this.activeSlot];
    const reloadDur = activeWeapon ? WEAPONS[activeWeapon.weaponId].reloadTime : 1;
    const headingDeg = (((-this.playerYaw * 180) / Math.PI) % 360 + 360) % 360;

    this.callbacks.onHudUpdate({
      phase: this.phase,
      altitude: Math.max(0, Math.round(this.playerY - groundY)),
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      shield: Math.round(this.shield),
      maxShield: this.maxShield,
      stamina: Math.round(this.stamina),
      isCrouching: this.isCrouching,
      isSprinting: this.isSprinting,
      isReloading: this.isReloading,
      reloadProgress: this.isReloading ? 1 - Math.max(0, this.reloadTimer / reloadDur) : 0,
      activeSlot: this.activeSlot,
      slots: [
        { ...this.slots[0] },
        this.slots[1] ? { ...this.slots[1] } : null,
      ],
      medkits: this.medkits,
      shieldCells: this.shieldCells,
      fragCores: this.fragCores,
      aliveCount,
      totalCombatants: modeCfg.combatants,
      eliminations: this.eliminations,
      damageDealt: Math.round(this.damageDealt),
      matchTime: this.matchTime,
      zonePhase: this.safeZoneState.phase,
      zoneTimer: Math.max(0, Math.round(this.safeZoneState.timer)),
      zoneShrinking: this.safeZoneState.shrinking,
      inSafeZone: isInsideSafeZone(this.playerX, this.playerZ, this.safeZoneState),
      zoneCenterX: this.safeZoneState.centerX,
      zoneCenterZ: this.safeZoneState.centerZ,
      zoneRadius: this.safeZoneState.currentRadius,
      nextZoneRadius: this.safeZoneState.targetRadius,
      playerX: this.playerX,
      playerZ: this.playerZ,
      headingDeg: Math.round(headingDeg),
      nearbyLoot: near
        ? { id: near.id, label: near.label, kind: near.kind }
        : null,
      hitMarkerTimer: this.hitMarkerTimer,
      damageFlashTimer: this.damageFlashTimer,
      killFeed: [...this.killFeed],
      minimapActors,
      botTelegraphWarning: this.botTelegraphFlag,
      perspective: this.settings.perspective,
    });
  }

  public dispose() {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('deviceorientation', this.handleDeviceOrientation);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.renderer.domElement.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);

    this.textures.dispose();
    this.world.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
