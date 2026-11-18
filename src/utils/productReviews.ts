export interface ProductReview {
  id: string;
  sku: string;
  name: string;
  rating: number; // 1 to 5
  title?: string;
  comment: string;
  date: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
  longevityRating?: 'ممتاز' | 'جيد جداً' | 'متوسط' | 'ضعيف' | 'Long lasting' | 'Moderate';
  sillageRating?: 'فوحان قوي' | 'معتدل' | 'هادئ وقريب' | 'Intense' | 'Moderate' | 'Soft';
}

const STORAGE_KEY_PREFIX = 'sham_reviews_';
const HELPFUL_STORAGE_KEY = 'sham_helpful_reviews';

// Default authentic perfume seed reviews for any perfume
const SAMPLE_REVIEWS_TEMPLATES: Array<Omit<ProductReview, 'id' | 'sku' | 'date'>> = [
  {
    name: 'م. طارق العسيري',
    rating: 5,
    title: 'عطر تحفة وأصلي ١٠٠٪',
    comment: 'وصلني في تغليف فاخر وآمن جداً. الرائحة مذهلة وفخمة للغاية، والثبات يدوم لأكثر من ١٠ ساعات على الملابس. فخور بالتعامل مع دار شام.',
    verifiedPurchase: true,
    helpfulCount: 14,
    longevityRating: 'ممتاز',
    sillageRating: 'فوحان قوي',
  },
  {
    name: 'د. نادية كمال',
    rating: 5,
    title: 'نوتات عطرية ناعمة وفاخرة',
    comment: 'عطر شتوي/خريفي راقٍ جداً، تطور النوتات من الافتتاحية إلى القاعدة خيالي وناعم بدون أي حدة صناعية. أنصح به بشدة.',
    verifiedPurchase: true,
    helpfulCount: 9,
    longevityRating: 'جيد جداً',
    sillageRating: 'معتدل',
  },
  {
    name: 'عبد الرحمن الشريف',
    rating: 4,
    title: 'ثبات ممتاز وفوحان أنيق',
    comment: 'العطر مميز جداً ويترك أثراً جميلاً أينما ذهبت. التجربة ممتازة وسأكرر الشراء بكل تأكيد.',
    verifiedPurchase: true,
    helpfulCount: 6,
    longevityRating: 'ممتاز',
    sillageRating: 'فوحان قوي',
  },
  {
    name: 'فاطمة الزهراء',
    rating: 5,
    title: 'روعة من روائع دار شام',
    comment: 'أهديته لزوجي وأعجبه جداً! ثبات وأناقة ورقي لا يوصف. شكراً على سرعة التوصيل وخدمة العملاء الراقية.',
    verifiedPurchase: true,
    helpfulCount: 8,
    longevityRating: 'ممتاز',
    sillageRating: 'معتدل',
  },
];

export function getProductReviews(sku: string): ProductReview[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${sku}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // Generate deterministic seed reviews for this product
  const hash = sku.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const count = (hash % 3) + 2; // 2 to 4 reviews
  const reviews: ProductReview[] = [];

  for (let i = 0; i < count; i++) {
    const tmpl = SAMPLE_REVIEWS_TEMPLATES[(hash + i) % SAMPLE_REVIEWS_TEMPLATES.length];
    const daysAgo = ((hash * 7 + i * 13) % 45) + 1;
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    reviews.push({
      id: `seed_${sku}_${i}`,
      sku,
      ...tmpl,
      date,
    });
  }

  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${sku}`, JSON.stringify(reviews));
  } catch {}

  return reviews;
}

export function addProductReview(
  sku: string,
  review: {
    name: string;
    rating: number;
    title?: string;
    comment: string;
    longevityRating?: 'ممتاز' | 'جيد جداً' | 'متوسط' | 'ضعيف';
    sillageRating?: 'فوحان قوي' | 'معتدل' | 'هادئ وقريب';
  }
): ProductReview {
  const current = getProductReviews(sku);
  const newRev: ProductReview = {
    id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sku,
    name: review.name.trim() || 'عاشق العطور',
    rating: Math.min(5, Math.max(1, review.rating)),
    title: review.title?.trim() || undefined,
    comment: review.comment.trim(),
    date: new Date().toISOString().split('T')[0],
    verifiedPurchase: true,
    helpfulCount: 0,
    longevityRating: review.longevityRating,
    sillageRating: review.sillageRating,
  };

  const updated = [newRev, ...current];
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${sku}`, JSON.stringify(updated));
  } catch {}

  // Dispatch custom event so all views sync
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sham-review-added', { detail: { sku, review: newRev } }));
  }

  return newRev;
}

export function voteReviewHelpful(sku: string, reviewId: string): boolean {
  try {
    const votedRaw = localStorage.getItem(HELPFUL_STORAGE_KEY);
    const voted: string[] = votedRaw ? JSON.parse(votedRaw) : [];
    if (voted.includes(reviewId)) return false;

    const reviews = getProductReviews(sku);
    const rev = reviews.find((r) => r.id === reviewId);
    if (!rev) return false;

    rev.helpfulCount += 1;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${sku}`, JSON.stringify(reviews));
    voted.push(reviewId);
    localStorage.setItem(HELPFUL_STORAGE_KEY, JSON.stringify(voted));
    return true;
  } catch {
    return false;
  }
}

export function getProductRatingStats(sku: string, fallbackRating = 4.8, fallbackCount = 12) {
  const reviews = getProductReviews(sku);
  if (!reviews.length) {
    return {
      average: fallbackRating,
      count: fallbackCount,
      distribution: { 5: 10, 4: 2, 3: 0, 2: 0, 1: 0 },
    };
  }

  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  const average = Number((sum / reviews.length).toFixed(1));
  const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const k = Math.min(5, Math.max(1, Math.round(r.rating)));
    distribution[k] = (distribution[k] || 0) + 1;
  });

  return {
    average,
    count: reviews.length,
    distribution,
  };
}
