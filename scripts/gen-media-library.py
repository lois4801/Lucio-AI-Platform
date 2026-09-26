#!/usr/bin/env python3
"""Batch-generate Lucio's luxury media library into data/media/ (4K heroes + gallery art).

Usage: python scripts/gen-media-library.py [heroes|textures|all]
Skips keys that already exist. Converts PNG to optimized web JPG.
"""
import concurrent.futures as cf
import os
import sys
import urllib.request
from pathlib import Path

PLUGIN_ROOT = Path(os.environ.get(
    'LUCIO_IMAGE_TOOL_ROOT',
    r'C:/Users/USER/AppData/Roaming/kimi-desktop/daimon-share/daimon/runtime/kimi-code/home/plugins/managed/image_generation',
))
sys.path.insert(0, str(PLUGIN_ROOT / 'scripts'))
import image_generation_tool as igt  # noqa: E402

MEDIA_DIR = Path(__file__).resolve().parent.parent / 'data' / 'media'
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

LUX = ("Ultra-premium luxury brand editorial photograph, cinematic lighting, rich color grading, "
       "high-end commercial photography, crisp 4k detail, no text, no watermark, no people facing camera: ")

HEROES = {
    'hero-dining': LUX + "elegant restaurant interior at dusk, warm pendant lighting, marble and brass, wine glasses glinting, intimate luxurious atmosphere",
    'hero-trade': LUX + "premium plumbing and mechanical craftsmanship, polished copper pipes and fixtures against dark slate, dramatic rim lighting, luxurious industrial aesthetic",
    'hero-beauty': LUX + "high-end salon and spa interior, rose gold accents, velvet chairs, soft diffused daylight, orchids, serene luxury",
    'hero-clinic': LUX + "modern luxury dental clinic, pristine white interior with warm oak, designer lighting, calm premium healthcare atmosphere",
    'hero-fitness': LUX + "boutique luxury gym at night, dramatic moody lighting, black steel and walnut, premium equipment, cinematic haze",
    'hero-professional': LUX + "executive law office at golden hour, floor-to-ceiling windows, marble desk, leather and walnut, city skyline bokeh",
    'hero-retail': LUX + "luxury boutique retail interior, backlit shelves, polished concrete and brass, curated products, warm spotlights",
    'hero-hospitality': LUX + "boutique hotel lounge at evening, sculptural chandelier, velvet and marble, warm amber glow, cinematic depth",
    'hero-industrial': LUX + "premium architectural materials artfully arranged, slate and cedar samples, dramatic low sunlight, editorial still life",
    'hero-craft': LUX + "artisan woodworking studio, hand tools and walnut grain in warm window light, sawdust motes, heritage craftsmanship",
    'hero-wellness': LUX + "tranquil spa interior, natural stone basin, soft steam, bamboo accents, candles, calm premium atmosphere",
    'hero-automotive': LUX + "premium auto detailing studio, gleaming classic car under studio spotlights, dark polished floor, reflections",
}

# Alternate heroes — give same-industry sites distinct pictures (seeded selection).
ALTERNATES = {
    'hero-dining-2': LUX + "moody chef's table dining room, open kitchen fire glow, dark timber and leather, candlelit luxury restaurant at night",
    'hero-dining-3': LUX + "artisan patisserie counter, croissants and layered cakes under warm display light, marble and brass interior, elegant cafe-bakery atmosphere",
    'hero-trade-2': LUX + "master tradesperson's bench, gleaming chrome wrenches and brass fittings on dark walnut, workshop jewel lighting, precision tools still life",
    'hero-beauty-2': LUX + "luxury barbershop lounge, emerald velvet chairs, brass-framed mirrors, marble counters, warm Edison bulb glow",
    'hero-clinic-2': LUX + "serene physiotherapy studio, warm minimal interior, treatment table with linen, soft morning light through sheer curtains",
    'hero-retail-2': LUX + "high-end florist boutique interior, dramatic flower wall, brass shelving, marble floor, warm gallery spotlights",
    'hero-professional-2': LUX + "modern accountant's office at dawn, walnut conference table, soft fog outside floor-to-ceiling glass, muted sage and brass palette",
    'hero-hospitality-2': LUX + "boutique inn bedroom suite at twilight, layered linen bedding, reading lamps, garden view through tall windows, calm luxury",
    'hero-fitness-2': LUX + "private training studio, sunrise light across maple floor, premium kettlebells and ropes neatly arranged, plants, airy premium athletic space",
}

TEXTURES = {
    'gallery-marble': LUX + "macro of white calacatta marble with gold veining, soft studio light, luxury material study",
    'gallery-aurora': LUX + "abstract aurora light ribbons over dark navy, silky long-exposure gradients, premium digital art",
    'gallery-organic': LUX + "macro botanical emerald leaves with dewdrops, dark moody background, luxury nature editorial",
    'gallery-urban': LUX + "moody city architecture at blue hour, geometric facades, rain-slick reflections, cinematic",
    'gallery-gold': LUX + "liquid gold and ink swirling macro, dramatic dark background, opulent abstract",
    'gallery-wood': LUX + "macro walnut wood grain with oil finish, warm raking light, luxury material texture",
}


def generate(item):
    key, prompt = item
    out = MEDIA_DIR / f'{key}.jpg'
    if out.exists():
        return key, 'cached'
    tmp = MEDIA_DIR / f'{key}.png'
    try:
        client_cls, _ = igt._client_cls()
        with client_cls(timeout=300) as client:
            resp = client.tools.generate_image(
                prompt, size='3840x2160' if key.startswith('hero-') else '2048x2048',
                background=igt.BACKGROUND_ENUM['opaque'], reference_image_urls=None,
                version=igt.IMAGE_GENERATION_VERSION, timeout=300,
            )
            url, mime = igt._media_url_and_mime(resp)
        if not url:
            return key, 'no-media-url'
        urllib.request.urlretrieve(url, tmp)
        from PIL import Image
        img = Image.open(tmp).convert('RGB')
        img.save(out, quality=82, optimize=True)
        tmp.unlink(missing_ok=True)
        return key, f'ok {out.stat().st_size // 1024}KB'
    except Exception as e:  # noqa: BLE001
        tmp.unlink(missing_ok=True)
        return key, f'FAIL {e}'


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    items = []
    if which in ('heroes', 'all'):
        items += list(HEROES.items())
    if which in ('alternates', 'all'):
        items += list(ALTERNATES.items())
    if which in ('textures', 'all'):
        items += list(TEXTURES.items())
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for key, status in ex.map(generate, items):
            print(f'{key}: {status}', flush=True)


if __name__ == '__main__':
    main()
