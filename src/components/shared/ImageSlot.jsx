'use client';
/* eslint-disable */
import React from 'react';
import styles from './ImageSlot.module.css';

// Read-only React port of <image-slot> (reference/source/image-slot.js).
// The shadow DOM is rendered as light-DOM children of an <image-slot> host element;
// all editing (drop, browse, reframe, sidecar, window.omelette) is omitted.
// No custom element is registered.

const UNSPLASH_HOMEPAGE_HREF = 'https://unsplash.com/?utm_source=claude_design&utm_medium=referral';
const BASE = () => (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');

const isUnsplashHost = (u) => {
  try {
    return /(^|\.)unsplash\.com$/.test(new URL(u, BASE()).hostname.replace(/\.$/, ''));
  } catch {
    return false;
  }
};

const withReferral = (href) => {
  try {
    const u = new URL(href);
    if (!/(^|\.)unsplash\.com$/.test(u.hostname.replace(/\.$/, ''))) {
      return href;
    }
    if (!u.searchParams.has('utm_source')) {
      u.searchParams.set('utm_source', 'claude_design');
    }
    if (!u.searchParams.has('utm_medium')) {
      u.searchParams.set('utm_medium', 'referral');
    }
    return u.toString();
  } catch (e) {
    return href;
  }
};

const icon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

const warnIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" /><path d="M12 17h.01" />
  </svg>
);

function ImageSlot({
  id,
  shape = 'rounded',
  radius = 12,
  mask,
  fit = 'cover',
  placeholder = 'Drop an image',
  src,
  alt,
  credit,
  creditHref,
  style,
  className,
}) {
  // Shape / mask (same rules as _render()).
  const shapeKey = String(shape || 'rounded').toLowerCase();
  let radiusCss = '';
  if (shapeKey === 'circle') radiusCss = '50%';
  else if (shapeKey === 'pill') radiusCss = '9999px';
  else if (shapeKey === 'rounded') {
    const n = parseFloat(radius);
    radiusCss = (Number.isFinite(n) ? n : 12) + 'px';
  }

  const srcAttr = src || '';
  const creditText = (credit || '').trim();
  const attrError = !!(!creditText && srcAttr && isUnsplashHost(srcAttr));
  const filled = !!(srcAttr && !attrError);
  const showCredit = !!(filled && creditText);
  const contain = String(fit || 'cover').toLowerCase() === 'contain';

  let creditNode = null;
  if (showCredit) {
    let href = '';
    const rawHref = creditHref || '';
    if (rawHref) {
      try {
        const u = new URL(rawHref, BASE());
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          href = withReferral(u.href);
        }
      } catch {}
    }
    const mkLink = (text, linkHref) => (
      <a target="_blank" rel="noopener noreferrer" href={linkHref}>{text}</a>
    );
    const m = /^Photo by (.+) on Unsplash$/.exec(creditText);
    if (m) {
      creditNode = (
        <>
          {'Photo by '}
          {href ? mkLink(m[1], href) : m[1]}
          {' on '}
          {mkLink('Unsplash', UNSPLASH_HOMEPAGE_HREF)}
        </>
      );
    } else if (href) {
      creditNode = mkLink(creditText, href);
    } else {
      creditNode = creditText;
    }
  }

  return (
    <image-slot
      id={id}
      shape={shape}
      placeholder={placeholder}
      className={[styles.host, className].filter(Boolean).join(' ')}
      style={style}
    >
      <div
        className={styles.frame}
        style={{ borderRadius: mask ? '' : radiusCss, clipPath: mask || '' }}
      >
        {filled ? (
          <img
            className={styles.img}
            src={srcAttr}
            alt={alt || ''}
            draggable="false"
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              left: '50%',
              top: '50%',
              objectFit: contain ? 'contain' : 'cover',
            }}
          />
        ) : null}
        {!filled && !attrError ? (
          <div className={styles.empty}>
            {icon}
            <div className={styles.cap}>{placeholder || 'Drop an image'}</div>
          </div>
        ) : null}
        {attrError ? (
          <div className={styles.attrError}>
            {warnIcon}
            <div className={styles.attrCap}>This photo needs attribution</div>
          </div>
        ) : null}
        {!filled && !attrError ? (
          <div
            className={styles.ring}
            style={{ borderRadius: mask ? '' : radiusCss, display: mask ? 'none' : '' }}
          />
        ) : null}
      </div>
      {showCredit ? <span className={styles.credit}>{creditNode}</span> : null}
    </image-slot>
  );
}

export default ImageSlot;
export { ImageSlot };
