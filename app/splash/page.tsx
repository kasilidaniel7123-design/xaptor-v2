'use client';

import React, { useEffect } from 'react';

export default function SplashPage() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.replace('/login');
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white flex flex-col items-center justify-center">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-[120px]" />

        <div className="absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.03]" />

        <div className="absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.02]" />
      </div>

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />

      {/* Main content */}
      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-6 text-center">
        {/* Logo */}
        <div className="relative mb-8">
          {/* Soft glow behind logo */}
          <div className="absolute inset-0 scale-75 rounded-full bg-blue-500/20 blur-3xl" />

          <div className="relative flex h-28 w-28 items-center justify-center">
            <svg
              viewBox="0 0 100 100"
              className="h-28 w-28 animate-[logoFloat_3s_ease-in-out_infinite]"
              aria-label="XAPTOR logo"
              role="img"
            >
              {/* Outer hexagon */}
              <polygon
                points="50,3 95,26 95,74 50,97 5,74 5,26"
                fill="none"
                stroke="rgba(96,165,250,0.95)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Inner hexagon */}
              <polygon
                points="50,18 82,34 82,66 50,82 18,66 18,34"
                fill="none"
                stroke="rgba(147,197,253,0.7)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Central shape */}
              <circle
                cx="50"
                cy="50"
                r="12"
                fill="rgba(59,130,246,0.95)"
              />

              {/* Center highlight */}
              <circle
                cx="50"
                cy="50"
                r="5"
                fill="rgba(255,255,255,0.95)"
              />

              {/* Small accent points */}
              <circle cx="50" cy="3" r="2" fill="#60a5fa" />
              <circle cx="95" cy="26" r="2" fill="#60a5fa" />
              <circle cx="95" cy="74" r="2" fill="#60a5fa" />
              <circle cx="50" cy="97" r="2" fill="#60a5fa" />
              <circle cx="5" cy="74" r="2" fill="#60a5fa" />
              <circle cx="5" cy="26" r="2" fill="#60a5fa" />
            </svg>
          </div>
        </div>

        {/* Brand */}
        <div className="animate-[fadeUp_0.8s_ease-out]">
          <h1 className="text-4xl font-semibold tracking-[0.28em] text-white sm:text-5xl">
            XAPTOR
          </h1>

          <div className="mx-auto mt-3 h-px w-12 bg-blue-400/70" />

          <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
            Business Management Platform
          </p>
        </div>

        {/* Loading section */}
        <div className="mt-14 w-full max-w-[280px] animate-[fadeUp_1s_ease-out]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Initializing workspace
            </span>

            <span className="text-[10px] font-medium text-blue-400">
              100%
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full w-full origin-left animate-[progress_3s_ease-out] rounded-full bg-blue-500" />
          </div>

          <p className="mt-4 text-[10px] tracking-[0.12em] text-slate-600">
            SECURE • SIMPLE • BUILT FOR BUSINESS
          </p>
        </div>
      </div>

      {/* Bottom branding */}
      <div className="absolute bottom-7 left-0 right-0 z-10 flex justify-center">
        <p className="text-[9px] font-medium uppercase tracking-[0.24em] text-slate-600">
          XAPTOR ERP & INVENTORY
        </p>
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes logoFloat {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }

          50% {
            transform: translateY(-4px) scale(1.015);
          }
        }

        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes progress {
          from {
            transform: scaleX(0);
          }

          to {
            transform: scaleX(1);
          }
        }
      `}</style>
    </main>
  );
}