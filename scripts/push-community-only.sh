#!/usr/bin/env bash
set -e

# ==============================================================================
# سكربت رفع «مجتمع شام فقط» إلى مستودع GitHub
# Push ONLY Sham Community to GitHub
# ==============================================================================

REPO_OWNER="spculculat-oss"
REPO_NAME="Sham-Perfume"
REPO_BASE="github.com/${REPO_OWNER}/${REPO_NAME}.git"
DEFAULT_EMAIL="s.p.culculat@gmail.com"
TARGET_BRANCH="${2:-main}"

echo "========================================================"
echo "🌟 رفع ملفات «مجتمع شام فقط» إلى مستودع GitHub"
echo "Target Branch: $TARGET_BRANCH"
echo "========================================================"

# التأكد من تهيئة git
if [ ! -d ".git" ]; then
  git init -q
  git branch -M main 2>/dev/null || true
fi

# التأكد من هوية Git
git config user.name "$REPO_OWNER"
git config user.email "$DEFAULT_EMAIL"

# قراءة التوكن إما كمعامل أول أو من البيئة أو من ملف .git_token
TOKEN="${1:-$GITHUB_TOKEN}"
if [ -z "$TOKEN" ] && [ -f ".git_token" ]; then
  TOKEN=$(cat .git_token | tr -d '\r\n ')
fi

if [ -n "$TOKEN" ]; then
  REMOTE_AUTH="https://${TOKEN}@${REPO_BASE}"
  git remote set-url origin "$REMOTE_AUTH" 2>/dev/null || git remote add origin "$REMOTE_AUTH"
  echo "🔑 تم التعرف على توكن المصادقة."
else
  REMOTE_URL="https://${REPO_BASE}"
  git remote set-url origin "$REMOTE_URL" 2>/dev/null || git remote add origin "$REMOTE_URL"
fi

# 1. إلغاء أي stage حالي
git reset -q 2>/dev/null || true

# 2. إضافة ملفات «مجتمع شام» فقط
echo "📦 جاري تحديد وتجهيز ملفات المجتمع فقط..."
git add \
  src/community/ \
  server/community/ \
  tests/community.test.ts \
  server/app.ts \
  package.json \
  bun.lock

# إضافة أسطر المجتمع في App.tsx و Header.tsx
git add src/App.tsx src/components/Header.tsx 2>/dev/null || true

# فحص ما تم اختياره
echo "📋 الملفات المحددة للرفع (Community Files Only):"
git status --short

# عمل commit مخصص للمجتمع فقط
COMMIT_MSG="إضافة وتطوير «مجتمع شام»: المنصة الاجتماعية المدمجة والماسنجر ومجلس النقاش"
git commit -m "$COMMIT_MSG" || echo "ℹ️ الملفات محفوظة بالفعل في commit."

# إذا كان هناك توكن، قم بالرفع فوراً
if [ -n "$TOKEN" ]; then
  echo "🚀 جاري الرفع المباشر إلى فرع $TARGET_BRANCH على GitHub..."
  if git push -u origin "HEAD:${TARGET_BRANCH}"; then
    echo "🎉 تم رفع «مجتمع شام» بنجاح تام إلى GitHub على فرع $TARGET_BRANCH!"
  else
    echo "⚠️ حدث تعارض بسيط مع الخادم البعيد، جاري المزامنة..."
    git pull --rebase origin "$TARGET_BRANCH" || true
    git push -u origin "HEAD:${TARGET_BRANCH}"
    echo "🎉 تم الرفع بنجاح بعد المزامنة!"
  fi
else
  echo ""
  echo "========================================================"
  echo "🔒 مطلوب رمز الوصول (Personal Access Token) للموافقة على الرفع"
  echo "========================================================"
  echo "يرجى نسخ ولصق الأمر التالي مع وضع التوكن الخاص بك:"
  echo ""
  echo "  bash scripts/push-community-only.sh ghp_YourPersonalAccessToken"
  echo ""
  echo "أو يمكنك كتابة التوكن هنا في المحادثة وسأقوم برفعه لك فوراً!"
  echo "========================================================"
fi
