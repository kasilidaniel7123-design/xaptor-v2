'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot'>('signin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [theme, setTheme] = useState<'dark' | 'red-galaxy' | 'light'>('dark');

  // Set in the browser after load (reading the date while the page is
  // being built breaks the Next.js build)
  const [year, setYear] = useState('');
  useEffect(() => {
    setYear(String(new Date().getFullYear()));
  }, []);

  const switchMode = (mode: 'signin' | 'signup' | 'forgot') => {
    setAuthMode(mode);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (authMode === 'signup') {
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match. Please re-enter your confirmation password.');
        return;
      }
      if (!agreedToTerms) {
        setErrorMsg('You must agree to the Terms, Conditions, and Copyright policy before creating an account.');
        return;
      }
    }

    setLoading(true);

    if (authMode === 'signup') {
      // Clear any existing session before creating a new account
      await supabase.auth.signOut();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      // Check if user already exists (Supabase returns an empty identity array)
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setErrorMsg('An account with this email address already exists. Please sign in instead.');
        setLoading(false);
        return;
      }

      // Clear the session so the user must sign in after confirmation
      await supabase.auth.signOut();

      setSuccessMsg('Account created! Please check your email and confirm your address before signing in.');
      setAuthMode('signin');
      setAgreedToTerms(false);
      setPassword('');
      setConfirmPassword('');
    } else if (authMode === 'signin') {
      // Clear any leftover session from a previous user
      await supabase.auth.signOut();

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setErrorMsg('Please confirm your email address before signing in. Check your inbox for the confirmation link.');
        } else {
          setErrorMsg(error.message);
        }
        setLoading(false);
        return;
      }

      if (!data.session || !data.user) {
        setErrorMsg('Sign in did not complete. Please confirm your email and try again.');
        setLoading(false);
        return;
      }

      // Fetch role
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileErr) {
        setErrorMsg('Could not load your account details: ' + profileErr.message);
        setLoading(false);
        return;
      }

      // Admins go to /admin, everyone else to the main dashboard
      if (profile?.role === 'admin') {
        window.location.replace('/admin');
        return;
      }

      window.location.replace('/dashboard');
      return;
    } else if (authMode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg('Password reset instructions have been sent to your email.');
      }
    }
    setLoading(false);
  };

  const themeBg = theme === 'light' ? 'bg-slate-100 text-slate-900' : theme === 'red-galaxy' ? 'bg-[#120507] text-white' : 'bg-slate-950 text-white';
  const cardBg = theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : theme === 'red-galaxy' ? 'bg-[#1c080b] border-red-950 text-white' : 'bg-slate-900 border-slate-800 text-white';
  const primaryBtn = theme === 'red-galaxy' ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white';

  return (
    <main className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 relative ${themeBg}`}>
      <div className="absolute top-4 right-4 flex bg-black/30 p-1 rounded-lg border border-white/10 text-xs">
        <button onClick={() => setTheme('dark')} className={`px-2.5 py-1 rounded ${theme === 'dark' ? 'bg-blue-600 text-white font-bold' : 'opacity-70 hover:opacity-100'}`}>Dark</button>
        <button onClick={() => setTheme('red-galaxy')} className={`px-2.5 py-1 rounded ${theme === 'red-galaxy' ? 'bg-red-700 text-white font-bold' : 'opacity-70 hover:opacity-100'}`}>Galaxy Red</button>
        <button onClick={() => setTheme('light')} className={`px-2.5 py-1 rounded ${theme === 'light' ? 'bg-slate-300 text-slate-900 font-bold' : 'opacity-70 hover:opacity-100'}`}>Light</button>
      </div>

      <div className={`w-full max-w-md p-8 rounded-2xl shadow-2xl border space-y-6 ${cardBg}`}>
        <div className="text-center space-y-2">
          <h1 className={`text-3xl font-bold tracking-tight ${theme === 'red-galaxy' ? 'text-red-500' : 'text-blue-400'}`}>Xaptor</h1>
          <p className="text-xs opacity-75">
            {authMode === 'signup' && 'Create your account'}
            {authMode === 'signin' && 'Sign in to access your workspace'}
            {authMode === 'forgot' && 'Reset your account password'}
          </p>
        </div>

        {authMode !== 'forgot' && (
          <div className="grid grid-cols-2 gap-1 bg-black/30 p-1 rounded-xl border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`py-2 rounded-lg font-medium transition ${authMode === 'signin' ? `${primaryBtn} shadow` : 'opacity-70 hover:opacity-100'}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`py-2 rounded-lg font-medium transition ${authMode === 'signup' ? `${primaryBtn} shadow` : 'opacity-70 hover:opacity-100'}`}
            >
              Sign Up
            </button>
          </div>
        )}

        {errorMsg && <div className="bg-red-950/50 border border-red-800 text-red-400 p-3 rounded-lg text-xs">{errorMsg}</div>}
        {successMsg && <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-400 p-3 rounded-lg text-xs">{successMsg}</div>}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1 opacity-75">Email Address</label>
            <input type="email" required placeholder="owner@business.com" className="w-full bg-black/40 border border-white/20 rounded-lg p-2.5 text-sm focus:outline-none focus:border-blue-500" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          {authMode !== 'forgot' && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-medium opacity-75">Password</label>
                {authMode === 'signin' && (
                  <button type="button" onClick={() => switchMode('forgot')} className="text-[11px] opacity-70 hover:opacity-100 hover:underline">Forgot password?</button>
                )}
              </div>
              <input type="password" required placeholder="••••••••" className="w-full bg-black/40 border border-white/20 rounded-lg p-2.5 text-sm focus:outline-none focus:border-blue-500" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}

          {authMode === 'signup' && (
            <div>
              <label className="block text-xs font-medium mb-1 opacity-75">Confirm Password</label>
              <input type="password" required placeholder="••••••••" className="w-full bg-black/40 border border-white/20 rounded-lg p-2.5 text-sm focus:outline-none focus:border-blue-500" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          )}

          {authMode === 'signup' && (
            <div className="bg-black/25 p-3 rounded-lg border border-white/10 flex items-start gap-2">
              <input type="checkbox" id="terms" required className="mt-0.5 accent-blue-600 h-4 w-4" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />
              <label htmlFor="terms" className="text-xs leading-tight opacity-90 cursor-pointer">
                I agree to the{' '}
                <Link href="/terms" target="_blank" className="text-blue-400 font-semibold underline hover:text-blue-300">Terms & Conditions and Copyright Policy</Link>
                . I understand the application is used at my own risk and that copying, duplication, or reverse engineering is strictly prohibited.
              </label>
            </div>
          )}

          <button type="submit" disabled={loading} className={`w-full font-semibold text-xs py-3 rounded-lg shadow transition ${primaryBtn} disabled:opacity-50`}>
            {loading ? 'Processing...' : authMode === 'signup' ? 'Create Account' : authMode === 'signin' ? 'Sign In to Workspace' : 'Send Reset Instructions'}
          </button>
        </form>

        {authMode === 'forgot' && (
          <div className="text-center">
            <button type="button" onClick={() => switchMode('signin')} className="text-xs opacity-75 hover:opacity-100 hover:underline">Back to Sign In</button>
          </div>
        )}

        <div className="text-center text-[11px] opacity-60 pt-2">
          &copy; {year} Xaptor. All Rights Reserved. Unauthorized duplication is strictly prohibited.
        </div>
      </div>
    </main>
  );
}