import * as THREE from 'three';
import { groundHeightAt, ISLAND_RADIUS, WATER_LEVEL } from './rules';

export interface ProceduralTextureSet {
  concreteColor: THREE.CanvasTexture;
  apartmentFacade: THREE.CanvasTexture;
  metalPanel: THREE.CanvasTexture;
  stoneMasonry: THREE.CanvasTexture;
  terrainBump: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  minimapCanvas: HTMLCanvasElement;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Concrete / Urban Asphalt micro-texture
  const [concC, concCtx] = makeCanvas(256, 256);
  concCtx.fillStyle = '#555b66';
  concCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const v = 70 + Math.floor(Math.random() * 40);
    concCtx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    concCtx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  concCtx.strokeStyle = 'rgba(20,24,32,0.22)';
  concCtx.lineWidth = 2;
  concCtx.strokeRect(1, 1, 254, 254);
  const concreteColor = new THREE.CanvasTexture(concC);
  concreteColor.colorSpace = THREE.SRGBColorSpace;
  concreteColor.wrapS = concreteColor.wrapT = THREE.RepeatWrapping;
  concreteColor.anisotropy = maxAnisotropy;

  // 2. Terracotta & Concrete Apartment Facade (inspired by urban BR buildings)
  const [aptC, aptCtx] = makeCanvas(256, 256);
  aptCtx.fillStyle = '#c27d4e';
  aptCtx.fillRect(0, 0, 256, 256);
  // Subtle stucco noise
  for (let i = 0; i < 1600; i++) {
    aptCtx.fillStyle = i % 2 === 0 ? 'rgba(255,230,200,0.08)' : 'rgba(60,30,15,0.08)';
    aptCtx.fillRect(Math.random() * 256, Math.random() * 256, 3, 2);
  }
  // Floor trim bands
  aptCtx.fillStyle = '#d6cfc4';
  aptCtx.fillRect(0, 0, 256, 16);
  aptCtx.fillRect(0, 122, 256, 12);
  aptCtx.fillRect(0, 240, 256, 16);
  // Windows with dark frames and subtle interior depth
  for (let row = 0; row < 2; row++) {
    const wy = row === 0 ? 34 : 152;
    for (let col = 0; col < 3; col++) {
      const wx = 20 + col * 82;
      aptCtx.fillStyle = '#d9d2c5';
      aptCtx.fillRect(wx - 4, wy - 4, 56, 68);
      aptCtx.fillStyle = '#1b2432';
      aptCtx.fillRect(wx, wy, 48, 60);
      aptCtx.fillStyle = 'rgba(130, 175, 215, 0.25)';
      aptCtx.fillRect(wx + 4, wy + 4, 18, 24);
      aptCtx.fillRect(wx + 26, wy + 4, 18, 24);
    }
  }
  const apartmentFacade = new THREE.CanvasTexture(aptC);
  apartmentFacade.colorSpace = THREE.SRGBColorSpace;
  apartmentFacade.wrapS = apartmentFacade.wrapT = THREE.RepeatWrapping;
  apartmentFacade.anisotropy = maxAnisotropy;

  // 3. Industrial Corrugated Metal Panel (Military Hangar / Warehouse)
  const [metC, metCtx] = makeCanvas(256, 256);
  metCtx.fillStyle = '#475569';
  metCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    metCtx.fillStyle = 'rgba(255,255,255,0.08)';
    metCtx.fillRect(x, 0, 6, 256);
    metCtx.fillStyle = 'rgba(0,0,0,0.18)';
    metCtx.fillRect(x + 6, 0, 4, 256);
  }
  metCtx.fillStyle = '#d97706';
  metCtx.fillRect(0, 212, 256, 14);
  const metalPanel = new THREE.CanvasTexture(metC);
  metalPanel.colorSpace = THREE.SRGBColorSpace;
  metalPanel.wrapS = metalPanel.wrapT = THREE.RepeatWrapping;
  metalPanel.anisotropy = maxAnisotropy;

  // 4. Gothic Stone Masonry (Fortress / Ruins)
  const [stnC, stnCtx] = makeCanvas(256, 256);
  stnCtx.fillStyle = '#4a4e5a';
  stnCtx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    const offset = (row % 2) * 32;
    for (let col = -1; col < 5; col++) {
      const x = col * 64 + offset;
      const shade = 64 + Math.floor(Math.random() * 26);
      stnCtx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 10})`;
      stnCtx.fillRect(x + 2, y + 2, 60, 28);
    }
  }
  const stoneMasonry = new THREE.CanvasTexture(stnC);
  stoneMasonry.colorSpace = THREE.SRGBColorSpace;
  stoneMasonry.wrapS = stoneMasonry.wrapT = THREE.RepeatWrapping;
  stoneMasonry.anisotropy = maxAnisotropy;

  // 5. Grayscale Terrain Micro-Bump Map (linear data texture)
  const [bmpC, bmpCtx] = makeCanvas(256, 256);
  bmpCtx.fillStyle = '#808080';
  bmpCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3500; i++) {
    const g = 90 + Math.floor(Math.random() * 80);
    bmpCtx.fillStyle = `rgb(${g},${g},${g})`;
    bmpCtx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  const terrainBump = new THREE.CanvasTexture(bmpC);
  terrainBump.wrapS = terrainBump.wrapT = THREE.RepeatWrapping;
  terrainBump.repeat.set(24, 24);

  // 6. Soft Radial Contact Shadow Disc
  const [shdC, shdCtx] = makeCanvas(128, 128);
  const grad = shdCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shdCtx.fillStyle = grad;
  shdCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shdC);
  contactShadow.colorSpace = THREE.SRGBColorSpace;

  // 7. Top-down baked minimap canvas (180x180)
  const [minimapCanvas, mmCtx] = makeCanvas(180, 180);
  const worldSpan = (ISLAND_RADIUS + 20) * 2;
  const imgData = mmCtx.createImageData(180, 180);
  for (let py = 0; py < 180; py++) {
    for (let px = 0; px < 180; px++) {
      const wx = ((px / 180) - 0.5) * worldSpan;
      const wz = ((py / 180) - 0.5) * worldSpan;
      const h = groundHeightAt(wx, wz);
      const idx = (py * 180 + px) * 4;

      let r = 20;
      let g = 45;
      let b = 78;

      if (h > WATER_LEVEL) {
        if (h < 0.15) {
          // Coastal sand
          r = 166;
          g = 152;
          b = 114;
        } else if (h > 8.5) {
          // Rocky mountain peak
          r = 104;
          g = 110;
          b = 120;
        } else {
          // Lush island grass with elevation tint
          const shade = Math.min(1.25, 0.8 + h * 0.04);
          r = Math.round(64 * shade);
          g = Math.round(108 * shade);
          b = Math.round(62 * shade);
        }

        // Highlight main city pad
        if (Math.hypot(wx - 42, wz - 44) < 28) {
          r = 112;
          g = 116;
          b = 124;
        }
        // Highlight military airstrip
        if (Math.hypot(wx + 56, wz - 6) < 26) {
          r = 92;
          g = 98;
          b = 106;
        }
        // Highlight central bridge
        if (Math.abs(wx) < 4 && wz > -30 && wz < 8) {
          r = 185;
          g = 170;
          b = 140;
        }
      }

      imgData.data[idx] = r;
      imgData.data[idx + 1] = g;
      imgData.data[idx + 2] = b;
      imgData.data[idx + 3] = 255;
    }
  }
  mmCtx.putImageData(imgData, 0, 0);

  return {
    concreteColor,
    apartmentFacade,
    metalPanel,
    stoneMasonry,
    terrainBump,
    contactShadow,
    minimapCanvas,
    dispose: () => {
      concreteColor.dispose();
      apartmentFacade.dispose();
      metalPanel.dispose();
      stoneMasonry.dispose();
      terrainBump.dispose();
      contactShadow.dispose();
    },
  };
}
