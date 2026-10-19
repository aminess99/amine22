/** A font the editor offers, with the Google Fonts weights that exist for it. */
export interface FontDef {
  family: string;
  label: string;
  group: FontGroup;
  weights: number[];
}

export type FontGroup = 'modern' | 'bold' | 'kufi' | 'naskh' | 'hand' | 'latin';

export const FONT_GROUPS: { id: FontGroup; label: string }[] = [
  { id: 'modern', label: 'عصري' },
  { id: 'bold', label: 'عناوين عريضة' },
  { id: 'kufi', label: 'كوفي' },
  { id: 'naskh', label: 'نسخ وتقليدي' },
  { id: 'hand', label: 'رقعة وخط يد' },
  { id: 'latin', label: 'لاتيني' },
];

// Every family/weight pair here was checked against fonts.googleapis.com.
export const FONT_LIST: FontDef[] = [
  { family: 'Cairo', label: 'القاهرة', group: 'modern', weights: [400, 800] },
  { family: 'Tajawal', label: 'تجوال', group: 'modern', weights: [400, 800] },
  { family: 'Almarai', label: 'المراعي', group: 'modern', weights: [400, 800] },
  { family: 'Rubik', label: 'روبيك', group: 'modern', weights: [400, 800] },
  { family: 'Changa', label: 'تشانجا', group: 'modern', weights: [400, 800] },
  { family: 'Alexandria', label: 'الإسكندرية', group: 'modern', weights: [400, 800] },
  { family: 'Readex Pro', label: 'ريدكس', group: 'modern', weights: [400, 700] },
  { family: 'IBM Plex Sans Arabic', label: 'بلكس', group: 'modern', weights: [400, 700] },
  { family: 'Noto Sans Arabic', label: 'نوتو', group: 'modern', weights: [400, 800] },
  { family: 'Mada', label: 'مدى', group: 'modern', weights: [400, 900] },
  { family: 'Zain', label: 'زين', group: 'modern', weights: [400, 800] },
  { family: 'El Messiri', label: 'المسيري', group: 'modern', weights: [400, 700] },
  { family: 'Lemonada', label: 'ليمونادة', group: 'modern', weights: [400, 700] },
  { family: 'Baloo Bhaijaan 2', label: 'بالو', group: 'modern', weights: [400, 800] },
  { family: 'Playpen Sans Arabic', label: 'بلاي بن', group: 'modern', weights: [400, 800] },

  { family: 'Lalezar', label: 'لاله زار', group: 'bold', weights: [400] },
  { family: 'Rakkas', label: 'رقاص', group: 'bold', weights: [400] },
  { family: 'Jomhuria', label: 'جمهورية', group: 'bold', weights: [400] },
  { family: 'Blaka', label: 'بلاكا', group: 'bold', weights: [400] },
  { family: 'Vibes', label: 'فايبز', group: 'bold', weights: [400] },
  { family: 'Badeen Display', label: 'بديع', group: 'bold', weights: [400] },

  { family: 'Reem Kufi', label: 'ريم كوفي', group: 'kufi', weights: [400, 700] },
  { family: 'Reem Kufi Fun', label: 'ريم كوفي مرح', group: 'kufi', weights: [400, 700] },
  { family: 'Kufam', label: 'كوفام', group: 'kufi', weights: [400, 800] },
  { family: 'Noto Kufi Arabic', label: 'نوتو كوفي', group: 'kufi', weights: [400, 800] },
  { family: 'Qahiri', label: 'قاهري', group: 'kufi', weights: [400] },

  { family: 'Amiri', label: 'أميري', group: 'naskh', weights: [400, 700] },
  { family: 'Scheherazade New', label: 'شهرزاد', group: 'naskh', weights: [400, 700] },
  { family: 'Noto Naskh Arabic', label: 'نوتو نسخ', group: 'naskh', weights: [400, 700] },
  { family: 'Lateef', label: 'لطيف', group: 'naskh', weights: [400, 800] },
  { family: 'Harmattan', label: 'هرمتان', group: 'naskh', weights: [400, 700] },
  { family: 'Mirza', label: 'ميرزا', group: 'naskh', weights: [400, 700] },
  { family: 'Noto Nastaliq Urdu', label: 'نستعليق', group: 'naskh', weights: [400, 700] },

  { family: 'Aref Ruqaa', label: 'رقعة عارف', group: 'hand', weights: [400, 700] },
  { family: 'Katibeh', label: 'كاتبة', group: 'hand', weights: [400] },
  { family: 'Marhey', label: 'مرحى', group: 'hand', weights: [400, 700] },
  { family: 'Ruwudu', label: 'رودو', group: 'hand', weights: [400, 700] },
  { family: 'Alkalami', label: 'القلمي', group: 'hand', weights: [400] },

  { family: 'Anton', label: 'Anton', group: 'latin', weights: [400] },
  { family: 'Montserrat', label: 'Montserrat', group: 'latin', weights: [400, 800] },
  { family: 'Playfair Display', label: 'Playfair', group: 'latin', weights: [400, 700] },
  { family: 'Cinzel', label: 'Cinzel', group: 'latin', weights: [400, 700] },
  { family: 'Inter', label: 'Inter', group: 'latin', weights: [400, 800] },
  { family: 'Roboto', label: 'Roboto', group: 'latin', weights: [400, 700] },
];

export const FONT_FAMILIES = FONT_LIST.map((f) => f.family);

/** Stylesheet load per family, so later calls wait for the same request. */
const requested = new Map<string, Promise<void>>();

/** Adds the Google Fonts stylesheet for these families (once each) and resolves when it has loaded. */
function requestStylesheets(families: string[]): Promise<unknown> {
  const fresh = families.filter((f) => !requested.has(f));
  if (fresh.length) {
    const loaded = new Promise<void>((resolve) => {
      const query = fresh
        .map((f) => {
          const def = FONT_LIST.find((d) => d.family === f);
          const name = f.replace(/ /g, '+');
          return def ? `family=${name}:wght@${def.weights.join(';')}` : `family=${name}`;
        })
        .join('&');
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
      link.onload = link.onerror = () => resolve();
      document.head.appendChild(link);
    });
    fresh.forEach((f) => requested.set(f, loaded));
  }
  return Promise.all(families.map((f) => requested.get(f)));
}

/** Loads fonts on demand: fetches their stylesheet, then waits for the faces canvas text needs. */
export async function ensureFonts(families: string[]) {
  const list = [...new Set(families.filter(Boolean))];
  if (!list.length || typeof document === 'undefined' || !document.fonts) return;
  await requestStylesheets(list);
  await Promise.all(
    list.flatMap((f) => [
      document.fonts.load(`400 40px "${f}"`, 'أبجد Ab').catch(() => []),
      document.fonts.load(`800 40px "${f}"`, 'أبجد Ab').catch(() => []),
    ])
  );
}
