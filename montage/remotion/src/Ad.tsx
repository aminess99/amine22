import React from 'react';
import {
	AbsoluteFill,
	Audio,
	Easing,
	Img,
	interpolate,
	OffthreadVideo,
	Sequence,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import type {Shot, Timeline} from './schema';

const sec = (s: number, fps: number) => Math.round(s * fps);

// ------------------------------------------------------------------ shots
const ZoomedVideo: React.FC<{
	src: string;
	srcIn: number;
	speed: number;
	zoom: Extract<Shot, {type: 'one'}>['zoom'];
	seconds: number;
	look: string;
}> = ({src, srcIn, speed, zoom, seconds, look}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const t = frame / fps;
	const z =
		zoom.kind === 'dolly'
			? interpolate(t, [0, zoom.seconds ?? 1], [zoom.from, zoom.to], {
					extrapolateRight: 'clamp',
					easing: Easing.out(Easing.cubic),
				})
			: interpolate(t, [0, seconds], [zoom.from, zoom.to], {extrapolateRight: 'clamp'});
	// keep the focus point in frame: crop window centred on it, clamped to the picture
	const x = Math.min(Math.max(zoom.fx * width * z - width / 2, 0), width * z - width);
	const y = Math.min(Math.max(zoom.fy * height * z - height / 2, 0), height * z - height);
	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			<div
				style={{
					position: 'absolute',
					width,
					height,
					transformOrigin: '0 0',
					transform: `translate(${-x}px, ${-y}px) scale(${z})`,
				}}
			>
				<OffthreadVideo
					src={staticFile(src)}
					trimBefore={Math.round(srcIn * fps)}
					playbackRate={speed}
					muted
					style={{width, height, objectFit: 'cover', filter: look}}
				/>
			</div>
		</AbsoluteFill>
	);
};

const Split: React.FC<{shot: Extract<Shot, {type: 'split'}>; look: string}> = ({shot, look}) => {
	const {fps, width, height} = useVideoConfig();
	const half = height / 2;
	const panel = (p: typeof shot.top, top: number) => (
		<div style={{position: 'absolute', left: 0, top, width, height: half, overflow: 'hidden'}}>
			<OffthreadVideo
				src={staticFile(p.src)}
				trimBefore={Math.round(p.srcIn * fps)}
				playbackRate={p.speed}
				muted
				style={{width, height: half, objectFit: 'cover', objectPosition: `50% ${p.posY * 100}%`, filter: look}}
			/>
		</div>
	);
	return (
		<AbsoluteFill style={{backgroundColor: '#000'}}>
			{panel(shot.top, 0)}
			{panel(shot.bottom, half)}
			<div style={{position: 'absolute', left: 0, top: half - 4, width, height: 8, backgroundColor: '#fff'}} />
		</AbsoluteFill>
	);
};

// ------------------------------------------------------------------ captions (karaoke)
const Caption: React.FC<{cap: Timeline['captions'][number]; style: Timeline['style']}> = ({cap, style}) => {
	const frame = useCurrentFrame();
	const {fps, width} = useVideoConfig();
	const t = cap.from + frame / fps; // absolute time
	const local = frame / fps;
	const scale = interpolate(local, [0, 0.09, 0.16], [0.78, 1.06, 1], {extrapolateRight: 'clamp'});
	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				width,
				top: cap.y,
				transform: `translateY(-50%) scale(${scale})`,
				display: 'flex',
				justifyContent: 'center',
				direction: 'rtl',
				gap: style.captionSize * 0.26,
				fontFamily: style.font,
				fontWeight: 700,
				fontSize: style.captionSize,
				lineHeight: 1.25,
				WebkitTextStroke: `${style.stroke * 2}px #000`,
				paintOrder: 'stroke fill',
				textShadow: '0 6px 10px rgba(0,0,0,0.45)',
			}}
		>
			{cap.words.map((w, i) => (
				<span key={i} style={{color: t >= w.from && t < w.to ? style.activeColor : style.textColor}}>
					{w.text}
				</span>
			))}
		</div>
	);
};

// ------------------------------------------------------------------ end card
const EndCard: React.FC<{card: Timeline['endCard']; font: string}> = ({card, font}) => {
	const frame = useCurrentFrame();
	const {fps, width} = useVideoConfig();
	const t = frame / fps;
	const zoom = 1 + 0.08 * Math.min(t / 4.5, 1);
	const pulse = 1 + 0.05 * Math.sin(2 * Math.PI * 1.6 * t);
	const flash = interpolate(t, [0, 0.12], [1, 0], {extrapolateRight: 'clamp'});
	const runs = (rs: Timeline['endCard']['title'], size: number) => (
		<div style={{display: 'flex', justifyContent: 'center', gap: size * 0.28, direction: 'rtl', fontSize: size}}>
			{rs.map((r, i) => (
				<span key={i} style={{color: r.color}}>
					{r.text}
				</span>
			))}
		</div>
	);
	return (
		<AbsoluteFill
			style={{
				fontFamily: font,
				fontWeight: 700,
				background: `linear-gradient(180deg, ${card.colors.top}, ${card.colors.bottom})`,
			}}
		>
			<AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, rgba(80,190,130,0.35), transparent 60%)'}} />
			<div style={{position: 'absolute', top: 120, width}}>{runs(card.title, 86)}</div>
			<div style={{position: 'absolute', top: 250, width, textAlign: 'center', color: '#fff', fontSize: 50}}>
				{card.subtitle}
			</div>
			<div
				style={{
					position: 'absolute',
					left: 152,
					top: 362,
					width: 776,
					height: 1016,
					borderRadius: 46,
					background: '#fff',
					boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
					overflow: 'hidden',
					padding: 8,
					boxSizing: 'border-box',
				}}
			>
				<div style={{width: '100%', height: '100%', borderRadius: 40, overflow: 'hidden'}}>
					<Img
						src={staticFile(card.image)}
						style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`}}
					/>
				</div>
			</div>
			<div style={{position: 'absolute', top: 1500, width, display: 'flex', justifyContent: 'center'}}>
				<div
					style={{
						transform: `translateY(-50%) scale(${pulse})`,
						background: card.colors.button,
						color: '#111',
						fontSize: 76,
						padding: '14px 70px',
						borderRadius: 999,
						boxShadow: '0 10px 24px rgba(0,0,0,0.4)',
					}}
				>
					{card.button}
				</div>
			</div>
			<div style={{position: 'absolute', top: 1640, width}}>{runs(card.line, 46)}</div>
			<div style={{position: 'absolute', top: 1745, width, display: 'flex', justifyContent: 'center'}}>
				<div style={{background: card.colors.badge, color: '#fff', fontSize: 40, padding: '6px 40px', borderRadius: 999}}>
					{card.badge}
				</div>
			</div>
			<AbsoluteFill style={{backgroundColor: '#fff', opacity: flash}} />
		</AbsoluteFill>
	);
};

// ------------------------------------------------------------------ the ad
export const Ad: React.FC<Timeline> = (tl) => {
	const {fps} = useVideoConfig();
	const look = `saturate(${tl.style.saturation}) contrast(${tl.style.contrast})`;
	const total = sec(tl.duration, fps);
	const m = tl.audio.music;

	// music: low under the voice, higher between phrases and on the end card, fade out at the end
	const musicVolume = (f: number) => {
		const t = f / fps;
		let target = m.betweenPhrases;
		for (const [s, e] of tl.audio.speech) {
			const inside = interpolate(t, [s - 0.12, s, e, e + 0.3], [0, 1, 1, 0], {
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});
			target = Math.min(target, m.betweenPhrases - (m.betweenPhrases - m.underVoice) * inside);
		}
		if (t >= tl.endCard.from + 0.15) target = Math.max(target, m.endCard);
		const fade = interpolate(t, [0, 0.3, tl.duration - m.fadeOut, tl.duration], [0, 1, 1, 0], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
		return target * fade;
	};

	return (
		<AbsoluteFill style={{backgroundColor: '#000'}}>
			{tl.shots.map((s, i) => (
				<Sequence key={i} from={sec(s.from, fps)} durationInFrames={sec(s.to, fps) - sec(s.from, fps)} name={`shot ${i + 1}`}>
					{s.type === 'one' ? (
						<ZoomedVideo src={s.src} srcIn={s.srcIn} speed={s.speed} zoom={s.zoom} seconds={s.to - s.from} look={look} />
					) : (
						<Split shot={s} look={look} />
					)}
				</Sequence>
			))}
			<Sequence from={sec(tl.flash.at, fps)} durationInFrames={Math.max(1, sec(tl.flash.seconds, fps))} name="flash">
				<AbsoluteFill style={{backgroundColor: 'rgba(255,255,255,0.55)'}} />
			</Sequence>
			<Sequence from={sec(tl.endCard.from, fps)} durationInFrames={total - sec(tl.endCard.from, fps)} name="end card">
				<EndCard card={tl.endCard} font={tl.style.font} />
			</Sequence>
			{tl.captions.map((c, i) => (
				<Sequence key={i} from={sec(c.from, fps)} durationInFrames={Math.max(1, sec(c.to, fps) - sec(c.from, fps))} name={`caption ${i + 1}`}>
					<Caption cap={c} style={tl.style} />
				</Sequence>
			))}
			<Audio src={staticFile(tl.audio.voice.src)} volume={tl.audio.voice.volume} name="voice" />
			<Audio src={staticFile(m.src)} trimBefore={Math.round(m.startAt * fps)} volume={musicVolume} name="music" />
			{tl.audio.sfx.map((x, i) => (
				<Sequence key={i} from={sec(x.at, fps)} name={`sfx ${i + 1}`}>
					<Audio src={staticFile(x.src)} volume={x.volume} />
				</Sequence>
			))}
		</AbsoluteFill>
	);
};
