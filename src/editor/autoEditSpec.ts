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
First judge the story: does it make sense from start to end for someone who never saw the original footage? Is every sentence complete? Is only one voice heard at a time? Do cutaways match what is being said?
Then find real problems a viewer would notice, for example: a word or sentence cut off at a cut; a cut or transition in the middle of speech; music too loud over speech; captions with wrong words, out of sync, or covering a face; texts hard to read, on top of captions or covering a face; black, frozen or empty frames; a shot that drags or repeats; a weak first 2-3 seconds; an abrupt ending; voice-over that doesn't match what is on screen; the video much longer or shorter than the brief asked.
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

/** Talking mode: one beat of the story, made of whole spoken sentences (ids like "2.14" = file 2, sentence 14). */
export interface PlanBeat {
  sentences: string[];
  why: string;
  text?: string;
}

/** Talking mode: a cutaway shown full screen over a beat while the speech goes on. */
export interface PlanBroll {
  /** Beat number (1-based) it covers. */
  over: number;
  media: number;
  start: number;
  end: number;
  why: string;
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
  /** "talking": the speech is the backbone (beats of sentences + B-roll); "visual": shots. */
  mode: 'talking' | 'visual';
  beats: PlanBeat[];
  broll: PlanBroll[];
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
  return `You are a professional video editor and director (a CapCut/TikTok/YouTube expert). The user uploaded footage and wants a finished, professional video edited from it.
You get the brief and the "materials": each library file with its number, type, duration and, for analysed videos, what an AI saw (scenes with quality and interest, events, highlights, a summary). Files where someone speaks also have "speech": the transcript as numbered sentences with exact times. Times are seconds of that file.

First choose the mode:
- "talking" when the footage is mainly someone speaking (review, tutorial, vlog to camera, interview, podcast) and the brief does not ask for a voice-over. The SPEECH is the backbone, like a professional editor or Opus Clip:
  * Build "beats" from whole sentences only, by their ids. Choose sentences that together tell one clear story a viewer understands without the rest: a strong hook first (a surprising claim, the key result, a question), then the essential points, then a conclusion or call to action. Keep the original order inside a point; you may move the best sentence to the start as the hook. Drop repetitions, digressions, false starts and filler. Never pick a sentence that only makes sense after one you dropped.
  * Hit the target length with the sum of the chosen sentences' durations (±20%).
  * Add "broll": cutaways from OTHER files (or other parts of the same file) shown full screen over a beat while the speech continues, when the words mention something visible (the product, the place, a result). 1.5-4 s each, about one every 6-10 s, never over the hook's first second.
  * Keep "original_audio":"keep" and no voice-over. Captions on (if the brief allows) in a bold style.
  * Leave "segments" empty.
- "visual" for footage without meaningful speech (travel, product, food, sport, events) or when the brief asks for a voice-over:
  * "segments" are shots in play order. Cut on the action and on scene boundaries; vary shots; the strongest shot first.
  * With a voice-over, set "original_audio":"mute" (one voice at a time) and write a script that fits the length (about 2.5 words per second) in the brief's language.
  * Leave "beats" and "broll" empty.

Reply with ONLY one JSON object:
{
 "title": "short name of the video",
 "idea": "2-3 sentences: the story and why it works",
 "hook": "what the first 2-3 seconds show or say to stop the scroll",
 "mode": "talking" or "visual",
 "beats": [{"sentences":["1.4","1.5"],"why":"short reason","text":"optional 2-5 word on-screen title for this point"}],
 "broll": [{"over":beat number from 1,"media":n,"start":s,"end":s,"why":"what it illustrates"}],
 "segments": [{"media":n,"start":s,"end":s,"why":"short reason","text":"optional short on-screen text","effect":"optional pro effect id","speed":1}],
 "transition": id, "filter": id or null, "text_preset": id,
 "original_audio": "keep" or "mute",
 "captions": {"on":bool,"style":id},
 "opening": {"template":id,"texts":["…"]} or null,
 "ending": {"template":id,"texts":["…"]} or null,
 "voiceover": {"script":"…","voice":id,"style":id} or null,
 "music": {"media":n,"volume":0-1} or {"query":"english keywords for royalty-free music","volume":0-1} or null,
 "sfx_on_cuts": sound id or null,
 "publish": {"caption":"post text","hashtags":["#…"]}
}

Rules for both modes:
- Times stay inside the file (0 ≤ start < end ≤ duration). Images: start 0, end = seconds to show (1.5-4).
- Use only good-quality footage; skip blurry/dark/shaky/boring parts unless nothing else exists.
- Never two voices at once: a voice-over means the original sound is muted.
- In talking mode cuts are straight cuts (the editor adds subtle zooms); pick "transition":"none" unless the style is cinematic or memories.
- Texts: short, in the brief's language, not on every beat or shot, never covering captions.
- Music: if the library has an audio file, use it ({"media":n}); otherwise follow the brief (a search query, or null). Volume 0.15-0.3 under speech or voice-over, 0.6-0.9 otherwise.
- Pro effects sparingly (0-2), never on a talking face.
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
