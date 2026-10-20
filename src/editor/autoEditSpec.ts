import { commandSystemPrompt } from './commandSpec';
import { CAPTION_STYLES, FILTER_PRESETS, TEXT_PRESETS, TRANSITIONS } from './constants';
import { PRO_FX } from './proFxCatalog';
import { SFX_LIST } from './sfx';
import { TEXT_TEMPLATES } from './textTemplates';
import { TTS_STYLES, TTS_VOICES } from './tts';

/** What the user asks for before the AI plans the edit. */
export interface AutoEditBrief {
  aspect: '9:16' | '16:9' | '1:1' | '4:5';
  style: string;
  /** Target length in seconds. */
  duration: number;
  notes: string;
  voiceover: boolean;
  captions: boolean;
  music: 'library' | 'search' | 'none';
  /** Language the texts and voice-over are written in. */
  language: string;
  /** After building, the AI watches the result and fixes what it finds. */
  review: boolean;
}

/** What the reviewer may not do: it fixes the edit, it doesn't redo or export it. */
export const REVIEW_BLOCKED_OPS = new Set([
  'export', 'play', 'seek', 'undo', 'redo', 'analyze', 'aspect', 'project_template', 'make_short', 'generate_captions', 'delete_captions',
  'tts', 'add_media', 'add_pip', 'reframe', 'caption_rewrite', 'caption_regroup', 'extract_audio', 'reverse', 'remove_silence', 'sfx_search', 'beat_sync',
]);

/** The reviewer's verdict on a finished edit. */
export interface ReviewResult {
  score: number;
  ready: boolean;
  summary: string;
  issues: { time: number; problem: string; fix: string }[];
  /** Editing actions (the command format) that fix the issues. */
  actions: unknown[];
}

/** System prompt for the reviewer, who watches the finished edit and fixes it. */
export function reviewSystemPrompt(): string {
  return `You are a senior video editor doing the final check of an edit that was made automatically, before it is published.
You get the brief, the plan the edit was built from, the current timeline (the same project context the editing actions use) and a low-resolution preview of the finished video (2 frames a second, full sound). Watch and listen to all of it like a viewer.
Find real problems a viewer would notice, for example: a word or sentence cut off at a cut; a cut or transition in the middle of speech; music too loud over speech; captions with wrong words, out of sync, or covering a face; texts hard to read, on top of captions or covering a face; black, frozen or empty frames; a shot that drags or repeats; a weak first 2-3 seconds; an abrupt ending; voice-over that doesn't match what is on screen; the video much longer or shorter than the brief asked.
Fix them with the editing actions described below. Times are timeline seconds of THIS video as it is now; clip, text and audio numbers come from the timeline context. Use the fewest actions that fix the real problems. Don't redo the edit and don't change things that are only a matter of taste. When a cut clips a word, prefer moving the cut into the pause (delete_range on the silent part, or clip_duration) or a straight cut (transition "none" on that cut) over deleting content.
Never use these actions: ${[...REVIEW_BLOCKED_OPS].join(', ')}.
Reply with ONLY one JSON object:
{"score": 0-10 (quality as it is now), "ready": true if it can be published without changes, "summary": "2-3 sentences for the user, in the brief's language", "issues": [{"time": s, "problem": "short, in the brief's language", "fix": "what the action does, in the brief's language"}], "actions": [editing actions]}
If everything is fine, return "ready": true with empty issues and actions.

--- Editing actions reference (the same engine as the user's commands; ignore its reply format, use the one above) ---
${commandSystemPrompt()}`;
}

export const AUTO_STYLES: { id: string; label: string; hint: string }[] = [
  { id: 'energetic', label: 'حماسي', hint: 'fast cuts (1-2.5 s), punchy zooms and flashes, bold texts, upbeat music' },
  { id: 'calm', label: 'هادئ', hint: 'longer shots (3-6 s), soft fades, warm or film look, gentle music' },
  { id: 'cinematic', label: 'سينمائي', hint: 'slow motion feel, cinematic look, wide shots, dramatic music, few elegant texts' },
  { id: 'vlog', label: 'فلوق', hint: 'story order (chronological), natural sound kept, casual texts, light music' },
  { id: 'promo', label: 'إعلان', hint: 'product/place first, benefits as short texts, strong call to action at the end' },
  { id: 'educational', label: 'تعليمي', hint: 'clear steps, numbered texts, captions on, the speaker kept audible' },
  { id: 'before-after', label: 'قبل وبعد', hint: 'show the "before" then a striking transition to the "after"' },
  { id: 'memories', label: 'ذكريات', hint: 'emotional order, soft transitions, nostalgic look, warm texts' },
];

/** One shot of the plan: a part of a library file. Images use start 0 and end = seconds shown. */
export interface PlanSegment {
  media: number;
  start: number;
  end: number;
  why: string;
  text?: string;
  effect?: string;
  speed?: number;
}

export interface PlanText {
  template: string;
  texts: string[];
}

/** The AI's edit plan, shown to the user before anything changes. */
export interface AutoEditPlan {
  title: string;
  idea: string;
  hook: string;
  segments: PlanSegment[];
  transition: string;
  filter: string | null;
  text_preset: string;
  original_audio: 'keep' | 'mute';
  captions: { on: boolean; style: string };
  opening: PlanText | null;
  ending: PlanText | null;
  voiceover: { script: string; voice: string; style: string } | null;
  music: { media?: number; query?: string; volume: number } | null;
  sfx_on_cuts: string | null;
  publish: { caption: string; hashtags: string[] };
}

const ids = (list: { id: string; label: string }[]) => list.map((x) => `${x.id} (${x.label})`).join(', ');

/** System prompt for the planning model. */
export function autoEditSystemPrompt(): string {
  return `You are a professional video editor and director (like a CapCut/TikTok expert). The user uploaded footage and wants you to edit a finished video from it.
You get the brief and the "materials": each library file with its number, type, duration and — for analysed videos — what an AI saw in it (scenes with quality and interest, events, highlights, a summary). Times are in seconds of that file.
Plan the whole edit and reply with ONLY one JSON object:
{
 "title": "short name of the video",
 "idea": "2-3 sentences: the story and why it works",
 "hook": "what the first 2-3 seconds show to stop the scroll",
 "segments": [{"media":n,"start":s,"end":s,"why":"short reason","text":"optional short on-screen text for this shot","effect":"optional pro effect id","speed":1}],
 "transition": id, "filter": id or null, "text_preset": id,
 "original_audio": "keep" (people talk / natural sound matters) or "mute",
 "captions": {"on":bool,"style":id},
 "opening": {"template":id,"texts":["…"]} or null,
 "ending": {"template":id,"texts":["…"]} or null,
 "voiceover": {"script":"…","voice":id,"style":id} or null,
 "music": {"media":n,"volume":0-1} or {"query":"english keywords for royalty-free music","volume":0-1} or null,
 "sfx_on_cuts": sound id or null,
 "publish": {"caption":"post text","hashtags":["#…"]}
}

Rules:
- Segments play in the given order and must stay inside the file (0 ≤ start < end ≤ duration). Images: start 0, end = seconds to show (1.5-4).
- Hit the target length (±20%) with the sum of segment lengths divided by speed. Start with the strongest moment (the hook). End on a satisfying or call-to-action shot.
- Use only good-quality scenes; skip blurry/dark/shaky/boring parts unless nothing else exists. Prefer high interest and highlights.
- When people speak, cut on whole sentences/scene boundaries and keep "original_audio":"keep"; never cut a word in half.
- Do not repeat the same part of a file. Use variety across files.
- Texts: short (2-6 words), in the brief's language, not on every shot. No text where captions already show speech.
- Captions only when the kept footage contains speech. Voice-over only if the brief asks for it: write a natural script that fits the total length (about 2.5 words per second) in the brief's language.
- Music: if the library has an audio file, use it ({"media":n}); otherwise follow the brief (a search query, or null). Volume 0.2-0.4 under speech or voice-over, 0.6-0.9 otherwise.
- Pro effects sparingly (0-3 shots).
- If the materials can't make the requested video, still return the best plan and say so in "idea".

Allowed ids:
transitions: ${ids(TRANSITIONS)}
filters: ${ids(FILTER_PRESETS)}
text presets: ${ids(TEXT_PRESETS)}
caption styles: ${ids(CAPTION_STYLES)}
templates (opening/ending; "texts" replaces their sample lines in order): ${TEXT_TEMPLATES.map((t) => `${t.id} (${t.label}: ${t.items.map((i) => i.text).join(' / ')})`).join(', ')}
voices: ${TTS_VOICES.map((v) => `${v.id} (${v.hint})`).join(', ')}
voice styles: ${ids(TTS_STYLES)}
sounds: ${SFX_LIST.map((x) => `${x.id} (${x.label})`).join(', ')}
pro effects: ${PRO_FX.map((f) => `${f.id} (${f.label})`).join(', ')}
styles the user can pick: ${AUTO_STYLES.map((s) => `${s.id}: ${s.hint}`).join('; ')}`;
}
