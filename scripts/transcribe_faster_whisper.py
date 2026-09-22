import json
import os
import sys

from faster_whisper import WhisperModel


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Expected one audio file path."}), flush=True)
        return 2

    audio_path = sys.argv[1]
    model_name = os.environ.get("FASTER_WHISPER_MODEL", "small")
    compute_type = os.environ.get("FASTER_WHISPER_COMPUTE_TYPE", "int8")

    model = WhisperModel(
        model_name,
        device="cpu",
        compute_type=compute_type,
        cpu_threads=max(1, int(os.environ.get("FASTER_WHISPER_CPU_THREADS", "4"))),
    )

    segments, info = model.transcribe(
        audio_path,
        language="ar",
        task="transcribe",
        beam_size=5,
        best_of=5,
        temperature=0,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 100},
        condition_on_previous_text=False,
    )

    words = []
    for segment in segments:
        for word in segment.words or []:
            text = (word.word or "").strip()
            if not text:
                continue
            words.append({
                "word": text,
                "start": float(word.start),
                "end": float(word.end),
            })

    print(json.dumps({
        "language": getattr(info, "language", "ar"),
        "duration": float(getattr(info, "duration", 0) or 0),
        "words": words,
    }, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())