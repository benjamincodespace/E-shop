'use client';

import React, { useState } from 'react';
import { Flag, MessageSquare, Star } from 'lucide-react';
import type { AdminReviewStats, Product, Review } from '@/types/store';

interface AdminReviewsPanelProps {
  reviews: Review[];
  stats: AdminReviewStats | null;
  products: Product[];
  onRemove: (reviewId: string) => void;
  onResolveReports: (reviewId: string) => void;
  /** Sellers may read their product feedback but not moderate it. */
  readOnly?: boolean;
}

/** Review moderation desk: filter, inspect stats and remove/clear reports. */
export const AdminReviewsPanel: React.FC<AdminReviewsPanelProps> = ({
  reviews,
  stats,
  products,
  onRemove,
  onResolveReports,
  readOnly = false,
}) => {
  const [productFilter, setProductFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState(0);
  const [reportedOnly, setReportedOnly] = useState(false);

  const filtered = reviews.filter((rev) => {
    if (productFilter && rev.productId !== productFilter) return false;
    if (ratingFilter && rev.rating !== ratingFilter) return false;
    if (reportedOnly && !rev.reported) return false;
    return true;
  });

  const cards = [
    { label: 'Total reviews', value: stats?.total ?? reviews.length },
    { label: 'Average rating', value: stats ? stats.average.toFixed(1) : '0.0' },
    { label: 'Reported', value: stats?.reported ?? 0 },
    { label: 'Verified buyers', value: stats?.verified ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-neutral-950">Product Reviews &amp; Ratings</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {readOnly
              ? 'Customer feedback on your products. Only the platform owner can moderate reviews.'
              : 'Moderate customer feedback, remove inappropriate content and clear reported reviews.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
            aria-label="Filter reviews by product"
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 cursor-pointer max-w-[190px]"
          >
            <option value="">All products</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <select
            value={ratingFilter}
            onChange={(event) => setRatingFilter(Number(event.target.value))}
            aria-label="Filter reviews by rating"
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 cursor-pointer"
          >
            <option value={0}>All ratings</option>
            {[5, 4, 3, 2, 1].map((stars) => (
              <option key={stars} value={stars}>
                {stars} star
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 cursor-pointer">
            <input
              type="checkbox"
              checked={reportedOnly}
              onChange={(event) => setReportedOnly(event.target.checked)}
              className="accent-neutral-950"
            />
            Reported only
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-white border border-neutral-200/80 rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{card.label}</p>
            <p className="mt-1 font-mono-num text-xl font-bold text-neutral-950 tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      {stats && stats.total > 0 && (
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {stats.breakdown.map((row) => (
              <div key={row.stars} className="flex items-center gap-2 text-[11px]">
                <span className="w-7 font-semibold text-neutral-700 tabular-nums">{row.stars} ★</span>
                <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                  <div className="h-full bg-neutral-950" style={{ width: `${row.percentage}%` }} />
                </div>
                <span className="w-6 text-right text-neutral-500 tabular-nums">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Showing {filtered.length} of {reviews.length} reviews
      </p>

      {filtered.length === 0 ? (
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-10 text-center">
          <MessageSquare className="w-8 h-8 text-neutral-300 mx-auto" />
          <p className="mt-2 text-sm font-semibold text-neutral-800">No reviews match these filters</p>
          <p className="text-xs text-neutral-500 mt-1">Clear the filters to see every review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((rev) => (
            <div
              key={rev.id}
              className={`bg-white border rounded-2xl p-4 ${rev.reported ? 'border-amber-300' : 'border-neutral-200/80'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="font-bold text-neutral-950">{rev.userName}</span>
                    <span className="text-neutral-400">on</span>
                    <span className="font-semibold text-neutral-800">{rev.productName}</span>
                    {rev.verifiedPurchase && (
                      <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-700">
                        Verified
                      </span>
                    )}
                    {rev.reported && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-[10px] font-semibold text-amber-800">
                        <Flag className="w-3 h-3" />
                        Reported ({rev.reportCount ?? 0})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${star <= rev.rating ? 'star-gold' : 'text-neutral-300'}`}
                      />
                    ))}
                    <span className="ml-1 text-[11px] text-neutral-400">
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-neutral-700">
                    {rev.comment || <span className="italic text-neutral-400">Rating only, no comment.</span>}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {!readOnly && (
                  <>
                  <button
                    type="button"
                    onClick={() => onRemove(rev.id)}
                    aria-label={`Remove review by ${rev.userName}`}
                    className="px-3 py-1.5 rounded-full border border-neutral-200 hover:border-red-500 hover:text-red-600 text-xs font-semibold text-neutral-700 cursor-pointer"
                  >
                    Remove
                  </button>
                  {rev.reported && (
                    <button
                      type="button"
                      onClick={() => onResolveReports(rev.id)}
                      className="px-3 py-1.5 rounded-full border border-neutral-200 hover:border-neutral-950 text-[11px] font-semibold text-neutral-700 cursor-pointer"
                    >
                      Dismiss reports
                    </button>
                  )}
                  </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
