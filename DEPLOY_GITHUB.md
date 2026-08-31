# النشر التلقائي — GitHub ← هوستنجر (الطريقة الفعّالة الآن)

> **هذا مُعدّ ويعمل منذ أواخر أغسطس 2026.** آخر قياس 2026-08-31: دفعةٌ وصلت
> الإنتاج في ~15 دقيقة بلا أي تدخّل. تفاصيل بنية الخادم في `DEPLOYMENT_STATUS.md`.

```
git push origin main  →  هوستنجر يسحب  →  npm install  →  build  →  تبديل current  →  حيّ
```

---

## الاستعمال اليومي — هذا كل شيء

```bash
git add -A && git commit -m "وصف التعديل" && git push
```

ثم انتظر 10–15 دقيقة. للتأكد أن النشر وصل:

```bash
ssh -p 65002 u257117736@185.206.160.134 "cd ~/domains/kayan-uniform.com/hbuilds/last-source && git log --oneline -1"
```

يجب أن يطابق آخر كوميت عندك.

---

## لماذا هذه الطريقة تحديداً

| الطريقة | الحالة |
|---|---|
| **GitHub تلقائي** | ✅ **الفعّالة** — بلا تدخّل، والبناء عند هوستنجر |
| SSH بسكربت `deploy-site.mjs` | ❌ يستهدف بنية `app/` التي حُذفت من الخادم في 18 أغسطس |
| رفع ZIP يدوي / زر Deploy في hPanel | ❌ ممنوع — المنظومة تدير `hbuilds/` وحدها وأي رفع يدوي يضاربها |

البناء المحلي على الخادم مستحيل (`next build` يموت بـ`EAGAIN` على العتاد
المشترك) — منظومة هوستنجر تبني في بيئة منفصلة ثم تضع الناتج، وهذا ما جعلها
الطريق الوحيد الذي ينجح.

## ما الذي يبنيه هوستنجر بالضبط

- يستنسخ `main` إلى `hbuilds/last-source/` ويبني منه.
- `next.config.ts` فيه `output: 'standalone'` **لأجل هذه المنظومة تحديداً** —
  بدونه ترفض بـ"no standalone server or static output".
- الناتج يوضع في `hbuilds/versions/<uuid>/nodejs/` ويُبدَّل رابط `current`.
- Passenger يعيد التشغيل تلقائياً ويشغّل `server.js` بـ Node 20.

## متغيّرات البيئة

من **hPanel ← الموقع ← Node.js ← Environment Variables** حصراً — لا ملف
`.env` على الخادم إطلاقاً. المضبوط الآن يشمل اتصال قاعدة البيانات
(MySQL/MariaDB — راجع `DEPLOYMENT_STATUS.md`) ومتغيّرات الموقع العامة.

⚠️ **لا تضع أي كلمة مرور في المستودع.** شاشة hPanel هي مكانها الوحيد.

## تغييرات المخطط (Prisma)

النشر يبني الكود لكنه **لا يلمس قاعدة البيانات**. أي تعديل على
`prisma/schema.prisma` طبّقه أنت على قاعدة الإنتاج بـ`prisma db push`
(برابط الإنتاج من hPanel) **قبل** دفع الكود الذي يعتمد عليه — عمود جديد
مضاف قبل الكود لا يكسر النسخة القديمة، والعكس يكسر الجديدة.

## قبل أي دفعة — تحقّق محلي

```bash
npm run lint && npm run typecheck && npm run build
```

وإن أردت محاكاة بيئة هوستنجر المسطّحة بالضبط (تكشف أخطاءً لا يراها بناء
الـmonorepo): شغّل خط التحزيم — `node scripts/package-hostinger.mjs platform`
ثم `npm install && npx prisma generate && npm run build` داخل
`dist-hostinger/kayan-platform/`.
