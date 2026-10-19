import {
  ASPECT_SIZES,
  CAPTION_STYLES,
  CLIP_ANIMS,
  EFFECTS,
  FILTER_PRESETS,
  MOTION_PRESETS,
  SPEED_CURVES,
  TEXT_PRESETS,
  TRANSITIONS,
} from './constants';

/** Clip numbers (1-based, as listed in the context) or every clip. */
export type ClipTarget = number[] | 'all';

/** One editing step the model can ask for. Times are timeline seconds. */
export type EditAction =
  | { op: 'delete_range'; start: number; end: number }
  | { op: 'split'; time: number }
  | { op: 'delete_clip'; clips: ClipTarget }
  | { op: 'move_clip'; clip: number; to: number }
  | { op: 'duplicate_clip'; clip: number }
  | { op: 'speed'; clips: ClipTarget; speed: number }
  | { op: 'clip_volume'; clips: ClipTarget; volume?: number; muted?: boolean }
  | { op: 'audio_volume'; audios: ClipTarget; volume?: number; fade_in?: number; fade_out?: number }
  | { op: 'filter'; clips: ClipTarget; filter: string }
  | {
      op: 'adjust';
      clips: ClipTarget;
      brightness?: number;
      contrast?: number;
      saturation?: number;
      warmth?: number;
      vignette?: number;
      blur?: number;
    }
  | { op: 'transition'; cuts: ClipTarget; type: string; duration?: number }
  | { op: 'clip_anim'; clips: ClipTarget; in?: string; out?: string; duration?: number }
  | { op: 'effect'; clips: ClipTarget; effect: string | null; intensity?: number }
  | { op: 'motion'; clips: ClipTarget; preset: string | null }
  | { op: 'speed_curve'; clips: ClipTarget; curve: string | null }
  | { op: 'transform'; clips: ClipTarget; zoom?: number; rotation?: number; fit?: 'contain' | 'cover'; flip_h?: boolean; flip_v?: boolean }
  | { op: 'aspect'; aspect: string }
  | { op: 'background'; color: string }
  | { op: 'add_text'; text: string; start: number; duration?: number; preset?: string; y?: number; color?: string }
  | { op: 'delete_texts'; texts: ClipTarget }
  | { op: 'generate_captions'; style?: string; words_per_line?: number; emoji?: boolean }
  | { op: 'caption_style'; style: string }
  | { op: 'caption_position'; y: number }
  | { op: 'caption_size'; percent: number }
  | { op: 'caption_emoji'; on: boolean }
  | { op: 'delete_captions' }
  | { op: 'remove_silence'; clips: ClipTarget }
  | { op: 'seek'; time: number }
  | { op: 'play' }
  | { op: 'export' };

export interface CommandResponse {
  /** Short Arabic reply shown to the user. */
  reply: string;
  actions: EditAction[];
}

const ids = (list: { id: string; label: string }[]) => list.map((x) => `${x.id} (${x.label})`).join(', ');

/** System prompt for the editing-command model, built from the editor's own presets. */
export function commandSystemPrompt(): string {
  return `You control a mobile video editor (like CapCut). The user writes a command, usually in Arabic (any dialect).
Turn it into editing actions. Reply with ONLY a JSON object: {"reply": "...", "actions": [...]}.
"reply" is one short sentence in the user's language describing what will happen, or asking for what is missing / explaining what is not possible (then actions is []).

The project context is JSON: clips are on the main track, numbered from 1 in play order, with timeline start/end in seconds. "cut" N is the transition INTO clip N (between clip N-1 and N; cut 1 does nothing). Audio tracks and texts are numbered from 1 too. "captions" are word-timed subtitle lines with their timeline times; use them to find the moment where something is said.
Times are timeline seconds as they are NOW, before any action. Clip numbers also refer to the current list.
Fields "clips", "cuts", "audios", "texts" take an array of numbers or the string "all". If the user selected something and says "this", use the selection.

Actions (use only these):
- {"op":"delete_range","start":s,"end":e}  remove that span from the video and close the gap (e.g. "احذف أول 3 ثواني" → start 0 end 3; "آخر 5 ثواني" → duration-5 to duration)
- {"op":"split","time":s}
- {"op":"delete_clip","clips":[n]}
- {"op":"move_clip","clip":n,"to":m}
- {"op":"duplicate_clip","clip":n}
- {"op":"speed","clips":…,"speed":0.25-4}
- {"op":"clip_volume","clips":…,"volume":0-1,"muted":bool}  sound of video clips
- {"op":"audio_volume","audios":…,"volume":0-1,"fade_in":s,"fade_out":s}  music/voice tracks
- {"op":"filter","clips":…,"filter":id}  filters: ${ids(FILTER_PRESETS)}
- {"op":"adjust","clips":…, any of "brightness","contrast","saturation" (percent, 100 neutral, 0-200), "warmth" (-100..100), "vignette" (0-100), "blur" (0-10)}
- {"op":"transition","cuts":…,"type":id,"duration":0.2-2}  types: ${ids(TRANSITIONS)}. "between all clips" → cuts "all"
- {"op":"clip_anim","clips":…,"in":id,"out":id,"duration":0.2-2}  animations: ${ids(CLIP_ANIMS)}
- {"op":"effect","clips":…,"effect":id or null,"intensity":0-1}  effects: ${ids(EFFECTS)}
- {"op":"motion","clips":…,"preset":id or null}  camera motion: ${ids(MOTION_PRESETS)}
- {"op":"speed_curve","clips":…,"curve":id or null}  curves: ${ids(SPEED_CURVES)}
- {"op":"transform","clips":…,"zoom":0.2-5,"rotation":degrees,"fit":"contain"|"cover","flip_h":bool,"flip_v":bool}
- {"op":"aspect","aspect":one of ${Object.keys(ASPECT_SIZES).join(', ')}}  (9:16 TikTok/Reels/Shorts, 16:9 YouTube, 1:1 square, 4:5 Instagram post)
- {"op":"background","color":"#rrggbb"}
- {"op":"add_text","text":"...","start":s,"duration":s,"preset":id,"y":0-1 (0 top, 1 bottom),"color":"#rrggbb"}  presets: ${ids(TEXT_PRESETS)}
- {"op":"delete_texts","texts":…}  plain texts/stickers (not captions)
- {"op":"generate_captions","style":id,"words_per_line":1-8,"emoji":bool}  auto subtitles from speech. Only when there are no captions yet.
- {"op":"caption_style","style":id}  restyle existing captions. Caption styles: ${ids(CAPTION_STYLES)}
- {"op":"caption_position","y":0-1}  (top 0.15, middle 0.5, bottom 0.8)
- {"op":"caption_size","percent":50-200}
- {"op":"caption_emoji","on":bool}
- {"op":"delete_captions"}
- {"op":"remove_silence","clips":…}  cut silent parts
- {"op":"seek","time":s}   {"op":"play"}   {"op":"export"}

Rules: use the fewest actions that do exactly what was asked. Never invent clip numbers that do not exist. Clamp values to the ranges above.
If the request needs something the editor cannot do (e.g. remove a background, generate new footage, recognise objects in the picture), return no actions and say so briefly.`;
}
