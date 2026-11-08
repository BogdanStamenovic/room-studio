// Assembles room + pieces in Y-up metres (the path tracer's epsilon and env map both assume it).
import * as THREE from 'three';
import { resolveRoom } from '../geometry.mjs';
import { makeMaterials, makeSky } from './materials.mjs';
import { buildPiano, buildRoom } from './room.mjs';
import { buildBed, buildImage, buildPlatform } from './pieces.mjs';
import { buildTable } from './table.mjs';
import { pianoPlace } from './plan.mjs';

/** Room coordinates in mm to world metres, Y up. */
export const P = (x, y, z) => new THREE.Vector3(x / 1000, z / 1000, -y / 1000);

export function buildScene(state, { variant = 'corner', fold = 0, flapOpen = 0, upholstery = 'vermilion', forPathTracer = false, lighting = 'day', table = 0, tableCover = true, tableChair = true, tableTop = true, M: shared } = {}) {
  const M = shared || makeMaterials({ upholstery });
  // White lacquer frame; oak disappeared into the oak floor when I tried it.
  M.bedRail = M.bedRail || M.white;
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  root.scale.setScalar(0.001);
  scene.add(root);
  const resolved = resolveRoom(state.room);
  const room = buildRoom(state.room, M, resolved);
  root.add(room.group);
  const pieces = new THREE.Group();
  root.add(pieces);
  const piano = state.items?.find((i) => i.id === 'item-piano');
  pieces.add(buildPiano(piano, pianoPlace(variant), M));
  const platform = buildPlatform(variant, M);
  pieces.add(platform);
  pieces.add(buildBed(M, { flapOpen }));
  const image = buildImage(variant, M);
  if (image) pieces.add(image);
  platform.userData.setFold(fold);
  const tableNode = buildTable(M);
  pieces.add(tableNode);
  tableNode.userData.setTable(table);
  tableNode.userData.setCover(tableCover);
  tableNode.userData.setChair(tableChair);
  tableNode.userData.setTop(tableTop);

  // Dusk: shutters' worth of dim sky, no sun, the ceiling ring on. It is what the projector wall is for.
  const dusk = lighting === 'dusk';
  const sky = makeSky(dusk ? { sunRadiance: 0, skyGain: 0.09 } : {});
  sky.portalRadiance = dusk ? 0.1 : 3.2;
  M.ring.emissiveIntensity = dusk ? 4 : 1.6;
  M.spot.emissiveIntensity = dusk ? 3 : 0.5;
  M.image.emissiveIntensity = dusk ? 2.2 : 0.3;
  if (dusk && forPathTracer) {
    // The ring as a real light source too, since an emissive surface alone gets no direct sampling.
    const ring = new THREE.RectAreaLight(0xffe9cc, 14, 0.44, 0.44);
    ring.position.copy(P(1333, 2510, 2360));
    ring.lookAt(P(1333, 2510, 0));
    scene.add(ring);
  }
  scene.environment = sky.map;
  scene.background = sky.noSun;
  if (forPathTracer) {
    // A pane adds only a faint reflection, and costs convergence on every ray to the sun.
    room.group.traverse((o) => { if (o.userData.glass) o.visible = false; });
    // Sky portals: one area light filling each window hole, just outside the shutter curtain. Camera rays
    // pass through them to the painted sky; rays from inside a room find the window instead of a wall.
    for (const f of state.room.fixed.filter((x) => x.kind === 'window')) {
      const light = new THREE.RectAreaLight(0xe9f0ff, sky.portalRadiance, f.width / 1000, f.height / 1000);
      const y = f.offset + f.width / 2; const z = f.bottom + f.height / 2;
      light.position.copy(P(-240, y, z));
      light.lookAt(P(1000, y, z));
      scene.add(light);
    }
  }
  root.updateMatrixWorld(true);
  return { scene, root, room, platform, table: tableNode, materials: M, sky, resolved };
}

/** Named viewpoints in room mm: position, target, vertical field of view. */
export const VIEWS = {
  hero: { pos: [420, 1320, 1560], at: [2200, 3500, 1100], fov: 62, label: 'Seat from the piano end' },
  heroSouth: { pos: [260, 4560, 1500], at: [2350, 2850, 1080], fov: 62, label: 'Seat from the bed end' },
  foot: { pos: [430, 4400, 760], at: [2667, 4250, 1000], fov: 58, label: 'From the bed, looking at its foot' },
  under: { pos: [760, 2300, 420], at: [2400, 3100, 1540], fov: 62, label: 'Under the seat, from the floor' },
  windows: { pos: [2560, 880, 1520], at: [300, 3700, 1120], fov: 60, label: 'Toward the windows' },
  mirror: { pos: [1150, 3760, 1450], at: [1250, 300, 1150], fov: 56, label: 'Wardrobe and mirror' },
  flap: { pos: [1500, 3050, 240], at: [1900, 3819, 110], fov: 34, label: 'The flap in the bed edge' },
  box: { pos: [1500, 2450, 780], at: [2404, 3819, 800], fov: 52, label: 'Box: robot door and holds' },
  tableClosed: { pos: [1750, 1250, 1400], at: [520, 3050, 800], fov: 58, label: 'Table closed' },
  tableMid: { pos: [1900, 1050, 1380], at: [430, 2650, 760], fov: 62, label: 'Table sliding' },
  tableOpen: { pos: [1950, 1300, 1450], at: [430, 2250, 720], fov: 68, label: 'Table open, set up' },
  tableSet: { pos: [1440, 3660, 1250], at: [400, 2960, 770], fov: 54, label: 'Soldering set' },
  tableMech: { pos: [1560, 720, 1560], at: [430, 2150, 520], fov: 66, label: 'Mechanism, top lifted off' },
  tableLeg: { pos: [1560, 690, 330], at: [640, 1420, 400], fov: 66, label: 'Leg, brace and rollers' },
  tableLift: { pos: [1450, 2250, 1050], at: [330, 3100, 400], fov: 60, label: 'Lift, set stowed, server below' },
  tableRoom: { pos: [2180, 720, 1650], at: [1150, 3500, 760], fov: 72, label: 'Room: table, bed and platform' },
  tableRoomOpen: { pos: [2180, 720, 1650], at: [1000, 2800, 760], fov: 72, label: 'Room with the table open' },
};

export function setView(camera, name, overrides = {}) {
  const v = { ...VIEWS[name], ...overrides };
  camera.fov = v.fov;
  camera.position.copy(P(...v.pos));
  camera.up.set(0, 1, 0);
  camera.lookAt(P(...v.at));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return P(...v.at);
}
