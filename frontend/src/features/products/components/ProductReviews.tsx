'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Flag, Pencil, ShieldCheck, Star, ThumbsUp, Trash2 } from 'lucide-react';
import type { RatingSummary, Review, ReviewSort } from '@/types/store';
import { api } from '@/services/api';
import { useStore } from '@/context/StoreContext';

const PAGE_SIZE = 5;

const SORT_OPTIONS: Array<{ id: ReviewSort; label: string }> = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'highest', label: 'Highest rated' },
  { id: 'lowest', label: 'Lowest rated' },
  { id: 'helpful', label: 'Most helpful' },
];

const REPORT_REASONS = ['Spam or advertising', 'Offensive language', 'Not a real review'];

interface ProductReviewsProps {
  productId: string;
  productName: string;
  initialReviews: Review[];
  initialRatingSummary: RatingSummary;
  initialTotal?: number;
  onSummaryChange?: (summary: RatingSummary) => void;
}

function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const dimension = size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${dimension} ${star <= Math.round(value) ? 'fill-neutral-950 text-neutral-950' : 'text-neutral-300'}`}
        />
      ))}
    </div>
  );
}

const ReviewSkeleton = () => (
  <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 animate-pulse">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-neutral-100" />
      <div className="space-y-2">
        <div className="h-3 w-28 rounded bg-neutral-100" />
        <div className="h-3 w-20 rounded bg-neutral-100" />
      </div>
    </div>
    <div className="mt-4 h-3 w-full rounded bg-neutral-100" />
    <div className="mt-2 h-3 w-2/3 rounded bg-neutral-100" />
  </div>
);

export const ProductReviews: React.FC<ProductReviewsProps> = ({
  productId,
  productName,
  initialReviews,
  initialRatingSummary,
  initialTotal,
  onSummaryChange,
}) => {
  const { user, notify, navigate } = useStore();

  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [summary, setSummary] = useState<RatingSummary>(initialRatingSummary);
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [ratingFilter, setRatingFilter] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    Math.max(1, Math.ceil((initialTotal ?? initialRatingSummary.total) / PAGE_SIZE)),
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ownReview, setOwnReview] = useState<Review | null>(null);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [draftRating, setDraftRating] = useState(0);
  const [draftComment, setDraftComment] = useState('');
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const summaryRef = useRef(onSummaryChange);
  summaryRef.current = onSummaryChange;

  const applySummary = useCallback((next: RatingSummary) => {
    setSummary(next);
    summaryRef.current?.(next);
  }, []);

  const fetchPage = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      if (mode === 'append') setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await api.getProductReviews(productId, {
          page: targetPage,
          limit: PAGE_SIZE,
          sort,
          rating: ratingFilter || undefined,
        });
        setReviews((prev) => {
          if (mode === 'replace') return res.reviews;
          const seen = new Set(prev.map((rev) => rev.id));
          return [...prev, ...res.reviews.filter((rev) => !seen.has(rev.id))];
        });
        setPage(res.pagination.page);
        setTotalPages(res.pagination.totalPages);
        applySummary(res.ratingSummary);
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Could not load reviews.', 'error');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [productId, sort, ratingFilter, applySummary, notify],
  );

  // Keep the list in step with a fresh product fetch from the parent page.
  useEffect(() => {
    setReviews(initialReviews);
  }, [initialReviews]);

  useEffect(() => {
    setSummary(initialRatingSummary);
  }, [initialRatingSummary]);

  // Sorting and star filters re-query the first page; the first render already
  // has server-rendered page 1, so it is skipped.
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    fetchPage(1, 'replace');
  }, [fetchPage]);

  useEffect(() => {
    if (!user) {
      setOwnReview(null);
      setMyReviews([]);
      return;
    }
    let active = true;
    api
      .getMyReviews()
      .then((res) => {
        if (!active) return;
        setMyReviews(res.reviews);
        setOwnReview(res.reviews.find((rev) => rev.productId === productId) ?? null);
      })
      .catch(() => {
        if (!active) return;
        setOwnReview(null);
        setMyReviews([]);
      });
    return () => {
      active = false;
    };
  }, [user, productId]);

  const requireAuth = (message: string): boolean => {
    if (user) return true;
    notify(message, 'info');
    navigate({ page: 'signup' });
    return false;
  };

  const openForm = () => {
    if (!requireAuth('Sign in to rate this product.')) return;
    setDraftRating(ownReview?.rating ?? 0);
    setDraftComment(ownReview?.comment ?? '');
    setFormOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requireAuth('Sign in to rate this product.')) return;
    if (draftRating < 1) {
      notify('Pick a star rating from 1 to 5.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = ownReview
        ? await api.updateReview(ownReview.id, { rating: draftRating, comment: draftComment })
        : await api.createReview(productId, { rating: draftRating, comment: draftComment });
      setOwnReview(res.review);
      setMyReviews((prev) => {
        const rest = prev.filter((rev) => rev.id !== res.review.id);
        return [res.review, ...rest];
      });
      notify(ownReview ? 'Your rating was updated.' : 'Thanks — your rating is live.', 'success');
      setFormOpen(false);
      await fetchPage(1, 'replace');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save your review.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!ownReview) return;
    setSubmitting(true);
    try {
      await api.deleteReview(ownReview.id);
      setOwnReview(null);
      setMyReviews((prev) => prev.filter((rev) => rev.id !== ownReview.id));
      notify('Your review was deleted.', 'info');
      await fetchPage(1, 'replace');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete your review.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHelpful = async (review: Review) => {
    if (!requireAuth('Sign in to mark reviews as helpful.')) return;
    setBusyReviewId(review.id);
    try {
      const res = await api.toggleReviewHelpful(review.id);
      setReviews((prev) =>
        prev.map((rev) =>
          rev.id === review.id
            ? { ...rev, helpfulCount: res.helpfulCount, userHasLiked: res.liked }
            : rev,
        ),
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update this review.', 'error');
    } finally {
      setBusyReviewId(null);
    }
  };

  const handleReport = async (review: Review, reason: string) => {
    if (!requireAuth('Sign in to report a review.')) return;
    setBusyReviewId(review.id);
    try {
      const res = await api.reportReview(review.id, reason);
      setReviews((prev) =>
        prev.map((rev) =>
          rev.id === review.id
            ? { ...rev, userHasReported: true, reportCount: res.review.reportCount ?? rev.reportCount }
            : rev,
        ),
      );
      setReportingId(null);
      notify('Thanks — our team will take a look.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not report this review.', 'error');
    } finally {
      setBusyReviewId(null);
    }
  };

  const totalReviews = summary.total;
  const activeFilterLabel = ratingFilter ? `${ratingFilter}-star` : '';

  return (
    <div className="py-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Rating summary + distribution */}
      <div className="lg:col-span-4 lg:sticky lg:top-24 h-fit space-y-4">
        <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl p-6">
          <div className="flex items-end gap-3">
            <span className="font-display text-5xl font-bold text-neutral-950 tabular-nums leading-none">
              {summary.average > 0 ? summary.average.toFixed(1) : '0.0'}
            </span>
            <div>
              <Stars value={summary.average} size="lg" />
              <p className="text-xs text-neutral-500 mt-1 tabular-nums">
                {totalReviews} {totalReviews === 1 ? 'rating' : 'ratings'}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {summary.breakdown.map((row) => {
              const active = ratingFilter === row.stars;
              return (
                <button
                  key={row.stars}
                  type="button"
                  onClick={() => setRatingFilter(active ? 0 : row.stars)}
                  aria-pressed={active}
                  className="w-full flex items-center gap-2.5 text-xs group cursor-pointer"
                  title={`Show ${row.stars}-star reviews`}
                >
                  <span className={`w-7 text-left font-medium tabular-nums ${active ? 'text-neutral-950' : 'text-neutral-700'}`}>
                    {row.stars} ★
                  </span>
                  <div className="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${active ? 'bg-neutral-950' : 'bg-neutral-700 group-hover:bg-neutral-950'}`}
                      style={{ width: `${row.percentage}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-neutral-500 tabular-nums">{row.count}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={openForm}
            className="mt-5 w-full py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            {ownReview ? 'Update your rating' : 'Rate this product'}
          </button>
          {!user && (
            <p className="mt-2 text-[11px] text-neutral-500 text-center">Sign in to rate and review.</p>
          )}
        </div>

        {ownReview && !formOpen && (
          <div className="bg-white border border-neutral-950/15 rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Your rating</p>
            <div className="mt-1.5 flex items-center gap-2">
              <Stars value={ownReview.rating} />
              <span className="text-xs text-neutral-500 tabular-nums">
                {new Date(ownReview.updatedAt || ownReview.createdAt).toLocaleDateString()}
              </span>
            </div>
            {ownReview.comment && (
              <p className="mt-2 text-xs text-neutral-700 leading-relaxed line-clamp-3">{ownReview.comment}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={openForm}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-neutral-950 cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-red-500 hover:text-red-600 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            </div>
          </div>
        )}
        {user && myReviews.length > 1 && (
          <div className="bg-white border border-neutral-200/80 rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Your review history</p>
            <ul className="mt-2 space-y-2.5">
              {myReviews
                .filter((rev) => rev.productId !== productId)
                .slice(0, 3)
                .map((rev) => (
                  <li key={rev.id} className="border-b border-neutral-100 pb-2 last:border-b-0 last:pb-0">
                    <a
                      href={`/product/${rev.productSlug ?? ''}`}
                      className="text-xs font-semibold text-neutral-900 hover:underline line-clamp-1"
                    >
                      {rev.productName || 'Product'}
                    </a>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Stars value={rev.rating} />
                      <span className="text-[11px] text-neutral-400">
                        {new Date(rev.updatedAt || rev.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      {/* Write form + list */}
      <div className="lg:col-span-8 space-y-5">
        {formOpen && (
          <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-2xl p-5">
            <h3 className="font-display text-sm font-bold text-neutral-950">
              {ownReview ? `Update your rating for ${productName}` : `Rate ${productName}`}
            </h3>
            <div className="mt-3 flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setDraftRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  aria-label={`${star} star${star === 1 ? '' : 's'}`}
                  aria-pressed={draftRating === star}
                  className="p-1 rounded-md cursor-pointer"
                >
                  <Star
                    className={`w-7 h-7 transition-colors ${
                      star <= (hoverRating || draftRating)
                        ? 'fill-neutral-950 text-neutral-950'
                        : 'text-neutral-300'
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-xs font-semibold text-neutral-600 tabular-nums">
                {draftRating > 0 ? `${draftRating}/5` : 'Select a rating'}
              </span>
            </div>

            <label htmlFor="review-comment" className="mt-4 block text-xs font-semibold text-neutral-800">
              Your review <span className="font-normal text-neutral-500">(optional)</span>
            </label>
            <textarea
              id="review-comment"
              value={draftComment}
              onChange={(event) => setDraftComment(event.target.value.slice(0, 1000))}
              rows={4}
              placeholder="How is the fit, fabric and finish?"
              className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-500">
              <span>A comment is optional — a star rating is enough.</span>
              <span className="tabular-nums">{draftComment.length}/1000</span>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Saving…' : ownReview ? 'Update rating' : 'Submit rating'}
              </button>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2.5 rounded-full border border-neutral-200 text-xs font-semibold text-neutral-700 hover:border-neutral-400 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setRatingFilter(0)}
              aria-pressed={ratingFilter === 0}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                ratingFilter === 0
                  ? 'bg-neutral-950 text-white border-neutral-950'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
              }`}
            >
              All ratings
            </button>
            {summary.breakdown.map((row) => (
              <button
                key={row.stars}
                type="button"
                onClick={() => setRatingFilter(ratingFilter === row.stars ? 0 : row.stars)}
                aria-pressed={ratingFilter === row.stars}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                  ratingFilter === row.stars
                    ? 'bg-neutral-950 text-white border-neutral-950'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                }`}
              >
                {row.stars} ★
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-neutral-600">
            <span className="sr-only">Sort reviews</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ReviewSort)}
              className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 cursor-pointer"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((key) => (
              <ReviewSkeleton key={key} />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12 bg-neutral-50 rounded-2xl border border-neutral-200/70">
            <Star className="w-8 h-8 text-neutral-300 mx-auto" />
            <p className="mt-2 text-sm font-semibold text-neutral-800">
              {activeFilterLabel ? `No ${activeFilterLabel} ratings yet` : 'No ratings yet'}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              {activeFilterLabel
                ? 'Try another star filter, or be the first to rate this T-shirt.'
                : 'Be the first to rate this T-shirt — it takes one tap.'}
            </p>
            <button
              type="button"
              onClick={() => (ratingFilter ? setRatingFilter(0) : openForm())}
              className="mt-4 px-5 py-2 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
            >
              {ratingFilter ? 'Show all ratings' : 'Rate this product'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((rev) => {
              const isOwn = ownReview?.id === rev.id || (user?.id && rev.userId === user.id);
              return (
                <article key={rev.id} className="bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-neutral-200 text-neutral-800 text-xs font-bold flex items-center justify-center">
                        {rev.userName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-neutral-950">{rev.userName}</span>
                          {isOwn && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                              You
                            </span>
                          )}
                          {rev.verifiedPurchase && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600">
                              <ShieldCheck className="w-3.5 h-3.5 text-neutral-950" />
                              Verified Buyer
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Stars value={rev.rating} />
                          <span className="text-[11px] text-neutral-400">
                            {new Date(rev.createdAt).toLocaleDateString()}
                            {rev.updatedAt && rev.updatedAt !== rev.createdAt ? ' · edited' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {rev.comment ? (
                    <p className="mt-3 text-sm text-neutral-700 leading-relaxed whitespace-pre-line">{rev.comment}</p>
                  ) : (
                    <p className="mt-3 text-xs text-neutral-400 italic">Rated without a written comment.</p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-neutral-100">
                    <button
                      type="button"
                      onClick={() => handleHelpful(rev)}
                      disabled={busyReviewId === rev.id}
                      aria-pressed={Boolean(rev.userHasLiked)}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition-colors cursor-pointer ${
                        rev.userHasLiked
                          ? 'bg-neutral-950 text-white border-neutral-950'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                      }`}
                    >
                      <ThumbsUp className={`w-3.5 h-3.5 ${rev.userHasLiked ? 'fill-white' : ''}`} />
                      <span>Helpful ({rev.helpfulCount})</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {rev.userHasReported ? (
                        <span className="text-[11px] text-neutral-500">Reported</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setReportingId(reportingId === rev.id ? null : rev.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-900 cursor-pointer"
                        >
                          <Flag className="w-3 h-3" />
                          Report
                        </button>
                      )}
                    </div>
                  </div>

                  {reportingId === rev.id && (
                    <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                      <p className="text-[11px] font-semibold text-neutral-800">Why are you reporting this review?</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {REPORT_REASONS.map((reason) => (
                          <button
                            key={reason}
                            type="button"
                            onClick={() => handleReport(rev, reason)}
                            disabled={busyReviewId === rev.id}
                            className="px-2.5 py-1 rounded-full bg-white border border-neutral-200 text-[11px] font-medium text-neutral-700 hover:border-neutral-950 cursor-pointer"
                          >
                            {reason}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {page < totalPages && (
              <button
                type="button"
                onClick={() => fetchPage(page + 1, 'append')}
                disabled={loadingMore}
                className="w-full py-3 rounded-full border border-neutral-200 text-xs font-semibold text-neutral-800 hover:border-neutral-950 disabled:opacity-60 cursor-pointer"
              >
                {loadingMore ? 'Loading…' : `Load more reviews (${reviews.length} of ${totalReviews})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
