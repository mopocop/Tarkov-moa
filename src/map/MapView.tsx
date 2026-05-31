import React, { useMemo } from "react";
import { MapContainer, ImageOverlay } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapFloor } from "./floorClassify";
import { normalizeBounds } from "./floorClassify";
import { canonicalMapId } from "./canonicalMap";
import FloorVisualOverlay from "./FloorVisualOverlay";
import { ALL_FLOORS } from "./FloorSwitcher";

export type { MapFloor } from "./floorClassify";

interface MapDef {
  svgUrl: string;
  // tarkov-dev maps.json bounds: each corner is [gameX, gameZ]. We swap to
  // [gameZ, gameX] = Leaflet [lat, lng] (matching the marker convention) before
  // handing to Leaflet — same as tarkov-dev's getBounds() helper.
  boundsRaw: [[number, number], [number, number]];
  // tarkov-dev maps.json transform: [scaleX, marginX, scaleZ, marginZ]
  transform: [number, number, number, number];
  // tarkov-dev maps.json coordinateRotation, in degrees.
  rotation: number;
  // Optional. If present, multi-floor mode: the FloorSwitcher appears and
  // markers are classified into floors by (x, y, z) via floorClassify. The
  // visual SVG is NOT swapped per floor in v0.2 (tarkov-dev's per-floor visuals
  // require tile pyramids — see plan delegated-twirling-lighthouse.md).
  floors?: MapFloor[];
}

// Customs floor data sourced verbatim from:
// https://github.com/the-hideout/tarkov-dev/blob/master/src/data/maps.json
// Order: 4F → 3F → 2F → Underground → Ground (no extents = catch-all).
// First-match wins when extents overlap, so upper floors come first.
const CUSTOMS_FLOORS: MapFloor[] = [
  {
    id: "4f",
    name: "4F",
    extents: [
      {
        heightMin: 11.2,
        heightMax: 54.7,
        bounds: [normalizeBounds([279, -79], [246, -1.4])],
        regions: ["oilrig & panda"],
      },
    ],
  },
  {
    id: "3f",
    name: "3F",
    svgLayerId: "Third_Floor",
    extents: [
      {
        heightMin: 5.7,
        heightMax: 1000,
        bounds: [normalizeBounds([243, 190], [165, 125])],
        regions: ["dorms"],
      },
      {
        heightMin: 7.7,
        heightMax: 11.3,
        bounds: [normalizeBounds([73, -73], [22, -38])],
        regions: ["warehouse 17"],
      },
      {
        heightMin: 6.7,
        heightMax: 11.6,
        bounds: [normalizeBounds([126, -64], [88, -35])],
        regions: ["boiler"],
      },
      {
        heightMin: 8.0,
        heightMax: 11.1,
        bounds: [normalizeBounds([279, -79], [246, -1.4])],
        regions: ["oilrig & panda"],
      },
    ],
  },
  {
    id: "2f",
    name: "2F",
    svgLayerId: "Second_Floor",
    extents: [
      {
        heightMin: 2.7,
        heightMax: 6.5,
        bounds: [
          normalizeBounds([243, 190], [165, 125]),
          normalizeBounds([116, -83], [72, -170]),
          normalizeBounds([356, -30], [341, -84]),
          normalizeBounds([334, -52], [321, -59]),
          normalizeBounds([589, 10], [577, -1]),
          normalizeBounds([580, -104], [532, -134]),
          normalizeBounds([625, -120], [599, -139]),
        ],
        regions: [
          "dorms",
          "mechanic",
          "switch 2nd",
          "switch 2nd",
          "scav checkpoint",
          "dead scav warehouse",
          "pump 2nd",
        ],
      },
      {
        heightMin: 5.7,
        heightMax: 1000,
        bounds: [
          normalizeBounds([580, -104], [532, -134]),
          normalizeBounds([-199, -90], [-223, -131]),
          normalizeBounds([239, 3], [169, -160]),
          normalizeBounds([336, -56], [316, -95]),
          normalizeBounds([584, -46], [556, -92]),
          normalizeBounds([93, 0], [65, -22]),
        ],
        regions: [
          "dead scav warehouse",
          "big red 2nd",
          "skeleton",
          "switch snipe",
          "USEC 2nd",
          "construction 2nd",
        ],
      },
      {
        heightMin: 14,
        heightMax: 15,
        bounds: [normalizeBounds([497, -44], [450, -90])],
        regions: ["chemical warehouse sniper scav"],
      },
      {
        heightMin: 3.9,
        heightMax: 7.6,
        bounds: [normalizeBounds([73, 57], [22, -38])],
        regions: ["warehouse 17"],
      },
      {
        heightMin: 4.4,
        heightMax: 6.5,
        bounds: [normalizeBounds([119, -57], [100, -42])],
        regions: ["boiler"],
      },
      {
        heightMin: 4.6,
        heightMax: 7.9,
        bounds: [normalizeBounds([279, -79], [246, -1.4])],
        regions: ["oilrig & panda"],
      },
    ],
  },
  {
    id: "underground",
    name: "Underground",
    svgLayerId: "Underground_Level",
    extents: [
      {
        heightMin: -1000,
        heightMax: 0.5,
        bounds: [
          normalizeBounds([635, -137], [620, -125]),
          normalizeBounds([473, -122], [458, -110]),
          normalizeBounds([314, -173], [308, -184]),
          normalizeBounds([349, -88], [323, -32]),
          normalizeBounds([219, -158], [193, -137]),
          normalizeBounds([122, -61], [88, -40]),
        ],
        regions: [
          "zb-1011",
          "zb-1012",
          "old gas",
          "switch basement",
          "zb-013",
          "boiler room",
        ],
      },
    ],
  },
  { id: "ground", name: "Ground" },
];

// Interchange — height-only floors (no per-extent bounds in tarkov-dev data).
// Upper floors first (first-match-wins); Ground has no svgLayerId so the base
// is never dimmed.
const INTERCHANGE_FLOORS: MapFloor[] = [
  {
    id: "3f",
    name: "3rd Floor",
    svgLayerId: "Second_Floor",
    extents: [
      { heightMin: 34, heightMax: 1000, bounds: [normalizeBounds([120, 218], [-222, -327])], regions: ["mall"] },
    ],
  },
  {
    id: "2f",
    name: "2nd Floor",
    svgLayerId: "First_Floor",
    extents: [
      { heightMin: 25, heightMax: 34, bounds: [normalizeBounds([120, 218], [-222, -327])], regions: ["mall"] },
    ],
  },
  { id: "ground", name: "Ground" },
];

// Reserve — only "Bunkers" has an SVG group; the upper floors (2F–5F) classify
// markers by (x,y,z) but have no visual overlay (svgLayer: None in source).
const RESERVE_FLOORS: MapFloor[] = [
  {
    id: "bunkers",
    name: "Bunkers",
    svgLayerId: "Bunkers",
    extents: [
      { heightMin: -10000, heightMax: -7.27, bounds: [normalizeBounds([128, -208], [18, -33]), normalizeBounds([-46, -42], [-176, 127])], regions: ["storage bunker", "command bunkers"] },
      { heightMin: -10000, heightMax: -12, bounds: [normalizeBounds([-40, 124], [-124, 189])], regions: ["D2"] },
      { heightMin: -10000, heightMax: 18, bounds: [normalizeBounds([23, 173], [-65, 189])], regions: ["dome tunnels"] },
      { heightMin: -7.27, heightMax: -3.2, bounds: [normalizeBounds([74, -196], [19, -149])], regions: ["bunker hermetic door bunkers"] },
      { heightMin: -11, heightMax: -4.6, bounds: [normalizeBounds([-246, -79], [-274, -53]), normalizeBounds([238, -26], [126, 45])], regions: ["E1 bunkers", "bunkers"] },
    ],
  },
  {
    id: "2f",
    name: "2nd Floor",
    extents: [
      { heightMin: 22.1, heightMax: 25.7, bounds: [normalizeBounds([1, 164], [-17, 199])], regions: ["dome"] },
      { heightMin: -3.5, heightMax: -0.64, bounds: [normalizeBounds([-77, 26], [-177, 106]), normalizeBounds([62, 59], [51, 108])], regions: ["pawns", "checkpoint fence tower"] },
      { heightMin: -3.5, heightMax: -0.64, bounds: [normalizeBounds([-104, -37], [-177, 5])], regions: ["black bishop"] },
      { heightMin: -3.9, heightMax: -0.6, bounds: [normalizeBounds([-47, -47], [-85, -18])], regions: ["white bishop"] },
      { heightMin: -4.3, heightMax: -2.2, bounds: [normalizeBounds([-19.91, -13], [-78, 39])], regions: ["white king"] },
      { heightMin: -3.8, heightMax: -1.1, bounds: [normalizeBounds([99, -50], [-2, 7])], regions: ["knights"] },
      { heightMin: -1.9, heightMax: 11.3, bounds: [normalizeBounds([191, -175], [137, -120])], regions: ["train depot"] },
      { heightMin: 1, heightMax: 8, bounds: [normalizeBounds([-109, -156], [-119, -147]), normalizeBounds([289, -92], [299, -82]), normalizeBounds([3, -210], [-7, -200]), normalizeBounds([195, -260], [185, -250]), normalizeBounds([276, 17], [266, 27])], regions: ["towers", "towers", "towers", "towers", "towers"] },
      { heightMin: -4.1, heightMax: -1.2, bounds: [normalizeBounds([-128, -139], [-146, -120])], regions: ["scav lands"] },
    ],
  },
  {
    id: "3f",
    name: "3rd Floor",
    extents: [
      { heightMin: 25.7, heightMax: 29.3, bounds: [normalizeBounds([1, 164], [-17, 199])], regions: ["dome"] },
      { heightMin: -0.64, heightMax: 2.23, bounds: [normalizeBounds([-77, 26], [-177, 106])], regions: ["pawns"] },
      { heightMin: -0.64, heightMax: 2.23, bounds: [normalizeBounds([-104, -37], [-177, 5])], regions: ["black bishop"] },
      { heightMin: -0.6, heightMax: 10, bounds: [normalizeBounds([-47, -47], [-85, -18])], regions: ["white bishop"] },
      { heightMin: -2.2, heightMax: 2.14, bounds: [normalizeBounds([-19.91, -13], [-78, 39])], regions: ["white king"] },
      { heightMin: -1.1, heightMax: 1.6, bounds: [normalizeBounds([99, -50], [-2, 7])], regions: ["knights"] },
    ],
  },
  {
    id: "4f",
    name: "4th Floor",
    extents: [
      { heightMin: 29.3, heightMax: 36, bounds: [normalizeBounds([1, 164], [-17, 199])], regions: ["dome"] },
      { heightMin: 2.23, heightMax: 5, bounds: [normalizeBounds([-77, 26], [-177, 106])], regions: ["pawns"] },
      { heightMin: 2.15, heightMax: 6.6, bounds: [normalizeBounds([-19.91, -13], [-78, 39])], regions: ["white king"] },
      { heightMin: 1.6, heightMax: 4.7, bounds: [normalizeBounds([99, -50], [-2, 7])], regions: ["knights"] },
    ],
  },
  {
    id: "5f",
    name: "5th Floor",
    extents: [
      { heightMin: 5, heightMax: 9.5, bounds: [normalizeBounds([-77, 26], [-177, 106])], regions: ["pawns"] },
    ],
  },
  { id: "ground", name: "Ground" },
];

const GROUND_ZERO_DEF: MapDef = {
  svgUrl: "https://assets.tarkov.dev/maps/svg/GroundZero.svg",
  boundsRaw: [
    [249, -124],
    [-99, 364],
  ],
  transform: [0.524, 167.3, 0.524, 65.1],
  rotation: 180,
};

export const MAPS: Record<string, MapDef> = {
  // Customs — keyed by tarkov.dev's Map.id.
  "56f40101d2720b2a4d8b45d6": {
    svgUrl: "https://assets.tarkov.dev/maps/svg/Customs.svg",
    boundsRaw: [
      [698, -307],
      [-372, 237],
    ],
    transform: [0.239, 168.65, 0.239, 136.35],
    rotation: 180,
    floors: CUSTOMS_FLOORS,
  },
  // Woods — keyed by tarkov.dev's Map.id (via GraphQL: maps{id normalizedName}).
  "5704e3c2d2720bac5b8b4567": {
    svgUrl: "https://assets.tarkov.dev/maps/svg/Woods.svg",
    boundsRaw: [
      [646, -914],
      [-761, 442],
    ],
    transform: [0.1855, 112.95, 0.1855, 167.85],
    rotation: 180,
  },
  // Interchange — values verbatim from tarkov-dev maps.json (2026-05-29).
  "5714dbc024597771384a510d": {
    svgUrl: "https://assets.tarkov.dev/maps/svg/Interchange.svg",
    boundsRaw: [
      [598, -442],
      [-433, 426],
    ],
    transform: [0.265, 150.6, 0.265, 134.6],
    rotation: 180,
    floors: INTERCHANGE_FLOORS,
  },
  // Factory — values verbatim from tarkov-dev maps.json. NOTE rotation 90 (not
  // 180 like the others). Night Factory shares this map; canonicalMap.ts routes
  // its UUID here.
  "55f2d3fd4bdc2d5f408b4567": {
    svgUrl: "https://assets.tarkov.dev/maps/svg/Factory.svg",
    boundsRaw: [
      [77, -64.5],
      [-65.5, 67.4],
    ],
    transform: [1.629, 119.9, 1.629, 139.3],
    rotation: 90,
  },
  // Lighthouse.
  "5704e4dad2720bb55b8b4567": {
    svgUrl: "https://assets.tarkov.dev/maps/svg/Lighthouse.svg",
    boundsRaw: [
      [515, -998],
      [-545, 725],
    ],
    transform: [0.2, 0, 0.2, 0],
    rotation: 180,
  },
  // Shoreline.
  "5704e554d2720bac5b8b456e": {
    svgUrl: "https://assets.tarkov.dev/maps/svg/Shoreline.svg",
    boundsRaw: [
      [504, -415],
      [-1056, 618],
    ],
    transform: [0.16, 83.2, 0.16, 111.1],
    rotation: 180,
  },
  // Reserve.
  "5704e5fad2720bac5b8b4567": {
    svgUrl: "https://assets.tarkov.dev/maps/svg/Reserve.svg",
    boundsRaw: [
      [289, -293],
      [-303, 244],
    ],
    transform: [0.395, 122.0, 0.395, 137.65],
    rotation: 180,
    floors: RESERVE_FLOORS,
  },
  // Streets of Tarkov.
  "5714dc692459777137212e12": {
    svgUrl: "https://assets.tarkov.dev/maps/svg/StreetsOfTarkov.svg",
    boundsRaw: [
      [323, -295],
      [-280, 532],
    ],
    transform: [0.38, 0, 0.38, 0],
    rotation: 180,
  },
  // The Lab. NOTE rotation 270. maps.json carries no svgPath for Labs, but the
  // asset exists at the standard path (Labs.svg).
  "5b0fc42d86f7744a585f9105": {
    svgUrl: "https://assets.tarkov.dev/maps/svg/Labs.svg",
    boundsRaw: [
      [-80, -477],
      [-287, -193],
    ],
    transform: [0.575, 281.2, 0.575, 193.7],
    rotation: 270,
  },
  // Terminal (newer location).
  "6925a2c38bdebd9e2302692e": {
    svgUrl: "https://assets.tarkov.dev/maps/svg/Terminal.svg",
    boundsRaw: [
      [463, -580],
      [-433, 475],
    ],
    transform: [0.2, 0, 0.2, 0],
    rotation: 180,
  },
  // Ground Zero — single canonical entry. Ground Zero 21+ and Ground Zero
  // Tutorial are the same physical map (split only by quest pool / level gate);
  // canonicalMap.ts routes their UUIDs here, so they need no separate key.
  "653e6760052c01c1c805532f": GROUND_ZERO_DEF,
};

export function getMapDef(mapId: string): MapDef | undefined {
  return MAPS[canonicalMapId(mapId)];
}

// Display names for every map the app can render. Used by the map picker so QA
// can select a supported map even when it has zero active quests (the quest
// data carries names, but empty maps have none). Order here is the picker's
// fallback order. Ground Zero 21+ shares the base GZ visual but a different
// quest pool, so it's listed separately.
// Keyed by CANONICAL map id only — one row per physical map. Variant UUIDs
// (GZ 21+, GZ Tutorial, Night Factory) resolve here via canonicalMap.ts.
export const SUPPORTED_MAP_NAMES: Record<string, string> = {
  "56f40101d2720b2a4d8b45d6": "Customs",
  "5704e3c2d2720bac5b8b4567": "Woods",
  "5714dbc024597771384a510d": "Interchange",
  "55f2d3fd4bdc2d5f408b4567": "Factory",
  "5704e4dad2720bb55b8b4567": "Lighthouse",
  "5704e554d2720bac5b8b456e": "Shoreline",
  "5704e5fad2720bac5b8b4567": "Reserve",
  "5714dc692459777137212e12": "Streets of Tarkov",
  "5b0fc42d86f7744a585f9105": "The Lab",
  "6925a2c38bdebd9e2302692e": "Terminal",
  "653e6760052c01c1c805532f": "Ground Zero",
};

function leafletBounds(def: MapDef): L.LatLngBoundsLiteral {
  const [a, b] = def.boundsRaw;
  return [
    [a[1], a[0]],
    [b[1], b[0]],
  ];
}

function applyRotationLL(latLng: L.LatLng, rotation: number): L.LatLng {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x = latLng.lng;
  const y = latLng.lat;
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;
  return L.latLng(ry, rx);
}

function makeCRS(def: MapDef): L.CRS {
  const [tScaleX, tMarginX, tScaleZ, tMarginY] = def.transform;
  const scaleX = tScaleX;
  const scaleY = tScaleZ * -1;
  const rotation = def.rotation;

  // Wrap LonLat to apply rotation in/out of the projection step.
  const lonlat = L.Projection.LonLat;
  const projection: L.Projection = {
    bounds: lonlat.bounds,
    project: (latLng: L.LatLng) => lonlat.project(applyRotationLL(latLng, rotation)),
    unproject: (point: L.Point) =>
      applyRotationLL(lonlat.unproject(point), -rotation),
  };

  return L.Util.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(scaleX, tMarginX, scaleY, tMarginY),
    projection,
  }) as L.CRS;
}

// In our custom CRS markers are placed at L.latLng(gameZ, gameX) — raw game
// coords. The CRS pipeline handles rotation + scale + margin.
export function getGameToLatLng(
  mapId: string,
): ((x: number, z: number) => [number, number]) | null {
  if (!MAPS[canonicalMapId(mapId)]) return null;
  return (gx, gz) => [gz, gx];
}

// Inverse of getGameToLatLng: markers sit at [gameZ, gameX], so a clicked
// latLng maps back as x = lng, z = lat. The CRS rotation/scale is handled by
// Leaflet between latLng and pixels — transparent here. Used by custom-marker
// placement (click-to-place) and grid-cell lookup.
export function getLatLngToGame(
  mapId: string,
): ((lat: number, lng: number) => { x: number; z: number }) | null {
  if (!MAPS[canonicalMapId(mapId)]) return null;
  return (lat, lng) => ({ x: lng, z: lat });
}

interface MapViewProps {
  mapId: string;
  mapName: string;
  // Current floor (from FloorSwitcher / player auto-follow). Drives which SVG
  // floor group is raised vs dimmed. Defaults to ALL_FLOORS (show everything).
  activeFloorId?: string;
  children?: React.ReactNode;
}

export default function MapView({
  mapId,
  mapName,
  activeFloorId = ALL_FLOORS,
  children,
}: MapViewProps): React.JSX.Element {
  const def = MAPS[canonicalMapId(mapId)];
  const crs = useMemo(() => (def ? makeCRS(def) : null), [def]);

  if (!def || !crs) {
    return (
      <div className="map-placeholder">
        Map "{mapName}" not yet supported in v0.1. Customs only for now.
      </div>
    );
  }

  const bounds = leafletBounds(def);

  return (
    <MapContainer
      key={mapId}
      crs={crs}
      bounds={bounds}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={true}
      // Inertia adds a momentum glide after each drag-release that reads as
      // "sluggish" panning — off so the map stops exactly when the mouse does.
      inertia={false}
      minZoom={-3}
      maxZoom={7}
      // Fractional zoom steps: each scroll notch changes zoom by 0.25 instead of
      // a whole level, so the (animation-free) reflow is small and reads as a
      // quick ease rather than a hard jump. Paired with a CSS transition on the
      // map panes (.leaflet-map-pane/.leaflet-overlay-pane — see App.css).
      zoomSnap={0.25}
      zoomDelta={0.25}
      wheelPxPerZoomLevel={120}
      // Our custom CRS bakes a rotation into project/unproject. Leaflet's
      // animated zoom interpolates layer positions with a CSS transform that
      // assumes an un-rotated transform, so the map visibly drifts mid-zoom and
      // snaps back on zoomend. Disabling zoom animation makes it reflow directly
      // to the correct frame — no flicker. (markerZoomAnimation off for the same
      // reason on the marker pane.)
      zoomAnimation={false}
      markerZoomAnimation={false}
    >
      {def.floors?.some((f) => f.svgLayerId) ? (
        <FloorVisualOverlay
          svgUrl={def.svgUrl}
          bounds={bounds}
          floors={def.floors}
          activeFloorId={activeFloorId}
        />
      ) : (
        <ImageOverlay url={def.svgUrl} bounds={bounds} />
      )}
      {children}
    </MapContainer>
  );
}
