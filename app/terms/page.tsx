'use client';

import React from 'react';
import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 md:p-12 flex justify-center">
      <div className="w-full max-w-3xl space-y-6 bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-blue-400">Krone ERP</h1>
            <p className="text-xs opacity-70">Terms of Service, Liability Disclaimer & Copyright Policy</p>
          </div>
          <Link 
            href="/login" 
            className="text-xs bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-medium transition text-white"
          >
            Back to Login
          </Link>
        </div>

        <div className="space-y-4 text-xs opacity-90 leading-relaxed max-h-[70vh] overflow-y-auto pr-2">
          <section className="space-y-1">
            <h2 className="text-sm font-semibold text-white">1. Acceptance of Terms</h2>
            <p>By creating an account, accessing, or using Krone ERP ("the Software"), you agree to be legally bound by these Terms and Conditions. If you do not agree to every clause outlined herein, you must not use or access this application.</p>
          </section>

          <section className="space-y-1">
            <h2 className="text-sm font-semibold text-white">2. Use at Own Risk & Limitation of Liability</h2>
            <p>The Software is provided on an <strong>"as-is"</strong> and <strong>"as-available"</strong> basis without warranties of any kind, whether express or implied. You expressly understand and agree that your use of Krone ERP is entirely <strong>at your own risk</strong>.</p>
            <p>Under no circumstances shall the creators, developers, or operators of Krone ERP be held liable for any direct, indirect, incidental, special, consequential, or exemplary damages—including but not limited to financial loss, lost profits, data corruption, inventory miscalculations, or business disruption—arising out of or in connection with your use of the application.</p>
          </section>

          <section className="space-y-1">
            <h2 className="text-sm font-semibold text-white">3. Data Accuracy & Business Responsibility</h2>
            <p>You acknowledge that you are solely responsible for the accuracy, entry, management, and verification of all business records, inventory levels, repair data, expenses, and financial figures inputted into the system. Krone ERP serves strictly as a tool for organization and does not guarantee accounting compliance, tax accuracy, or legal audit clearance.</p>
          </section>

          <section className="space-y-1">
            <h2 className="text-sm font-semibold text-white">4. Ownership, Intellectual Property & Copyright Protection</h2>
            <p>Krone ERP is a proprietary product owned by <strong>KAS Innovations</strong>, a company founded by <strong>Kasili Daniel</strong>. All rights, title, and interest in and to the Software remain exclusively with KAS Innovations.</p>
            <p className="text-red-400 font-medium">All source code, database schematics, user interface designs, visual themes, layout components, business logic, and backend configurations associated with Krone ERP are the exclusive property of KAS Innovations and are protected under international copyright law and intellectual property treaties.</p>
            <p>You are strictly prohibited from copying, duplicating, reproducing, mirroring, distributing, licensing, selling, translating, or <strong>reverse engineering</strong> any part of this software or its codebase. Any unauthorized duplication or extraction of application features will result in immediate legal action and account termination.</p>
          </section>

          <section className="space-y-1">
            <h2 className="text-sm font-semibold text-white">5. Account Security & Cloud Storage</h2>
            <p>Your workspace data is securely hosted utilizing Supabase infrastructure. You are responsible for maintaining the strict confidentiality of your login credentials and session tokens. Any activity or transaction performed under your account is your sole legal responsibility.</p>
          </section>
        </div>

        <div className="border-t border-slate-800 pt-4 flex justify-between items-center text-[11px] opacity-60">
          <span>&copy; {new Date().getFullYear()} Krone ERP, a product of KAS Innovations. All Rights Reserved.</span>
          <Link href="/login" className="hover:underline">Return to Workspace Sign In</Link>
        </div>
      </div>
    </main>
  );
}