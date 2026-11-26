import { SITE } from '@/config/site';

/** Shop-wide constants shared by pricing, cart and checkout logic. */
export const FREE_SHIPPING_THRESHOLD = SITE.freeShippingThresholdUsd;
export const STANDARD_SHIPPING_FEE = SITE.standardShippingFeeUsd;
export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;
export const CATALOG_PAGE_SIZE = 6;
