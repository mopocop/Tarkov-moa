import { useEffect, useRef } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { getGameToLatLng, getMapDef } from './MapView';

export interface PlayerMarkerProps {
  position: { x: number; y: number; z: number; rotation: number } | null;
  mapId: string;
}

const PLAYER_ICON = L.divIcon({
  className: 'tc-player-marker',
  html: '<div class="tc-player-arrow"></div>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

export default function PlayerMarker({ position, mapId }: PlayerMarkerProps) {
  const markerRef = useRef<L.Marker | null>(null);
  const toLatLng = getGameToLatLng(mapId);
  // The custom CRS bakes the map's coordinateRotation into project/unproject,
  // so marker *positions* are already rotated. The heading arrow, however, is a
  // plain screen-space CSS rotate() that bypasses the CRS — so it must add the
  // same map rotation by hand, else it reads 180° off on every current map.
  const mapRotation = getMapDef(mapId)?.rotation ?? 0;

  useEffect(() => {
    const el = markerRef.current?.getElement();
    if (!el || position == null) return;
    const arrow = el.querySelector<HTMLElement>('.tc-player-arrow');
    if (!arrow) return;
    arrow.style.transform = `rotate(${position.rotation + mapRotation}deg)`;
  }, [position, mapRotation]);

  if (position == null || toLatLng == null) return null;
  // Player position uses the exact same un-negated pipeline as quest/POI/custom
  // markers (toLatLng(x, z) → CRS handles rotation/scale/margin). The CRS
  // already applies the map's 180° rotation; the previous code negated x/z on
  // top of that, applying a *second* point reflection that threw the player to
  // the opposite side of the map. Dropping the negation puts the player in the
  // same frame as every other marker layer.
  const latLng = toLatLng(position.x, position.z);

  return (
    <Marker
      ref={(m) => {
        markerRef.current = m;
      }}
      position={latLng}
      icon={PLAYER_ICON}
      interactive={false}
      keyboard={false}
      zIndexOffset={1000}
    />
  );
}