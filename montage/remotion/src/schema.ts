import {z} from 'zod';
import {zColor} from '@remotion/zod-types';

// Every time is in seconds; the timeline.json of each ad follows this schema,
// so all of it can be edited in Remotion Studio's props panel or in the JSON file.

const zoom = z.object({
	kind: z.enum(['linear', 'dolly']), // linear: from -> to over the shot; dolly: eased push-in over `seconds`
	from: z.number().min(1).max(3),
	to: z.number().min(1).max(3),
	fx: z.number().min(0).max(1), // focus point (0..1 of the frame) the zoom settles on
	fy: z.number().min(0).max(1),
	seconds: z.number().optional(),
});

const panel = z.object({
	src: z.string(),
	srcIn: z.number(), // where to start in the source clip (s)
	speed: z.number().min(0.25).max(4),
	posY: z.number().min(0).max(1), // vertical framing of the half-height panel
});

export const shotSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('one'),
		from: z.number(),
		to: z.number(),
		src: z.string(),
		srcIn: z.number(),
		speed: z.number().min(0.25).max(4),
		zoom,
	}),
	z.object({type: z.literal('split'), from: z.number(), to: z.number(), top: panel, bottom: panel}),
]);

const run = z.object({text: z.string(), color: zColor()});

export const timelineSchema = z.object({
	id: z.string(),
	fps: z.number(),
	width: z.number(),
	height: z.number(),
	duration: z.number(),
	style: z.object({
		font: z.string(),
		captionSize: z.number().min(20).max(200),
		stroke: z.number().min(0).max(30),
		activeColor: zColor(),
		textColor: zColor(),
		saturation: z.number(),
		contrast: z.number(),
	}),
	shots: z.array(shotSchema),
	flash: z.object({at: z.number(), seconds: z.number()}),
	captions: z.array(
		z.object({
			from: z.number(),
			to: z.number(),
			y: z.number(),
			words: z.array(z.object({text: z.string(), from: z.number(), to: z.number()})),
		}),
	),
	audio: z.object({
		voice: z.object({src: z.string(), volume: z.number().min(0).max(2)}),
		music: z.object({
			src: z.string(),
			startAt: z.number(),
			underVoice: z.number().min(0).max(1), // music volume while the voice speaks
			betweenPhrases: z.number().min(0).max(1),
			endCard: z.number().min(0).max(1),
			fadeOut: z.number(),
		}),
		speech: z.array(z.array(z.number())), // [start, end] of each stretch of speech (for ducking)
		sfx: z.array(z.object({src: z.string(), at: z.number(), volume: z.number().min(0).max(2)})),
	}),
	endCard: z.object({
		from: z.number(),
		title: z.array(run),
		subtitle: z.string(),
		image: z.string(),
		button: z.string(),
		line: z.array(run),
		badge: z.string(),
		colors: z.object({top: zColor(), bottom: zColor(), button: zColor(), badge: zColor()}),
	}),
});

export type Timeline = z.infer<typeof timelineSchema>;
export type Shot = z.infer<typeof shotSchema>;
