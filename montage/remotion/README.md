# مشروع Remotion لإعلانات المنتجات

كل إعلان هو ملف `timeline.json` واحد في `public/projects/<اسم الإعلان>/`، ومعه مجلد `media/` فيه الفيديوهات والصوت والمؤثرات. كل الأوقات في الملف **بالثواني**.

## التشغيل على جهازك
تحتاج **Node.js 18 أو أحدث** (من nodejs.org).

```bash
cd montage/remotion
npm install        # مرة واحدة فقط
npm run dev        # يفتح Remotion Studio على http://localhost:3000
```

في الـ Studio:
- **التايملاين في الأسفل:** فيه كل لقطة (shot 1…8)، وكل ترجمة (caption)، والصوت (voice, music)، وكل مؤثر (sfx).
- **لوحة Props على اليمين:** تعدّل منها كل شيء وترى النتيجة مباشرة، مثل نص الترجمة، أو بداية اللقطة في المصدر (srcIn)، أو السرعة (speed)، أو الزوم، أو مستوى الموسيقى، أو ألوان شاشة النهاية. بعد التعديل اضغط **Save** فيُحفظ في `timeline.json`.
- **التصدير:** زر **Render** في الأعلى، أو من الطرفية:

```bash
npx remotion render neck-massager-c out/neck-massager-c.mp4
```

## ماذا تعدّل في timeline.json
| الحقل | المعنى |
|---|---|
| `shots[].from / to` | بداية ونهاية اللقطة في الفيديو النهائي |
| `shots[].src / srcIn` | ملف المصدر، ومن أي ثانية تبدأ داخله |
| `shots[].speed` | السرعة (1 = عادي، 0.8 = أبطأ، 1.3 = أسرع) |
| `shots[].zoom` | `from` و`to` قوة الزوم، و`fx` و`fy` نقطة التركيز (0 إلى 1). `dolly` = زوم من بعيد مع تباطؤ |
| `type: "split"` | شاشة مقسومة: `top` و`bottom`، و`posY` هو تأطير كل نصف |
| `captions[].words` | كل كلمة ووقت تلوّنها، و`y` هو ارتفاع الترجمة |
| `style` | الخط، والحجم، ولون الكلمة النشطة، والحدّ |
| `audio.music` | `underVoice` مستوى الموسيقى تحت الكلام، و`betweenPhrases` في الفراغات، و`endCard` في النهاية |
| `audio.sfx` | كل مؤثر: الملف، والوقت `at`، والمستوى `volume` |
| `endCard` | العنوان، والصورة، ونص الزر، والسطر، والشارة، والألوان |

## إعلان جديد
أنا أبني الإعلان، ثم أصدّره بـ `python3 montage/tools/export_remotion.py montage/projects/<المشروع>`، ثم أضيف سطر import له في `src/Root.tsx`.

## الترخيص
Remotion مجاني للأفراد والشركات الصغيرة (3 موظفين أو أقل). الشركات الأكبر تحتاج ترخيصاً من remotion.dev.
