import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { createKeylessMap, geocodeQuery } from '../lib/keylessMap';

// Keyless live location map — geocodes a place name via the server-side
// Nominatim proxy and renders it on the shared OSM tile layer. No API keys.
// Degrades to a quiet note when offline or the place can't be resolved.
export default function KeylessLocationMap({ query, label, dark = false, height = 'h-64' }: { query: string; label?: string; dark?: boolean; height?: string }) {
  const [mapId] = useState(() => `klm-${Math.random().toString(36).slice(2, 9)}`);
  const mapRef = useRef<{ remove: () => void } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [resolved, setResolved] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Yield first so the loading reset never runs synchronously in the effect.
      await Promise.resolve();
      if (cancelled) return;
      setStatus('loading');
      const geo = await geocodeQuery(query).catch(() => null);
      if (cancelled) return;
      if (!geo) { setStatus('unavailable'); return; }
      setResolved(geo.displayName || query);
      const map = await createKeylessMap(mapId, {
        center: [geo.lat, geo.lng],
        zoom: 13,
        dark,
        marker: { lat: geo.lat, lng: geo.lng, label: label || query },
      });
      if (cancelled) { map?.remove(); return; }
      if (!map) { setStatus('unavailable'); return; }
      mapRef.current = map;
      setStatus('ready');
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [query, label, dark]);

  return (
    <div className={`relative w-full ${height} overflow-hidden rounded-xl border bg-muted/30`}>
      <div id={mapId} className="h-full w-full" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Locating “{query}” on the live map…</div>
      )}
      {status === 'unavailable' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground px-4 text-center">
          <MapPin className="h-4 w-4" />
          <span>Live map unavailable for “{query}” — check your connection (keyless OpenStreetMap).</span>
        </div>
      )}
      {status === 'ready' && resolved && (
        <div className="absolute bottom-1 left-2 z-[500] rounded bg-background/85 px-2 py-0.5 text-[10px] text-muted-foreground pointer-events-none">
          {resolved} · live OpenStreetMap · no API key
        </div>
      )}
    </div>
  );
}
