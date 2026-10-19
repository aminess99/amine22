import { VOICE_EFFECTS } from './audioTools';
import { TTS_STYLES, TTS_VOICES } from './tts';
import {
  ASPECT_SIZES,
  BLEND_MODES,
  MASKS,
  OVERLAY_ANIMS,
  CAPTION_STYLES,
  CLIP_ANIMS,
  EFFECTS,
  FILTER_PRESETS,
  MOTION_PRESETS,
  SPEED_CURVES,
  TEXT_ANIMS_IN,
  TEXT_ANIMS_LOOP,
  TEXT_ANIMS_OUT,
  TEXT_BG_SHAPES,
  TEXT_PRESETS,
  TRANSITIONS,
} from './constants';
import { FONT_GROUPS, FONT_LIST } from './fonts';
import { TEXT_TEMPLATES } from './textTemplates';
import { PROJECT_TEMPLATES } from './templates';
import { SFX_LIST } from './sfx';

/** Look and motion fields shared by add_text and text_style. */
export interface TextStyleFields {
  text?: string;
  font?: string;
  size?: number;
  bold?: boolean;
  color?: string;
  gradient?: string | null;
  glow?: string | null;
  stroke_color?: string;
  stroke_width?: number;
  background?: string | null;
  bg_shape?: string;
  shadow?: boolean;
  extrude?: number;
  extrude_color?: string;
  opacity?: number;
  x?: number;
  y?: number;
  rotation?: number;
  duration?: number;
  anim_in?: string;
  anim_out?: string;
  anim_loop?: string;
}

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
  | ({ op: 'add_text'; text: string; start: number; duration?: number; preset?: string } & TextStyleFields)
  | ({ op: 'text_style'; texts: ClipTarget | 'captions' } & TextStyleFields)
  | { op: 'add_template'; template: string; start?: number; texts?: string[] }
  | { op: 'delete_texts'; texts: ClipTarget }
  | { op: 'generate_captions'; style?: string; words_per_line?: number; emoji?: boolean }
  | { op: 'caption_style'; style: string }
  | { op: 'caption_position'; y: number }
  | { op: 'caption_size'; percent: number }
  | { op: 'caption_emoji'; on: boolean }
  | { op: 'delete_captions' }
  | { op: 'remove_silence'; clips: ClipTarget }
  | { op: 'mask'; clips: ClipTarget; shape: string | null; size?: number }
  | { op: 'chroma'; clips?: ClipTarget; pips?: ClipTarget; color?: string; similarity?: number; smoothness?: number; off?: boolean }
  | { op: 'freeze'; time: number; seconds?: number }
  | { op: 'reverse'; clips: ClipTarget }
  | { op: 'voice_effect'; audios?: ClipTarget; clips?: ClipTarget; effect: string }
  | { op: 'beat_sync'; audio: number; every?: number }
  | { op: 'add_media'; media: number; at?: 'end' | 'start' | 'playhead' | number }
  | { op: 'add_pip'; media: number; start?: number; x?: number; y?: number; scale?: number; shape?: string; chroma?: string | boolean }
  | {
      op: 'pip';
      pips: ClipTarget;
      start?: number;
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      opacity?: number;
      shape?: string;
      blend?: string;
      anim_in?: string;
      anim_out?: string;
      flip_h?: boolean;
      volume?: number;
      muted?: boolean;
    }
  | { op: 'delete_pip'; pips: ClipTarget }
  | { op: 'tts'; text: string; voice?: string; style?: string; start?: number }
  | { op: 'extract_audio'; clips: ClipTarget }
  | { op: 'crop'; clips: ClipTarget; x?: number; y?: number; w?: number; h?: number; reset?: boolean }
  | { op: 'clip_duration'; clips: ClipTarget; seconds: number }
  | { op: 'audio_edit'; audios: ClipTarget; start?: number; trim_start?: number; duration?: number }
  | { op: 'delete_audio'; audios: ClipTarget }
  | { op: 'pip_layer'; pip: number; to: 'front' | 'back' | 'forward' | 'backward' }
  | { op: 'caption_line'; line: number; text?: string; delete?: boolean }
  | { op: 'project_template'; template: string }
  | { op: 'sfx'; sound: string; at?: number[]; where?: 'cuts' | 'texts'; volume?: number }
  | { op: 'sfx_search'; query: string; at?: number[]; volume?: number }
  | { op: 'reframe'; clips: ClipTarget }
  | { op: 'make_short'; start: number; end: number }
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

The project context is JSON: clips are on the main track, numbered from 1 in play order, with timeline start/end in seconds. "cut" N is the transition INTO clip N (between clip N-1 and N; cut 1 does nothing). Audio tracks, texts, "pips" (picture-in-picture videos/images floating above the main track) and the "media" library (files the user imported) are numbered from 1 too. "captions" are word-timed subtitle lines with their timeline times; use them to find the moment where something is said.
Times are timeline seconds as they are NOW, before any action. Clip numbers also refer to the current list.
Fields "clips", "cuts", "audios", "texts", "pips" take an array of numbers or the string "all". If the user selected something and says "this", use the selection.

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
- {"op":"add_text","text":"...","start":s,"duration":s,"preset":id, plus any text style field below}  presets: ${ids(TEXT_PRESETS)}
- {"op":"text_style","texts":… or "captions", any of: "text","font","size" (px, 20-300; titles ~120, body ~60),"bold","color","gradient" (second colour or null),"glow" (colour or null),"stroke_color","stroke_width" (0-16),"background" (colour or null),"bg_shape" (${TEXT_BG_SHAPES.map((b) => b.id).join(', ')}),"shadow","extrude" (3D depth 0-0.25),"extrude_color","opacity" 0-1,"x","y" (0-1),"rotation","duration","anim_in","anim_out","anim_loop"}
  Fonts (family, style): ${FONT_LIST.map((f) => `${f.family} (${FONT_GROUPS.find((g) => g.id === f.group)!.label})`).join(', ')}
  anim_in: ${ids(TEXT_ANIMS_IN)}
  anim_out: ${ids(TEXT_ANIMS_OUT)}
  anim_loop (repeats while shown): ${ids(TEXT_ANIMS_LOOP)}
- {"op":"add_template","template":id,"start":s,"texts":["first line","second line"]}  ready-made animated text designs; "texts" replaces their sample wording in order. Templates: ${TEXT_TEMPLATES.map((t) => `${t.id} (${t.label}: ${t.items.map((i) => i.text).join(' / ')})`).join(', ')}
- {"op":"delete_texts","texts":…}  plain texts/stickers (not captions)
- {"op":"generate_captions","style":id,"words_per_line":1-8,"emoji":bool}  auto subtitles from speech. Only when there are no captions yet.
- {"op":"caption_style","style":id}  restyle existing captions. Caption styles: ${ids(CAPTION_STYLES)}
- {"op":"caption_position","y":0-1}  (top 0.15, middle 0.5, bottom 0.8)
- {"op":"caption_size","percent":50-200}
- {"op":"caption_emoji","on":bool}
- {"op":"delete_captions"}
- {"op":"remove_silence","clips":…}  cut silent parts
- {"op":"mask","clips":…,"shape":id or null,"size":0.1-1.5}  masks: ${ids(MASKS)}
- {"op":"chroma","clips":… or "pips":…,"color":"#00ff00","similarity":0-1,"smoothness":0-1}  green screen: remove a colour. {"off":true} removes it. Usually on a pip placed over another video.
- {"op":"freeze","time":s,"seconds":0.5-10}  insert a frozen frame at that moment
- {"op":"reverse","clips":…}  play video clips backwards (max 60 s each)
- {"op":"voice_effect","audios":… or "clips":…,"effect":id}  effects: ${ids(VOICE_EFFECTS)}. With "clips" the sound of those video clips is detached to an audio track first.
- {"op":"beat_sync","audio":n,"every":1-4}  cut the clips on the beats of that music track (every Nth beat). A track added by add_media in the same command gets the next number.
- {"op":"add_media","media":n,"at":"end"|"start"|"playhead"|seconds}  put a library file on the main track (videos/images) or as a new audio track (audio, "at" = start time)
- {"op":"add_pip","media":n,"start":s,"x":0-1,"y":0-1,"scale":0.1-1,"shape":"rect"|"rounded"|"circle","chroma":true or "#rrggbb"}  add a library file as picture-in-picture; "chroma" removes its green (or given) background right away
- {"op":"pip","pips":…, any of "start","x","y" (centre, 0-1),"scale" (width fraction 0.1-1),"rotation","opacity" 0-1,"shape","blend" (${BLEND_MODES.map((b) => b.id).join(', ')}),"anim_in"/"anim_out" (${OVERLAY_ANIMS.map((b) => b.id).join(', ')}),"flip_h","volume" 0-1,"muted"}
- {"op":"delete_pip","pips":…}
- {"op":"tts","text":"...","voice":id,"style":id,"start":s}  text to speech (voice-over) added as an audio track. Write the text in the language the user wants spoken. Voices: ${TTS_VOICES.map((v) => `${v.id} (${v.hint})`).join(', ')}. Styles: ${ids(TTS_STYLES)}
- {"op":"extract_audio","clips":…}  detach/separate a video clip's sound onto its own audio track (the clip is muted)
- {"op":"crop","clips":…,"x":0-1,"y":0-1,"w":0-1,"h":0-1}  keep that part of the frame (fractions of the source); {"reset":true} removes the crop
- {"op":"clip_duration","clips":…,"seconds":s}  how long an image stays, or trim a video clip to that length
- {"op":"audio_edit","audios":…,"start":s (move the track on the timeline),"trim_start":s (skip the first seconds of the file),"duration":s (cut the track to this length)}
- {"op":"delete_audio","audios":…}
- {"op":"pip_layer","pip":n,"to":"front"|"back"|"forward"|"backward"}  stacking order of picture-in-picture layers
- {"op":"caption_line","line":n,"text":"..."}  fix the words of one caption line (n from "captions"); {"delete":true} removes it
- {"op":"project_template","template":id}  restyle the whole video in one go: ${PROJECT_TEMPLATES.map((t) => `${t.id} (${t.label}: ${t.description})`).join(', ')}
- {"op":"sfx","sound":id,"at":[seconds…] or "where":"cuts"|"texts","volume":0-1}  built-in sound effect at those times; "cuts" = on every transition between clips, "texts" = when each text appears. Sounds: ${SFX_LIST.map((x) => `${x.id} (${x.label})`).join(', ')}
- {"op":"sfx_search","query":"english keywords","at":[seconds…],"volume":0-1}  a real recorded sound from the Freesound library (applause, laughter, rain, door, crowd, car…) when no built-in sound fits
- {"op":"reframe","clips":…}  smart reframe: fill the frame and follow the main subject (for horizontal video in a vertical frame). Needs vision data for the clip.
- {"op":"make_short","start":s,"end":s}  keep only that part of the video as a vertical short (9:16, reframed). Use a highlight from "vision" when the user asks for a short/best moment.
- {"op":"seek","time":s}   {"op":"play"}   {"op":"export"}

Rules: use the fewest actions that do exactly what was asked. Never invent clip numbers that do not exist. Clamp values to the ranges above.
"vision" (when present) is what an AI saw in each analysed clip: scenes, events and highlights with frame-accurate timeline times. Use it to find visual moments ("the part with the car", "when I smile", "the jump"): use those exact times for split/delete_range/freeze/sfx/add_text. Prefer scene boundaries and event times over guesses. Scenes with quality blurry/dark/shaky/boring are candidates when asked to remove bad parts.
If the request depends on what is visible but there is no "vision" data for that clip, return no actions and reply that the user should first press "تحليل الفيديو" (Analyse video) in the commands panel.
Map the user's words to the closest action: e.g. "افصل الصوت" / "استخرج الصوت" → extract_audio; "قص الصورة" (frame) → crop; "أطول/أقصر" for an image → clip_duration.
If the request needs something the editor cannot do (e.g. remove a background, generate new footage, recognise objects in the picture), return no actions and say so briefly.`;
}
