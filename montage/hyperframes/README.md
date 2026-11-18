# مشاريع HyperFrames

كل إعلان مجلد مستقل (مثلاً `neck-massager-c/`) فيه:
- `index.html`: التايملاين الرئيسي.
  - **مسار 0:** اللقطات.
  - **مسار 1:** النصف السفلي للسبليت سكرين، وشاشة النهاية.
  - **مسار 2:** الفاصل الأبيض والفلاش.
  - **مسار 3:** الترجمة.
  - **مسار 4:** التعليق الصوتي.
  - **مسار 5:** الموسيقى.
  - **مسار 6 وما بعده:** المؤثرات الصوتية.
- `compositions/captions.html`: الترجمة (كاريوكي).
- `compositions/endcard.html`: شاشة النهاية.
- `assets/`: الفيديوهات والصوت والخط.

## الفتح على Windows
1. **Node.js:** نسخة 22 أو أحدث.
2. **FFmpeg:** مرة واحدة فقط. افتح cmd واكتب:
   ```
   winget install --id=Gyan.FFmpeg -e
   ```
   ثم أغلق النافذة وافتحها من جديد.
3. **افتح cmd داخل مجلد الإعلان** (مثلاً `montage\hyperframes\neck-massager-c`) واكتب:
   ```
   npx --yes hyperframes@0.9.9 preview
   ```
   سيفتح الـ Studio في المتصفح.

## داخل الـ Studio
- **اللقطات والصوت:** اسحب أي لقطة أو صوت على التايملاين لتحريكه، أو اسحب طرفه لقصّه.
- **الترجمة وشاشة النهاية:** اضغط على مقطعها لتعديل النص في محرر الكود.
- **التصدير:** زر Render، أو من cmd:
  ```
  npx --yes hyperframes@0.9.9 render -o final.mp4
  ```

## إعادة التوليد
```
python3 montage/tools/export_remotion.py montage/projects/<المشروع>
python3 montage/tools/export_hyperframes.py <id> <path/to/gsap.min.js>
```
