#!/usr/bin/env bash
set -e

# ==============================================================================
# سكربت فحص وتجهيز وإرسال الملفات إلى GitHub
# Sham Perfume — GitHub Push & Sync Utility
# ==============================================================================

echo "======================================================"
echo "🔍 بدء فحص وتجهيز الملفات للإرسال إلى GitHub..."
echo "======================================================"

REPO_URL="https://github.com/spculculat-oss/Sham-Perfume.git"

# 1. التحقق من إعدادات Git المحلية
if [ ! -d ".git" ]; then
  echo "📦 تهيئة مستودع Git محلياً..."
  git init -q
  git branch -M main
fi

# التأكد من الفرع الرئيسي main
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
if [ "$CURRENT_BRANCH" != "main" ]; then
  git checkout -B main
fi

# التأكد من remote origin
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "🔗 ربط المستودع بـ $REPO_URL..."
  git remote add origin "$REPO_URL"
else
  git remote set-url origin "$REPO_URL"
fi

# ضبط هوية المستخدم في حال عدم وجودها
USER_NAME=$(git config user.name || echo "")
USER_EMAIL=$(git config user.email || echo "")

if [ -z "$USER_NAME" ]; then
  git config user.name "spculculat-oss"
fi
if [ -z "$USER_EMAIL" ]; then
  git config user.email "s.p.culculat@gmail.com"
fi

echo "✅ إعدادات Git جاهزة (المستخدم: $(git config user.name) <$(git config user.email)>)"

# 2. فحص سلامة الأنواع والاختبارات قبل الإرسال (تجنب فشل GitHub Actions)
echo "------------------------------------------------------"
echo "🧪 فحص سلامة الكود والاختبارات (TypeScript & Tests)..."
echo "------------------------------------------------------"

if npm run lint; then
  echo "✅ فحص TypeScript سليم 100% (Lint Passed)"
else
  echo "❌ خطأ في فحص الأنواع (Lint Failed). يُرجى حل أخطاء TypeScript قبل الإرسال."
  exit 1
fi

# 3. التأكد من عدم وجود ملفات عملاقة تخالف حدود GitHub (أكثر من 50MB)
echo "------------------------------------------------------"
echo "📏 فحص أحجام الملفات..."
echo "------------------------------------------------------"
OVERSIZED=$(find . -type f \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/.community_data/*" \
  -not -path "*/.data/*" \
  -not -path "*/.edgeone/*" \
  -not -path "*/.vercel/*" \
  -not -path "*/dist/*" \
  -size +50M 2>/dev/null || true)
if [ -n "$OVERSIZED" ]; then
  echo "⚠️ تنبيه: تم العثور على ملفات حجمها أكبر من 50MB قد يرفضها GitHub:"
  echo "$OVERSIZED"
  echo "يرجى إضافتها إلى .gitignore قبل المتابعة."
  exit 1
else
  echo "✅ جميع الملفات ضمن الحدود المسموحة لـ GitHub (<50MB)."
fi

# 4. حالة التغييرات
echo "------------------------------------------------------"
echo "📋 حالة الملفات المحلية:"
echo "------------------------------------------------------"
git status --short

COMMIT_MSG="${1:-تحديث وتحسينات على منصة وعطور شام}"

# 5. التوجيه لطرق الإرسال
echo "======================================================"
echo "🚀 خطوات إرسال الملفات بنجاح إلى GitHub:"
echo "======================================================"
echo "1. لإضافة التغييرات وتثبيتها:"
echo "   git add ."
echo "   git commit -m \"$COMMIT_MSG\""
echo ""
echo "2. لجلب آخر التحديثات من الخادم بدون تعارض:"
echo "   git pull --rebase origin main"
echo ""
echo "3. للإرسال إلى GitHub (عبر Personal Access Token):"
echo "   git push -u origin main"
echo ""
echo "💡 ملاحظة: إذا طلب منك GitHub اسم المستخدم وكلمة المرور:"
echo "   - اسم المستخدم: spculculat-oss"
echo "   - كلمة المرور: استخدم GitHub Personal Access Token (PAT) وليس كلمة سر الحساب."
echo "   (يمكن استخراج التوكن من: GitHub -> Settings -> Developer settings -> Personal access tokens)"
echo "======================================================"
