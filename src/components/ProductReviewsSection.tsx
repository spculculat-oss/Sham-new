import React, { useState, useEffect } from 'react';
import { Star, ThumbsUp, CheckCircle2, MessageSquarePlus, Sparkles, Send } from 'lucide-react';
import {
  getProductReviews,
  addProductReview,
  voteReviewHelpful,
  getProductRatingStats,
  type ProductReview,
} from '../utils/productReviews';
import type { SupportedLanguage } from '../types/i18n';
import { isRTL } from '../لغات/localizedContent';

interface Props {
  sku: string;
  productName: string;
  currentLang: SupportedLanguage;
}

export const ProductReviewsSection: React.FC<Props> = ({ sku, productName, currentLang }) => {
  const isArabic = currentLang === 'ar';
  const dir = isRTL(currentLang) ? 'rtl' : 'ltr';

  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [stats, setStats] = useState(getProductRatingStats(sku));
  const [showForm, setShowForm] = useState(false);

  // Form states
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [longevity, setLongevity] = useState<'ممتاز' | 'جيد جداً' | 'متوسط' | 'ضعيف'>('ممتاز');
  const [sillage, setSillage] = useState<'فوحان قوي' | 'معتدل' | 'هادئ وقريب'>('فوحان قوي');
  const [submittedToast, setSubmittedToast] = useState(false);

  useEffect(() => {
    setReviews(getProductReviews(sku));
    setStats(getProductRatingStats(sku));
  }, [sku]);

  const handleHelpful = (reviewId: string) => {
    if (voteReviewHelpful(sku, reviewId)) {
      setReviews(getProductReviews(sku));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    addProductReview(sku, {
      name: name.trim() || (isArabic ? 'عاشق العطور' : 'Perfume Lover'),
      rating,
      title: title.trim() || undefined,
      comment: comment.trim(),
      longevityRating: longevity,
      sillageRating: sillage,
    });

    setReviews(getProductReviews(sku));
    setStats(getProductRatingStats(sku));
    setShowForm(false);
    setComment('');
    setTitle('');
    setSubmittedToast(true);
    setTimeout(() => setSubmittedToast(false), 4000);
  };

  const ratingDescriptions: Record<number, string> = {
    5: isArabic ? 'ممتاز جداً وفوق التوقعات' : 'Exceptional & exceeds expectations',
    4: isArabic ? 'رائع وأنصح به' : 'Great & recommended',
    3: isArabic ? 'جيد ومناسب' : 'Good & suitable',
    2: isArabic ? 'أقل من المتوقع' : 'Below expectations',
    1: isArabic ? 'لم يعجبني' : 'Did not like it',
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-7 space-y-6 shadow-xs" dir={dir}>
      {/* Header & Overall Rating Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-stone-900">
              {isArabic ? 'تقييمات وآراء العملاء' : 'Customer Reviews & Ratings'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold">
              {stats.count} {isArabic ? 'تقييم' : 'reviews'}
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {isArabic
              ? `تجارب حقيقية موثقة من مقتني عطر «${productName}»`
              : `Authentic verified experiences for "${productName}"`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-700 to-amber-900 hover:from-amber-800 hover:to-amber-950 text-white text-xs font-bold shadow-md shadow-amber-900/15 transition cursor-pointer active:scale-95 shrink-0"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>{isArabic ? 'اكتب تقييمك ورأيك' : 'Write a Review'}</span>
        </button>
      </div>

      {submittedToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{isArabic ? 'شكراً لك! تم نشر تقييمك وإضافته للمنتج بنجاح 🎉' : 'Thank you! Your review was added successfully 🎉'}</span>
        </div>
      )}

      {/* Rating Score Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center bg-stone-50/80 rounded-2xl p-4 sm:p-5 border border-stone-100">
        <div className="md:col-span-4 text-center md:border-e md:border-stone-200/80 pe-0 md:pe-4 space-y-1">
          <div className="text-4xl font-black text-amber-900 tracking-tight flex items-center justify-center gap-1.5">
            <span>{stats.average}</span>
            <Star className="w-7 h-7 text-amber-500 fill-amber-500 inline" />
          </div>
          <div className="flex items-center justify-center gap-1 text-amber-500">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`w-4 h-4 ${
                  s <= Math.round(stats.average) ? 'fill-amber-500 text-amber-500' : 'text-stone-300'
                }`}
              />
            ))}
          </div>
          <p className="text-[11px] font-medium text-stone-500">
            {isArabic ? `بناءً على ${stats.count} تجربة شراء` : `Based on ${stats.count} purchases`}
          </p>
        </div>

        {/* Stars Bars */}
        <div className="md:col-span-8 space-y-1.5 text-xs">
          {[5, 4, 3, 2, 1].map((starLevel) => {
            const count = stats.distribution[starLevel] || 0;
            const pct = stats.count > 0 ? Math.round((count / stats.count) * 100) : 0;
            return (
              <div key={starLevel} className="flex items-center gap-2.5">
                <div className="flex items-center gap-1 w-12 text-stone-600 font-semibold shrink-0">
                  <span>{starLevel}</span>
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                </div>
                <div className="flex-1 h-2 rounded-full bg-stone-200 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-700 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-9 text-end text-[11px] text-stone-500 font-mono">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Review Submission Form Modal / Drawer */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-5 sm:p-6 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-4 shadow-sm animate-fadeIn"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-700" />
              <span>{isArabic ? 'إضافة تقييم جديد للعطر' : 'Add New Fragrance Review'}</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer"
            >
              {isArabic ? 'إلغاء' : 'Cancel'}
            </button>
          </div>

          {/* Star selector */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-stone-700">
              {isArabic ? 'تقييمك الإجمالي (اختر عدد النجوم):' : 'Overall Rating (Select stars):'}
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-stone-300">
                {[1, 2, 3, 4, 5].map((s) => {
                  const active = (hoverRating || rating) >= s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onMouseEnter={() => setHoverRating(s)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(s)}
                      className="p-1 transition-transform hover:scale-110 cursor-pointer"
                    >
                      <Star
                        className={`w-6 h-6 transition-colors ${
                          active ? 'fill-amber-500 text-amber-500' : 'text-stone-300'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              <span className="text-xs font-semibold text-amber-900">
                {ratingDescriptions[hoverRating || rating]}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                {isArabic ? 'اسمك أو لقبك' : 'Your Name'}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isArabic ? 'مثال: أحمد عبد الله' : 'e.g. John Doe'}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-200"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                {isArabic ? 'عنوان مختصر لرأيك (اختياري)' : 'Headline (Optional)'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isArabic ? 'مثال: عطر شتوي فاخر جداً' : 'e.g. Luxury winter scent'}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-200"
              />
            </div>
          </div>

          {/* Perfume Perception Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                {isArabic ? 'تقييم الثبات على الجلد والملابس:' : 'Longevity Assessment:'}
              </label>
              <select
                value={longevity}
                onChange={(e) => setLongevity(e.target.value as any)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-600"
              >
                <option value="ممتاز">{isArabic ? 'ممتاز (أكثر من 8 ساعات)' : 'Excellent (8+ hours)'}</option>
                <option value="جيد جداً">{isArabic ? 'جيد جداً (6 - 8 ساعات)' : 'Very Good (6-8 hours)'}</option>
                <option value="متوسط">{isArabic ? 'متوسط (4 - 6 ساعات)' : 'Moderate (4-6 hours)'}</option>
                <option value="ضعيف">{isArabic ? 'ضعيف (أقل من 3 ساعات)' : 'Soft (under 3 hours)'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                {isArabic ? 'تقييم الفوحان وانتشار العطر:' : 'Sillage / Projection:'}
              </label>
              <select
                value={sillage}
                onChange={(e) => setSillage(e.target.value as any)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-600"
              >
                <option value="فوحان قوي">{isArabic ? 'فوحان قوي وملحوظ' : 'Strong & noticeable'}</option>
                <option value="معتدل">{isArabic ? 'معتدل وأنيق' : 'Moderate & elegant'}</option>
                <option value="هادئ وقريب">{isArabic ? 'هادئ وقريب من البشرة' : 'Intimate & soft'}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              {isArabic ? 'تفاصيل تعليقك وتجربتك مع العطر *' : 'Detailed Review & Comments *'}
            </label>
            <textarea
              required
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                isArabic
                  ? 'اكتب كيف وجدت الرائحة، التطور، مناسبات الاستخدام، والملاحظات التي أعجبتك...'
                  : 'Share how it smelled, opened, evolved, and when you wear it...'
              }
              className="w-full rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-900 outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-200"
            />
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isArabic ? 'نشر التقييم والتعليق' : 'Post Review'}</span>
          </button>
        </form>
      )}

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.map((rev) => (
          <div
            key={rev.id}
            className="p-4 sm:p-5 rounded-2xl border border-stone-100 bg-stone-50/50 space-y-3 transition hover:bg-stone-50"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 text-amber-500">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${
                        s <= rev.rating ? 'fill-amber-500 text-amber-500' : 'text-stone-300'
                      }`}
                    />
                  ))}
                </div>
                <span className="font-bold text-xs text-stone-900">{rev.name}</span>
                {rev.verifiedPurchase && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>{isArabic ? 'مشتري موثق' : 'Verified Buyer'}</span>
                  </span>
                )}
              </div>
              <span className="text-[11px] text-stone-400 font-mono">{rev.date}</span>
            </div>

            {rev.title && <h4 className="font-bold text-xs text-stone-900">{rev.title}</h4>}

            <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-line">{rev.comment}</p>

            {/* Badges for longevity & sillage */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200/50 text-[11px]">
              <div className="flex flex-wrap items-center gap-2 text-stone-500">
                {rev.longevityRating && (
                  <span className="bg-stone-200/60 px-2 py-0.5 rounded-md">
                    {isArabic ? 'الثبات: ' : 'Longevity: '}
                    <strong className="text-stone-700">{rev.longevityRating}</strong>
                  </span>
                )}
                {rev.sillageRating && (
                  <span className="bg-stone-200/60 px-2 py-0.5 rounded-md">
                    {isArabic ? 'الفوحان: ' : 'Sillage: '}
                    <strong className="text-stone-700">{rev.sillageRating}</strong>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleHelpful(rev.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-stone-500 hover:text-amber-800 hover:bg-white border border-transparent hover:border-stone-200 transition cursor-pointer"
                title={isArabic ? 'تقييم مفيد' : 'Helpful review'}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                <span>{isArabic ? 'مفيد' : 'Helpful'}</span>
                {rev.helpfulCount > 0 && <span className="font-mono">({rev.helpfulCount})</span>}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
