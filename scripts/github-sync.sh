#!/usr/bin/env bash
set -e

# ==============================================================================
# سكربت المزامنة وحل مشاكل الوصول لـ GitHub
# Sham Perfume — GitHub Sync & Access Fixer
# ==============================================================================

REPO_OWNER="spculculat-oss"
REPO_NAME="Sham-Perfume"
REPO_BASE="github.com/${REPO_OWNER}/${REPO_NAME}.git"
DEFAULT_EMAIL="s.p.culculat@gmail.com"

echo "========================================================"
echo "🐙 أداة فحص ومزامنة مستودع GitHub — منصة عطور شام"
echo "========================================================"

# 1. فحص وجود Git وتهيئته
if [ ! -d ".git" ]; then
  echo "📦 تهيئة مستودع Git محلي..."
  git init -q
fi

# التأكد من الفرع main
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" != "main" ]; then
  git branch -M main
fi

# ضبط البريد واسم المستخدم
git config user.name "$REPO_OWNER"
git config user.email "$DEFAULT_EMAIL"
echo "✅ هوية Git: $(git config user.name) <$(git config user.email)>"

# 2. فحص الـ Token لحل مشاكل المصادقة
TOKEN="${1:-$GITHUB_TOKEN}"

# إذا لم يُمرر توكن كمعامل، ابحث في ملف .git_token المحلي (المستبعد من git)
if [ -z "$TOKEN" ] && [ -f ".git_token" ]; then
  TOKEN=$(cat .git_token | tr -d '\r\n ')
fi

if [ -n "$TOKEN" ]; then
  # ضبط الرابط المشفر بالتوكن للرفع المباشر دون طلب كلمة مرور
  REMOTE_AUTH="https://${TOKEN}@${REPO_BASE}"
  git remote set-url origin "$REMOTE_AUTH" 2>/dev/null || git remote add origin "$REMOTE_AUTH"
  echo "🔑 تم تطبيق توكن المصادقة (Personal Access Token) بنجاح!"
else
  REMOTE_URL="https://${REPO_BASE}"
  git remote set-url origin "$REMOTE_URL" 2>/dev/null || git remote add origin "$REMOTE_URL"
  echo "ℹ️ تم ضبط المسار البعيد إلى: https://${REPO_BASE}"
fi

# 3. فحص الاتصال بـ GitHub
echo "--------------------------------------------------------"
echo "🌐 فحص الاتصال بمستودع GitHub..."
echo "--------------------------------------------------------"
if git ls-remote origin HEAD >/dev/null 2>&1; then
  echo "✅ تم الاتصال بنجاح بمستودع GitHub ($REPO_NAME)."
else
  echo "⚠️ تعذر الاتصال بمستودع GitHub!"
  echo "💡 الأسباب المحتملة وحلولها:"
  echo "   1. إذا كان المستودع خاصاً (Private)، يلزم توفير Personal Access Token."
  echo "      يمكنك تشغيل: bash scripts/github-sync.sh <YOUR_TOKEN>"
  echo "   2. للتأكد من إنشاء التوكن بصلاحيات (repo):"
  echo "      اذهب إلى: https://github.com/settings/tokens"
fi

# 4. فحص جودة الكود قبل الإرسال لمنع فشل GitHub Actions CI
echo "--------------------------------------------------------"
echo "🧪 فحص سلامة الأنواع والاختبارات (Preventing CI Failures)..."
echo "--------------------------------------------------------"
if npm run lint; then
  echo "✅ فحص TypeScript سليم 100%."
else
  echo "❌ توجد أخطاء في الأنواع (Lint Failed). يجب تصحيحها أولاً."
  exit 1
fi

# 5. سحب آخر التحديثات وحل أي تعارضات (Rebase)
echo "--------------------------------------------------------"
echo "🔄 جلب آخر التحديثات من main لمنع تعارضات الرفع..."
echo "--------------------------------------------------------"
if git fetch origin main --depth=10 2>/dev/null; then
  echo "✅ تم جلب أحدث شجرة فروع من GitHub."
fi

# 6. إضافة التغييرات
git add .
CHANGES_COUNT=$(git status --porcelain | wc -l)

if [ "$CHANGES_COUNT" -gt 0 ]; then
  COMMIT_MSG="${2:-تحديث وتحسينات: إضافة تحليلات العطار D3 ومجتمع شام}"
  git commit -m "$COMMIT_MSG"
  echo "✅ تم حفظ التعديلات محلياً كـ commit: \"$COMMIT_MSG\""
else
  echo "ℹ️ لا توجد تعديلات جديدة غير محفوظة."
fi

# 7. الإرسال في حال توفر التوكن أو توجيه المستخدم
if [ -n "$TOKEN" ]; then
  echo "--------------------------------------------------------"
  echo "🚀 جاري الرفع المباشر إلى GitHub..."
  echo "--------------------------------------------------------"
  if git push -u origin main; then
    echo "🎉 تم إرسال الملفات بنجاح إلى GitHub!"
  else
    echo "⚠️ تم رفض الرفع المباشر (ربما توجد تعديلات أحدث على الخادم)."
    echo "جاري تجربة: git pull --rebase origin main ثم الرفع..."
    git pull --rebase origin main || true
    git push -u origin main || true
  fi
else
  echo "========================================================"
  echo "📋 للإرسال إلى GitHub، اختر إحدى الطرق التالية:"
  echo "========================================================"
  echo "الطريقة 1 (الأسهل والأضمن): تشغيل السكربت مع التوكن:"
  echo "   bash scripts/github-sync.sh ghp_yourPersonalAccessTokenHere"
  echo ""
  echo "الطريقة 2 (أو حفظ التوكن في ملف محلي مستبعد):"
  echo "   echo \"ghp_yourToken\" > .git_token"
  echo "   npm run sync:github"
  echo ""
  echo "الطريقة 3 (الرفع اليدوي عبر الطرفية):"
  echo "   git push -u origin main"
  echo "   اسم المستخدم: $REPO_OWNER"
  echo "   كلمة المرور: استخدم Personal Access Token (وليس كلمة سر الحساب)"
  echo "========================================================"
fi
