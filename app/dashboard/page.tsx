'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// Constants
// ============================================================
const MATERIAL_CATEGORIES = ['Plastic', 'Metal', 'Paper & Cardboard', 'Glass', 'E-Waste', 'Rubber', 'Textiles', 'Other'];
const EQUIPMENT_CATEGORIES = ['Machinery', 'Vehicle', 'Hand Tools', 'Safety Gear', 'Bins & Containers', 'Weighing Scale', 'Other'];
const EQUIPMENT_CONDITIONS = ['Good', 'Fair', 'Needs Repair', 'Out of Service'];

// ============================================================
// Types
// ============================================================
interface BusinessProfile {
  name: string;
  location: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
}

interface Material {
  id: number;
  name: string;
  category: string;
  quantityKg: number;
  ratePerKg: number;
  minAlertKg: number;
}

interface EquipmentItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  condition: string;
  unitValue: number;
  dateAcquired: string | null;
  notes: string;
}

interface MaterialIntake {
  id: number;
  material_id: number | null;
  material_name: string;
  category: string;
  supplier_name: string;
  supplier_phone: string;
  weight_kg: number;
  rate_per_kg: number;
  amount_paid: number;
  payment_method: 'Cash' | 'Mobile Money';
  date_str: string;
  archived_from_analysis: boolean;
}

interface DailyExpense {
  id: number;
  description: string;
  amount: number;
  date_str: string;
  archived_from_analysis: boolean;
}

// Wastage (rejected / spoiled material). quantity is in KG.
interface DamagedGood {
  id: number;
  name: string;
  quantity: number;
  loss_value: number;
  date_str: string;
  archived_from_analysis: boolean;
}

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
}

interface ReceiptRecord {
  id: string;
  date: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  items: ReceiptItem[];
  total_amount: number;
  payment_method: 'Cash' | 'Mobile Money' | 'Credit';
  status: 'PAID' | 'PENDING';
  type: 'Receipt' | 'Quotation' | 'Invoice';
  valid_until?: string;
  due_date?: string;
}

// ============================================================
// Helpers
// ============================================================
const localIsoDate = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmtKg = (n: number) => `${r3(n).toLocaleString('en-US', { maximumFractionDigits: 3 })} kg`;
const money = (n: number) => n.toFixed(2);

const mapMaterial = (r: any): Material => ({
  id: r.id,
  name: r.name,
  category: r.category || 'Other',
  quantityKg: Number(r.quantity_kg) || 0,
  ratePerKg: Number(r.rate_per_kg) || 0,
  minAlertKg: Number(r.min_alert_kg) || 0,
});

const mapEquipment = (r: any): EquipmentItem => ({
  id: r.id,
  name: r.name,
  category: r.category || 'Other',
  quantity: Number(r.quantity) || 0,
  condition: r.condition || 'Good',
  unitValue: Number(r.unit_value) || 0,
  dateAcquired: r.date_acquired || null,
  notes: r.notes || '',
});

const mapIntake = (r: any): MaterialIntake => ({
  id: r.id,
  material_id: r.material_id ?? null,
  material_name: r.material_name,
  category: r.category || 'Other',
  supplier_name: r.supplier_name,
  supplier_phone: r.supplier_phone || '',
  weight_kg: Number(r.weight_kg) || 0,
  rate_per_kg: Number(r.rate_per_kg) || 0,
  amount_paid: Number(r.amount_paid) || 0,
  payment_method: r.payment_method,
  date_str: r.date_str,
  archived_from_analysis: !!r.archived_from_analysis,
});

const summarizeByMaterial = (rows: MaterialIntake[]) => {
  const map: Record<string, { name: string; kg: number; paid: number }> = {};
  rows.forEach((r) => {
    if (!map[r.material_name]) map[r.material_name] = { name: r.material_name, kg: 0, paid: 0 };
    map[r.material_name].kg += r.weight_kg;
    map[r.material_name].paid += r.amount_paid;
  });
  return Object.values(map).sort((a, b) => b.kg - a.kg);
};

const summarizeBySupplier = (rows: MaterialIntake[]) => {
  const map: Record<string, { name: string; visits: number; kg: number; paid: number }> = {};
  rows.forEach((r) => {
    const key = r.supplier_name.trim().toLowerCase();
    if (!map[key]) map[key] = { name: r.supplier_name.trim(), visits: 0, kg: 0, paid: 0 };
    map[key].visits += 1;
    map[key].kg += r.weight_kg;
    map[key].paid += r.amount_paid;
  });
  return Object.values(map).sort((a, b) => b.kg - a.kg);
};

const conditionBadge = (c: string) =>
  c === 'Good'
    ? 'bg-emerald-100 text-emerald-700'
    : c === 'Fair'
    ? 'bg-amber-100 text-amber-700'
    : c === 'Needs Repair'
    ? 'bg-orange-100 text-orange-700'
    : 'bg-red-100 text-red-700';

// Whitelist-based calculator evaluator (no raw eval).
const safeCalculate = (expr: string): string => {
  if (!/^[0-9+\-*/.\s]+$/.test(expr)) return 'Error';
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr});`)();
    if (typeof result !== 'number' || !isFinite(result)) return 'Error';
    return result.toString();
  } catch {
    return 'Error';
  }
};

export default function DashboardPage() {
  const todayIso = localIsoDate();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('inventory');
  const [inventoryView, setInventoryView] = useState<'materials' | 'equipment'>('materials');

  const [profile, setProfile] = useState<BusinessProfile>({
    name: '', location: '', phone: '', email: '', website: '', logo_url: '',
  });
  const [logoUploading, setLogoUploading] = useState(false);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [intakes, setIntakes] = useState<MaterialIntake[]>([]);
  const [dailyExpenses, setDailyExpenses] = useState<DailyExpense[]>([]);
  const [damagedGoods, setDamagedGoods] = useState<DamagedGood[]>([]);
  const [receiptHistory, setReceiptHistory] = useState<ReceiptRecord[]>([]);

  const [materialSearch, setMaterialSearch] = useState('');
  const [equipmentSearch, setEquipmentSearch] = useState('');

  // Delete window (materials / equipment)
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'material' | 'equipment'; id: number } | null>(null);
  const [deleteMode, setDeleteMode] = useState<'partial' | 'whole'>('partial');
  const [deleteAmount, setDeleteAmount] = useState('');

  // Add material form
  const [newMatName, setNewMatName] = useState('');
  const [newMatCategory, setNewMatCategory] = useState('Plastic');
  const [newMatKg, setNewMatKg] = useState('');
  const [newMatRate, setNewMatRate] = useState('');
  const [newMatAlert, setNewMatAlert] = useState('');

  // Add equipment form
  const [newEqName, setNewEqName] = useState('');
  const [newEqCategory, setNewEqCategory] = useState('Machinery');
  const [newEqQty, setNewEqQty] = useState('1');
  const [newEqCondition, setNewEqCondition] = useState('Good');
  const [newEqValue, setNewEqValue] = useState('');
  const [newEqDate, setNewEqDate] = useState('');
  const [newEqNotes, setNewEqNotes] = useState('');

  // Daily intake form
  const [intakeDate, setIntakeDate] = useState(todayIso);
  const [intakeSupplier, setIntakeSupplier] = useState('');
  const [intakePhone, setIntakePhone] = useState('');
  const [intakeMaterialQuery, setIntakeMaterialQuery] = useState('');
  const [intakeNewCategory, setIntakeNewCategory] = useState('Plastic');
  const [intakeWeight, setIntakeWeight] = useState('');
  const [intakeRate, setIntakeRate] = useState('');
  const [intakeAmount, setIntakeAmount] = useState('');
  const [intakePayment, setIntakePayment] = useState<'Cash' | 'Mobile Money'>('Cash');

  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [calcDisplay, setCalcDisplay] = useState('0');

  // Business documents
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [receiptPaymentMethod, setReceiptPaymentMethod] = useState<'Cash' | 'Mobile Money' | 'Credit'>('Cash');
  const [receiptType, setReceiptType] = useState<'Receipt' | 'Quotation' | 'Invoice'>('Receipt');
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([{ name: '', quantity: 1, price: 0 }]);
  const [quotationValidUntil, setQuotationValidUntil] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<'PAID' | 'PENDING'>('PENDING');

  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  // ============================================================
  // Session check + initial data load
  // ============================================================
  useEffect(() => {
    async function checkUserAndFetch() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          setAuthError(error.message);
          window.location.replace('/login');
          return;
        }
        if (!session) {
          window.location.replace('/login');
          return;
        }
        setUserId(session.user.id);
        setIsAuthenticated(true);
        await fetchAllLiveData(session.user.id);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Unknown error verifying session.');
        window.location.replace('/login');
      }
    }
    checkUserAndFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAllLiveData = async (accountId: string) => {
    try {
      const { data: matData, error: matErr } = await supabase.from('materials').select('*').eq('account_id', accountId);
      if (matErr) console.error('Error fetching materials:', matErr);
      if (matData) setMaterials(matData.map(mapMaterial));

      const { data: eqData, error: eqErr } = await supabase.from('equipment').select('*').eq('account_id', accountId);
      if (eqErr) console.error('Error fetching equipment:', eqErr);
      if (eqData) setEquipment(eqData.map(mapEquipment));

      const { data: intakeData, error: intakeErr } = await supabase.from('material_intakes').select('*').eq('account_id', accountId);
      if (intakeErr) console.error('Error fetching collections:', intakeErr);
      if (intakeData) setIntakes(intakeData.map(mapIntake));

      const { data: expData, error: expErr } = await supabase.from('daily_expenses').select('*').eq('account_id', accountId);
      if (expErr) console.error('Error fetching daily expenses:', expErr);
      if (expData) setDailyExpenses(expData.map((e: any) => ({ ...e, amount: Number(e.amount) || 0 })));

      const { data: damData, error: damErr } = await supabase.from('damaged_goods').select('*').eq('account_id', accountId);
      if (damErr) console.error('Error fetching wastage:', damErr);
      if (damData) setDamagedGoods(damData.map((d: any) => ({ ...d, quantity: Number(d.quantity) || 0, loss_value: Number(d.loss_value) || 0 })));

      const { data: recData, error: recErr } = await supabase.from('receipts').select('*').eq('account_id', accountId);
      if (recErr) console.error('Error fetching receipts:', recErr);
      if (recData) setReceiptHistory(recData);

      const { data: profData, error: profErr } = await supabase
        .from('business_profile')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();
      if (profErr) console.error('Error fetching business profile:', profErr);
      if (profData) setProfile(profData);
    } catch (err) {
      console.error('Error fetching live Supabase data:', err);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('/login');
  };

  // ============================================================
  // PDF generator
  // ============================================================
  const generatePDF = async (title: string, head: string[][], body: (string | number)[][], filename: string, footerLines: string[] = []) => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTableMod = await import('jspdf-autotable');
      const autoTable = (autoTableMod as any).default || autoTableMod;
      const doc = new jsPDF();

      let headerX = 14;
      if (profile.logo_url) {
        try {
          const blob = await fetch(profile.logo_url).then((r) => r.blob());
          const dataUrl: string = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          doc.addImage(dataUrl, 'PNG', 14, 10, 20, 20);
          headerX = 40;
        } catch {
          // logo fetch failed, continue without it
        }
      }

      doc.setFontSize(14);
      doc.text(profile.name || 'Business', headerX, 18);
      doc.setFontSize(9);
      doc.text(profile.location || '', headerX, 24);
      doc.text(`${profile.phone || ''}${profile.email ? '  |  ' + profile.email : ''}`, headerX, 29);

      doc.setFontSize(12);
      doc.text(title, 14, 40);

      autoTable(doc, { startY: 45, head, body, styles: { fontSize: 8 } });

      if (footerLines.length) {
        let y = (doc as any).lastAutoTable.finalY + 8;
        doc.setFontSize(9);
        footerLines.forEach((line) => {
          if (y > 280) {
            doc.addPage();
            y = 20;
          }
          doc.text(line, 14, y);
          y += 6;
        });
      }
      doc.save(filename);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Could not generate PDF: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  // ============================================================
  // Materials (inventory in KG)
  // ============================================================
  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    const name = newMatName.trim();
    const kgVal = parseFloat(newMatKg);
    if (!name || isNaN(kgVal) || kgVal < 0) return;
    if (materials.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      alert('A material with this name already exists. Use "+ Add KG" on that row instead.');
      return;
    }
    const { data, error } = await supabase.from('materials').insert([{
      name,
      category: newMatCategory,
      quantity_kg: kgVal,
      rate_per_kg: newMatRate ? parseFloat(newMatRate) : 0,
      min_alert_kg: newMatAlert ? parseFloat(newMatAlert) : 10,
      is_active: true,
      account_id: userId,
    }]).select();
    if (error) { alert('Error adding material: ' + error.message); return; }
    if (data) setMaterials([...materials, mapMaterial(data[0])]);
    setNewMatName(''); setNewMatKg(''); setNewMatRate(''); setNewMatAlert('');
  };

  const handleAddStock = async (id: number) => {
    if (!userId) return;
    const input = prompt('Enter KGs to add to stock:');
    const value = parseFloat(input || '');
    if (!input || isNaN(value) || value <= 0) return;
    const target = materials.find((m) => m.id === id);
    if (!target) return;
    const newQty = r3(target.quantityKg + value);
    const { error } = await supabase.from('materials').update({ quantity_kg: newQty }).eq('id', id).eq('account_id', userId);
    if (error) { alert('Error updating stock: ' + error.message); return; }
    setMaterials(materials.map((m) => (m.id === id ? { ...m, quantityKg: newQty } : m)));
  };

  const handleLogWastage = async (id: number) => {
    if (!userId) return;
    const input = prompt('Enter KGs of rejected / spoiled material to remove (this is recorded as a loss in Analytics):');
    const lostKg = parseFloat(input || '');
    if (!input || isNaN(lostKg) || lostKg <= 0) return;
    const target = materials.find((m) => m.id === id);
    if (!target) return;
    if (lostKg > target.quantityKg) { alert('Wastage exceeds the current stock of this material!'); return; }
    const newQty = r3(target.quantityKg - lostKg);
    const lossVal = lostKg * target.ratePerKg;
    const { error: stockErr } = await supabase.from('materials').update({ quantity_kg: newQty }).eq('id', id).eq('account_id', userId);
    if (stockErr) { alert('Error updating stock: ' + stockErr.message); return; }
    const { data, error } = await supabase.from('damaged_goods').insert([{
      name: target.name, quantity: lostKg, loss_value: lossVal, date_str: todayIso, account_id: userId,
    }]).select();
    if (error) { alert('Error logging wastage: ' + error.message); return; }
    if (data) setDamagedGoods([...damagedGoods, { ...data[0], quantity: Number(data[0].quantity), loss_value: Number(data[0].loss_value) }]);
    setMaterials(materials.map((m) => (m.id === id ? { ...m, quantityKg: newQty } : m)));
  };

  const filteredMaterials = materials
    .filter((m) => m.name.toLowerCase().includes(materialSearch.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalMaterialKg = filteredMaterials.reduce((acc, m) => acc + m.quantityKg, 0);
  const totalMaterialValue = filteredMaterials.reduce((acc, m) => acc + m.quantityKg * m.ratePerKg, 0);

  const handleExportMaterialsPDF = () => {
    const body = filteredMaterials.map((m, i) => [
      i + 1, m.name, m.category, m.quantityKg.toFixed(2), money(m.ratePerKg), money(m.quantityKg * m.ratePerKg),
    ]);
    generatePDF('Recycling Materials Inventory', [['#', 'Material', 'Category', 'Stock (KG)', 'Rate / KG', 'Est. Value']], body,
      `materials-inventory-${todayIso}.pdf`,
      [`Total Stock: ${fmtKg(totalMaterialKg)}`, `Estimated Value: ${money(totalMaterialValue)} ZMW`]);
  };

  // ============================================================
  // Equipment
  // ============================================================
  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    const name = newEqName.trim();
    const qty = parseInt(newEqQty);
    if (!name || isNaN(qty) || qty <= 0) return;
    const { data, error } = await supabase.from('equipment').insert([{
      name,
      category: newEqCategory,
      quantity: qty,
      condition: newEqCondition,
      unit_value: newEqValue ? parseFloat(newEqValue) : 0,
      date_acquired: newEqDate || null,
      notes: newEqNotes.trim(),
      account_id: userId,
    }]).select();
    if (error) { alert('Error adding equipment: ' + error.message); return; }
    if (data) setEquipment([...equipment, mapEquipment(data[0])]);
    setNewEqName(''); setNewEqQty('1'); setNewEqValue(''); setNewEqDate(''); setNewEqNotes('');
    setNewEqCondition('Good');
  };

  const handleEquipmentCondition = async (id: number, condition: string) => {
    if (!userId) return;
    const { error } = await supabase.from('equipment').update({ condition }).eq('id', id).eq('account_id', userId);
    if (error) { alert('Error updating condition: ' + error.message); return; }
    setEquipment(equipment.map((q) => (q.id === id ? { ...q, condition } : q)));
  };

  const handleEquipmentQty = async (id: number) => {
    if (!userId) return;
    const input = prompt('Enter the new total quantity for this equipment:');
    const value = parseInt(input || '');
    if (!input || isNaN(value) || value < 0) return;
    const { error } = await supabase.from('equipment').update({ quantity: value }).eq('id', id).eq('account_id', userId);
    if (error) { alert('Error updating quantity: ' + error.message); return; }
    setEquipment(equipment.map((q) => (q.id === id ? { ...q, quantity: value } : q)));
  };

  const filteredEquipment = equipment
    .filter((q) => q.name.toLowerCase().includes(equipmentSearch.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalEquipmentUnits = filteredEquipment.reduce((acc, q) => acc + q.quantity, 0);
  const totalEquipmentValue = filteredEquipment.reduce((acc, q) => acc + q.quantity * q.unitValue, 0);
  const equipmentNeedingAttention = equipment.filter((q) => q.condition === 'Needs Repair' || q.condition === 'Out of Service');

  const handleExportEquipmentPDF = () => {
    const body = filteredEquipment.map((q, i) => [
      i + 1, q.name, q.category, q.quantity, q.condition, money(q.unitValue), money(q.quantity * q.unitValue), q.dateAcquired || '-',
    ]);
    generatePDF('Equipment List', [['#', 'Equipment', 'Category', 'Qty', 'Condition', 'Unit Value', 'Total Value', 'Acquired']], body,
      `equipment-list-${todayIso}.pdf`,
      [
        `Total Units: ${totalEquipmentUnits}`,
        `Total Value: ${money(totalEquipmentValue)} ZMW`,
        `Needing repair / out of service: ${equipmentNeedingAttention.length} item(s)`,
      ]);
  };

  // ============================================================
  // Delete (materials by KG or whole item, equipment by units or whole record)
  // ============================================================
  const openDelete = (kind: 'material' | 'equipment', id: number) => {
    setDeleteTarget({ kind, id });
    setDeleteMode('partial');
    setDeleteAmount('');
  };

  const closeDelete = () => {
    setDeleteTarget(null);
    setDeleteAmount('');
  };

  const deleteMaterialTarget = deleteTarget?.kind === 'material' ? materials.find((m) => m.id === deleteTarget.id) : undefined;
  const deleteEquipmentTarget = deleteTarget?.kind === 'equipment' ? equipment.find((q) => q.id === deleteTarget.id) : undefined;

  const handleConfirmDelete = async () => {
    if (!userId || !deleteTarget) return;

    if (deleteTarget.kind === 'material') {
      const m = materials.find((x) => x.id === deleteTarget.id);
      if (!m) { closeDelete(); return; }

      if (deleteMode === 'whole') {
        const { error } = await supabase.from('materials').delete().eq('id', m.id).eq('account_id', userId);
        if (error) { alert('Error deleting material: ' + error.message); return; }
        setMaterials(materials.filter((x) => x.id !== m.id));
      } else {
        const amt = parseFloat(deleteAmount);
        if (isNaN(amt) || amt <= 0) { alert('Enter the number of KGs to delete.'); return; }
        if (amt > m.quantityKg) { alert(`You only have ${fmtKg(m.quantityKg)} of ${m.name} in stock.`); return; }
        const newQty = r3(m.quantityKg - amt);
        const { error } = await supabase.from('materials').update({ quantity_kg: newQty }).eq('id', m.id).eq('account_id', userId);
        if (error) { alert('Error updating stock: ' + error.message); return; }
        setMaterials(materials.map((x) => (x.id === m.id ? { ...x, quantityKg: newQty } : x)));
      }
    } else {
      const q = equipment.find((x) => x.id === deleteTarget.id);
      if (!q) { closeDelete(); return; }

      let removeWhole = deleteMode === 'whole';
      let amt = 0;
      if (!removeWhole) {
        amt = parseInt(deleteAmount);
        if (isNaN(amt) || amt <= 0) { alert('Enter the number of units to delete.'); return; }
        if (amt > q.quantity) { alert(`You only have ${q.quantity} unit(s) of ${q.name}.`); return; }
        if (amt === q.quantity) removeWhole = true;
      }

      if (removeWhole) {
        const { error } = await supabase.from('equipment').delete().eq('id', q.id).eq('account_id', userId);
        if (error) { alert('Error deleting equipment: ' + error.message); return; }
        setEquipment(equipment.filter((x) => x.id !== q.id));
      } else {
        const newQty = q.quantity - amt;
        const { error } = await supabase.from('equipment').update({ quantity: newQty }).eq('id', q.id).eq('account_id', userId);
        if (error) { alert('Error updating quantity: ' + error.message); return; }
        setEquipment(equipment.map((x) => (x.id === q.id ? { ...x, quantity: newQty } : x)));
      }
    }
    closeDelete();
  };

  // ============================================================
  // Daily record: material collections (adds KG to inventory)
  // ============================================================
  const intakeMatch = materials.find((m) => m.name.toLowerCase() === intakeMaterialQuery.trim().toLowerCase());

  const recalcAmount = (weight: string, rate: string) => {
    const w = parseFloat(weight);
    const r = parseFloat(rate);
    if (!isNaN(w) && !isNaN(r)) setIntakeAmount((w * r).toFixed(2));
  };

  const handleAddIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    const matName = intakeMaterialQuery.trim();
    const supplier = intakeSupplier.trim();
    const weight = parseFloat(intakeWeight);
    const paid = parseFloat(intakeAmount);
    if (!matName || !supplier || isNaN(weight) || weight <= 0 || isNaN(paid) || paid < 0) {
      alert('Please fill in the supplier name, material, weight (KG) and amount paid.');
      return;
    }
    if (intakeDate > todayIso) { alert('The date cannot be in the future.'); return; }

    let material = materials.find((m) => m.name.toLowerCase() === matName.toLowerCase());
    let createdMaterial = false;

    if (!material) {
      const { data, error } = await supabase.from('materials').insert([{
        name: matName, category: intakeNewCategory, quantity_kg: 0, rate_per_kg: 0,
        min_alert_kg: 10, is_active: true, account_id: userId,
      }]).select();
      if (error || !data) { alert('Error creating material: ' + (error?.message || 'Unknown error')); return; }
      material = mapMaterial(data[0]);
      createdMaterial = true;
    }

    const rate = intakeRate ? parseFloat(intakeRate) : paid / weight;
    const { data: intakeData, error: intakeErr } = await supabase.from('material_intakes').insert([{
      material_id: material.id,
      material_name: material.name,
      category: material.category,
      supplier_name: supplier,
      supplier_phone: intakePhone.trim(),
      weight_kg: weight,
      rate_per_kg: rate,
      amount_paid: paid,
      payment_method: intakePayment,
      date_str: intakeDate,
      account_id: userId,
    }]).select();
    if (intakeErr || !intakeData) {
      if (createdMaterial) await supabase.from('materials').delete().eq('id', material.id).eq('account_id', userId);
      alert('Error saving collection: ' + (intakeErr?.message || 'Unknown error'));
      return;
    }

    // Add the KGs to inventory
    const newQty = r3(material.quantityKg + weight);
    const { error: stockErr } = await supabase
      .from('materials')
      .update({ quantity_kg: newQty })
      .eq('id', material.id)
      .eq('account_id', userId);
    if (stockErr) {
      await supabase.from('material_intakes').delete().eq('id', intakeData[0].id).eq('account_id', userId);
      if (createdMaterial) await supabase.from('materials').delete().eq('id', material.id).eq('account_id', userId);
      alert('Could not update inventory stock, so the entry was cancelled: ' + stockErr.message);
      return;
    }

    const updated: Material = { ...material, quantityKg: newQty };
    setMaterials(createdMaterial ? [...materials, updated] : materials.map((m) => (m.id === updated.id ? updated : m)));
    setIntakes([...intakes, mapIntake(intakeData[0])]);

    setIntakeSupplier(''); setIntakePhone(''); setIntakeMaterialQuery('');
    setIntakeWeight(''); setIntakeRate(''); setIntakeAmount('');
    setIntakeDate(todayIso);
  };

  const handleDeleteIntake = async (rec: MaterialIntake) => {
    if (!userId) return;
    const target = materials.find((m) => m.id === rec.material_id);
    if (!confirm(`Delete this collection record?${target ? ` Stock of ${target.name} will be reduced by ${fmtKg(rec.weight_kg)}.` : ''}`)) return;
    const { error } = await supabase.from('material_intakes').delete().eq('id', rec.id).eq('account_id', userId);
    if (error) { alert('Error deleting entry: ' + error.message); return; }

    if (target) {
      const newQty = Math.max(0, r3(target.quantityKg - rec.weight_kg));
      await supabase.from('materials').update({ quantity_kg: newQty }).eq('id', target.id).eq('account_id', userId);
      setMaterials(materials.map((m) => (m.id === target.id ? { ...m, quantityKg: newQty } : m)));
    }
    setIntakes(intakes.filter((i) => i.id !== rec.id));
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc || !expenseAmount || !userId) return;
    const { data, error } = await supabase.from('daily_expenses').insert([{
      description: expenseDesc, amount: parseFloat(expenseAmount), date_str: todayIso, account_id: userId,
    }]).select();
    if (error) { alert('Error adding expense: ' + error.message); return; }
    if (data) setDailyExpenses([...dailyExpenses, { ...data[0], amount: Number(data[0].amount) }]);
    setExpenseDesc(''); setExpenseAmount('');
  };

  const handleDeleteExpense = async (id: number) => {
    if (!userId) return;
    if (!confirm('Delete this expense entry?')) return;
    const { error } = await supabase.from('daily_expenses').delete().eq('id', id).eq('account_id', userId);
    if (error) { alert('Error deleting expense: ' + error.message); return; }
    setDailyExpenses(dailyExpenses.filter((e) => e.id !== id));
  };

  const todayIntakes = intakes.filter((i) => i.date_str === todayIso);
  const todayExpenses = dailyExpenses.filter((e) => e.date_str === todayIso);

  const historyDates = Array.from(new Set([
    ...intakes.filter((i) => i.date_str !== todayIso).map((i) => i.date_str),
    ...dailyExpenses.filter((e) => e.date_str !== todayIso).map((e) => e.date_str),
  ])).sort((a, b) => (a < b ? 1 : -1));

  const dayTotals = (dateStr: string) => {
    const rows = intakes.filter((i) => i.date_str === dateStr);
    const expenses = dailyExpenses.filter((e) => e.date_str === dateStr);
    const wastage = damagedGoods.filter((d) => d.date_str === dateStr);
    const totalKg = rows.reduce((acc, i) => acc + i.weight_kg, 0);
    const totalPaid = rows.reduce((acc, i) => acc + i.amount_paid, 0);
    const expenseTotal = expenses.reduce((acc, e) => acc + e.amount, 0);
    const wastageKg = wastage.reduce((acc, d) => acc + d.quantity, 0);
    const wastageValue = wastage.reduce((acc, d) => acc + d.loss_value, 0);
    return {
      rows, expenses, wastage, totalKg, totalPaid, expenseTotal, wastageKg, wastageValue,
      totalSpending: totalPaid + expenseTotal,
      avgCost: totalKg > 0 ? totalPaid / totalKg : 0,
    };
  };

  const todayTotals = dayTotals(todayIso);

  const handleExportDayPDF = (dateStr: string) => {
    const t = dayTotals(dateStr);
    const body = t.rows.map((r, i) => [
      i + 1, r.supplier_name, r.supplier_phone || '-', r.material_name, r.weight_kg.toFixed(2),
      money(r.rate_per_kg), money(r.amount_paid), r.payment_method,
    ]);
    generatePDF(`Daily Collection Record - ${dateStr}`,
      [['#', 'Supplier', 'Phone', 'Material', 'KG', 'Rate / KG', 'Paid (ZMW)', 'Method']], body,
      `daily-record-${dateStr}.pdf`,
      [
        `Total Collected: ${fmtKg(t.totalKg)}`,
        `Total Paid to Suppliers: ${money(t.totalPaid)} ZMW`,
        `Average Cost per KG: ${money(t.avgCost)} ZMW`,
        `Expenses: ${money(t.expenseTotal)} ZMW`,
        `Total Spending (Paid + Expenses): ${money(t.totalSpending)} ZMW`,
        `Wastage: ${fmtKg(t.wastageKg)} (value ${money(t.wastageValue)} ZMW)`,
        '',
        'Collected by material:',
        ...summarizeByMaterial(t.rows).map((m) => `- ${m.name}: ${fmtKg(m.kg)} (paid ${money(m.paid)} ZMW)`),
        ...(t.expenses.length ? ['', 'Expenses:', ...t.expenses.map((e) => `- ${e.description}: ${money(e.amount)} ZMW`)] : []),
      ]);
  };

  // Deleting a whole past day clears history only. Inventory stock is NOT changed.
  const handleDeleteDayRecord = async (dateStr: string) => {
    if (!userId) return;
    if (!confirm(
      `Permanently delete ALL records for ${dateStr}?\n\nThis removes every collection, expense and wastage entry logged on this day. Inventory stock will NOT change. This cannot be undone and the PDF for this day will no longer be available.\n\nPress OK to confirm.`
    )) return;

    const { error: e1 } = await supabase.from('material_intakes').delete().eq('date_str', dateStr).eq('account_id', userId);
    const { error: e2 } = await supabase.from('daily_expenses').delete().eq('date_str', dateStr).eq('account_id', userId);
    const { error: e3 } = await supabase.from('damaged_goods').delete().eq('date_str', dateStr).eq('account_id', userId);

    if (e1 || e2 || e3) {
      alert('Error deleting day record: ' + (e1?.message || e2?.message || e3?.message));
      return;
    }

    setIntakes(intakes.filter((i) => i.date_str !== dateStr));
    setDailyExpenses(dailyExpenses.filter((e) => e.date_str !== dateStr));
    setDamagedGoods(damagedGoods.filter((d) => d.date_str !== dateStr));
  };

  // ============================================================
  // Business documents (receipts, invoices, quotations)
  // ============================================================
  const handleGenerateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || receiptItems.length === 0 || !userId) return;
    const totalAmount = receiptItems.reduce((acc, item) => acc + item.quantity * item.price, 0);
    const prefix = receiptType === 'Quotation' ? 'QUO' : receiptType === 'Invoice' ? 'INV' : 'REC';
    const recId = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newRec: ReceiptRecord = {
      id: recId,
      date: new Date().toLocaleDateString(),
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      items: receiptItems,
      total_amount: totalAmount,
      payment_method: receiptType === 'Quotation' ? 'Cash' : receiptPaymentMethod,
      status: receiptType === 'Receipt' ? 'PAID' : receiptType === 'Quotation' ? 'PENDING' : invoiceStatus,
      type: receiptType,
      valid_until: receiptType === 'Quotation' ? quotationValidUntil : undefined,
      due_date: receiptType === 'Invoice' ? invoiceDueDate : undefined,
    };

    const { error } = await supabase.from('receipts').insert([{ ...newRec, account_id: userId }]);
    if (error) { alert('Error saving record: ' + error.message); return; }
    setReceiptHistory([newRec, ...receiptHistory]);
    alert(`${receiptType} ${recId} successfully generated and stored!`);
    setCustomerName(''); setCustomerPhone(''); setCustomerEmail('');
    setReceiptItems([{ name: '', quantity: 1, price: 0 }]);
    setQuotationValidUntil(''); setInvoiceDueDate('');
  };

  const handleDeleteReceipt = async (id: string) => {
    if (!userId) return;
    if (!confirm('Delete this record permanently?')) return;
    const { error } = await supabase.from('receipts').delete().eq('id', id).eq('account_id', userId);
    if (error) { alert('Error deleting record: ' + error.message); return; }
    setReceiptHistory(receiptHistory.filter((r) => r.id !== id));
  };

  const handleExportReceiptPDF = (rec: ReceiptRecord) => {
    const body = rec.items.map((it, i) => [i + 1, it.name, it.quantity, it.price.toFixed(2), (it.quantity * it.price).toFixed(2)]);
    const footer = [`Customer: ${rec.customer_name}`, `Date: ${rec.date}`];

    if (rec.type === 'Receipt') {
      footer.push(`Payment Method: ${rec.payment_method}`, `Status: PAID`, `Total Paid: ${rec.total_amount.toFixed(2)} ZMW`);
    } else if (rec.type === 'Quotation') {
      footer.push(`Valid Until: ${rec.valid_until || 'N/A'}`, `Estimated Total: ${rec.total_amount.toFixed(2)} ZMW`, `This is an estimate - prices subject to confirmation.`);
    } else {
      footer.push(`Due Date: ${rec.due_date || 'N/A'}`, `Payment Status: ${rec.status}`, `Amount Due: ${rec.total_amount.toFixed(2)} ZMW`);
    }

    const title = rec.type === 'Invoice' ? `TAX INVOICE - ${rec.id}` : rec.type === 'Quotation' ? `QUOTATION - ${rec.id}` : `RECEIPT - ${rec.id}`;
    generatePDF(title, [['#', 'Item', 'Qty', 'Price', 'Line Total']], body, `${rec.id}.pdf`, footer);
  };

  // ============================================================
  // Analytics
  // ============================================================
  const inRange = (d: string) => {
    if (startDateFilter && d < startDateFilter) return false;
    if (endDateFilter && d > endDateFilter) return false;
    return true;
  };
  const filteredIntakes = intakes.filter((i) => !i.archived_from_analysis && inRange(i.date_str));
  const filteredExpenses = dailyExpenses.filter((e) => !e.archived_from_analysis && inRange(e.date_str));
  const filteredWastage = damagedGoods.filter((d) => !d.archived_from_analysis && inRange(d.date_str));

  const dashKg = filteredIntakes.reduce((acc, i) => acc + i.weight_kg, 0);
  const dashPaid = filteredIntakes.reduce((acc, i) => acc + i.amount_paid, 0);
  const dashExpenses = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);
  const dashSpending = dashPaid + dashExpenses;
  const dashAvgCost = dashKg > 0 ? dashPaid / dashKg : 0;
  const dashWastageKg = filteredWastage.reduce((acc, d) => acc + d.quantity, 0);
  const dashWastageValue = filteredWastage.reduce((acc, d) => acc + d.loss_value, 0);
  const byMaterial = summarizeByMaterial(filteredIntakes);
  const bySupplier = summarizeBySupplier(filteredIntakes);
  const pendingCreditReceipts = receiptHistory.filter((r) => r.status === 'PENDING' && r.type !== 'Quotation');

  const handleGenerateStatement = () => {
    if (!startDateFilter || !endDateFilter) { alert('Please select both a start and end date.'); return; }
    const sorted = [...filteredIntakes].sort((a, b) => a.date_str.localeCompare(b.date_str));
    const body = sorted.map((r, i) => [
      i + 1, r.date_str, r.supplier_name, r.material_name, r.weight_kg.toFixed(2), money(r.rate_per_kg), money(r.amount_paid),
    ]);
    generatePDF(`Collection Statement (${startDateFilter} to ${endDateFilter})`,
      [['#', 'Date', 'Supplier', 'Material', 'KG', 'Rate / KG', 'Paid (ZMW)']], body,
      `statement-${startDateFilter}-to-${endDateFilter}.pdf`,
      [
        `Total Collected: ${fmtKg(dashKg)}`,
        `Total Paid to Suppliers: ${money(dashPaid)} ZMW`,
        `Average Cost per KG: ${money(dashAvgCost)} ZMW`,
        `Expenses: ${money(dashExpenses)} ZMW`,
        `Total Spending: ${money(dashSpending)} ZMW`,
        `Wastage: ${fmtKg(dashWastageKg)} (value ${money(dashWastageValue)} ZMW)`,
        '',
        'Collected by material:',
        ...byMaterial.map((m) => `- ${m.name}: ${fmtKg(m.kg)} (paid ${money(m.paid)} ZMW)`),
      ]);
  };

  const handleResetAnalysis = async () => {
    if (!userId) return;
    const confirmText = prompt(
      'This clears the Analytics totals so you can start fresh. ' +
      'Your Daily Record history (and its PDFs) and your inventory stock are NOT affected. ' +
      'Type RESET to confirm:'
    );
    if (confirmText !== 'RESET') return;

    const { error: e1 } = await supabase.from('material_intakes').update({ archived_from_analysis: true }).eq('account_id', userId);
    const { error: e2 } = await supabase.from('daily_expenses').update({ archived_from_analysis: true }).eq('account_id', userId);
    const { error: e3 } = await supabase.from('damaged_goods').update({ archived_from_analysis: true }).eq('account_id', userId);
    if (e1 || e2 || e3) {
      alert('Error during reset: ' + (e1?.message || e2?.message || e3?.message));
      return;
    }
    setIntakes(intakes.map((i) => ({ ...i, archived_from_analysis: true })));
    setDailyExpenses(dailyExpenses.map((e) => ({ ...e, archived_from_analysis: true })));
    setDamagedGoods(damagedGoods.map((d) => ({ ...d, archived_from_analysis: true })));
    alert('Analytics have been reset. Daily Record history and inventory are untouched.');
  };

  const handleDeleteWastage = async (id: number) => {
    if (!userId) return;
    if (!confirm('Delete this wastage entry?')) return;
    const { error } = await supabase.from('damaged_goods').delete().eq('id', id).eq('account_id', userId);
    if (error) { alert('Error deleting entry: ' + error.message); return; }
    setDamagedGoods(damagedGoods.filter((d) => d.id !== id));
  };

  // ============================================================
  // Profile / Logo
  // ============================================================
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { alert('Your session expired. Please log in again.'); return; }

    const { error } = await supabase
      .from('business_profile')
      .upsert([{ ...profile, account_id: session.user.id }], { onConflict: 'account_id' });

    if (error) { alert('Error updating profile: ' + error.message); } else { alert('Profile details updated successfully!'); }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setLogoUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `logos/${userId}/logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('xaptor-storage').upload(path, file, { upsert: true });
      if (uploadError) { alert('Error uploading logo: ' + uploadError.message); return; }
      const { data } = supabase.storage.from('xaptor-storage').getPublicUrl(path);
      setProfile({ ...profile, logo_url: data.publicUrl });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleCalcBtn = (val: string) => {
    if (val === 'C') { setCalcDisplay('0'); }
    else if (val === '=') { setCalcDisplay(safeCalculate(calcDisplay)); }
    else { setCalcDisplay(calcDisplay === '0' ? val : calcDisplay + val); }
  };

  // ============================================================
  // Styles
  // ============================================================
  const themeBg = 'bg-slate-50 text-slate-900';
  const cardBg = 'bg-white border-slate-200 text-slate-900';
  const headerBg = 'bg-white/95 border-slate-200';
  const primaryBtn = 'bg-slate-950 hover:bg-slate-800 text-white';
  const inputStyle = 'w-full bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 rounded-lg p-2.5 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10';
  const labelCls = 'block text-[11px] font-bold mb-1 text-slate-600';
  const dangerBtn = 'text-[10px] bg-red-100 text-red-700 hover:bg-red-600 hover:text-white px-2 py-1 rounded transition';

  const statCard = (label: string, value: string, sub: string, color = 'text-slate-900') => (
    <div key={label} className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
      <p className="text-xs text-slate-500 uppercase">{label}</p>
      <p className={`text-xl md:text-2xl font-bold mt-1 ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
    </div>
  );

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-3 p-4 text-center">
        <p>Verifying session...</p>
        {authError && <p className="text-xs text-red-400 max-w-md">Error: {authError}</p>}
      </div>
    );
  }

  return (
    <main className={`min-h-screen ${themeBg}`}>
      <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${headerBg}`}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-slate-950 text-white flex items-center justify-center font-black tracking-tight shadow-sm">
              K
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Kas Technologies</p>
              <h1 className="text-sm sm:text-base font-bold truncate">{profile.name || 'Recycling Manager'}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Account</p>
              <p className="text-xs font-semibold text-slate-700">{profile.email || 'Business account'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-5 lg:py-7 flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-64 shrink-0">
          <div className="lg:sticky lg:top-24 bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
            <div className="px-3 pt-3 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
              <p className="text-sm font-semibold mt-1 text-slate-800">Recycling management</p>
            </div>
            <nav className="space-y-1">
              {[
                ['inventory', 'Inventory', 'Materials (KG) and equipment'],
                ['daily', 'Daily Record', 'Collections and expenses'],
                ['receipts', 'Business Documents', 'Receipts, invoices and quotes'],
                ['dashboard', 'Analytics', 'Collections, suppliers and costs'],
                ['settings', 'Profile Settings', 'Business details and logo'],
              ].map(([id, label, description]) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full text-left px-3 py-3 rounded-xl transition flex items-center gap-3 ${
                    activeTab === id
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <span className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${activeTab === id ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {id === 'inventory' ? '01' : id === 'daily' ? '02' : id === 'receipts' ? '03' : id === 'dashboard' ? '04' : '05'}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold">{label}</span>
                    <span className={`block text-[10px] mt-0.5 truncate ${activeTab === id ? 'text-slate-300' : 'text-slate-400'}`}>{description}</span>
                  </span>
                </button>
              ))}
            </nav>

            <div className="mt-4 pt-4 border-t border-slate-200 px-2 pb-2">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">System</p>
                <p className="text-xs font-semibold text-slate-700 mt-1">Secure business workspace</p>
                <p className="text-[10px] text-slate-400 mt-1">Your records stay organized in one place.</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex-1 min-w-0">

        {/* ===================== INVENTORY ===================== */}
        {activeTab === 'inventory' && (
          <div className={`p-6 md:p-8 rounded-2xl shadow-sm space-y-6 border ${cardBg}`}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight">RECYCLING INVENTORY</h2>
                <p className="text-xs text-slate-500">Date: {new Date().toLocaleDateString()}</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p className="font-bold">{profile.name}</p>
                <p>{profile.location}</p>
              </div>
            </div>

            <div className="flex gap-2 text-xs">
              <button onClick={() => setInventoryView('materials')} className={`px-4 py-2 rounded-lg font-bold transition ${inventoryView === 'materials' ? primaryBtn : 'bg-slate-100 hover:bg-slate-200'}`}>♻️ Recycling Materials</button>
              <button onClick={() => setInventoryView('equipment')} className={`px-4 py-2 rounded-lg font-bold transition ${inventoryView === 'equipment' ? primaryBtn : 'bg-slate-100 hover:bg-slate-200'}`}>🛠️ Equipment</button>
            </div>

            {inventoryView === 'materials' && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {statCard('Total Stock', fmtKg(totalMaterialKg), `${filteredMaterials.length} material type(s)`, 'text-emerald-600')}
                  {statCard('Estimated Value', `${money(totalMaterialValue)} ZMW`, 'Stock x rate per KG')}
                  {statCard('Low Stock', `${filteredMaterials.filter((m) => m.quantityKg <= m.minAlertKg).length}`, 'Materials at or below alert level', 'text-red-600')}
                </div>

                <form onSubmit={handleAddMaterial} className="bg-slate-50 p-4 rounded-xl grid grid-cols-1 md:grid-cols-6 gap-3 items-end border border-slate-200">
                  <div className="md:col-span-2">
                    <label className={labelCls}>Material Name</label>
                    <input type="text" required placeholder="e.g. PET Bottles" className={inputStyle} value={newMatName} onChange={(e) => setNewMatName(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Category</label>
                    <select className={inputStyle} value={newMatCategory} onChange={(e) => setNewMatCategory(e.target.value)}>
                      {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Opening Stock (KG)</label>
                    <input type="number" step="0.01" min="0" required placeholder="0" className={inputStyle} value={newMatKg} onChange={(e) => setNewMatKg(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Rate / KG (ZMW)</label>
                    <input type="number" step="0.01" min="0" placeholder="0.00" className={inputStyle} value={newMatRate} onChange={(e) => setNewMatRate(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Low Alert (KG)</label>
                    <input type="number" step="0.01" min="0" placeholder="10" className={inputStyle} value={newMatAlert} onChange={(e) => setNewMatAlert(e.target.value)} />
                  </div>
                  <button type="submit" className={`font-medium text-xs py-3 px-4 rounded-lg transition md:col-span-6 ${primaryBtn}`}>+ Add Material</button>
                </form>

                <div className="flex flex-col md:flex-row gap-3">
                  <input type="text" placeholder="🔍 Search materials..." className={inputStyle} value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)} />
                  <button onClick={handleExportMaterialsPDF} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold transition shadow whitespace-nowrap">📄 Export Inventory PDF</button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-xs uppercase text-slate-600">
                        <th className="p-3 text-center w-12">#</th>
                        <th className="p-3">Material</th>
                        <th className="p-3">Category</th>
                        <th className="p-3 text-right">Stock (KG)</th>
                        <th className="p-3 text-right">Rate / KG</th>
                        <th className="p-3 text-right">Est. Value (ZMW)</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-slate-200">
                      {filteredMaterials.length === 0 && (
                        <tr><td colSpan={7} className="p-4 text-center text-slate-400 italic">No materials yet. Add one above or record a collection in the Daily Record.</td></tr>
                      )}
                      {filteredMaterials.map((m, index) => {
                        const isLow = m.quantityKg <= m.minAlertKg;
                        return (
                          <tr key={m.id} className={isLow ? 'bg-red-50' : 'hover:bg-slate-50'}>
                            <td className="p-3 text-center font-bold">{index + 1}</td>
                            <td className="p-3 font-medium">
                              {m.name}
                              {isLow && <span className="ml-2 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded">Low Stock</span>}
                            </td>
                            <td className="p-3 text-slate-500">{m.category}</td>
                            <td className="p-3 text-right font-bold">{m.quantityKg.toFixed(2)}</td>
                            <td className="p-3 text-right">{money(m.ratePerKg)}</td>
                            <td className="p-3 text-right font-semibold">{money(m.quantityKg * m.ratePerKg)}</td>
                            <td className="p-3 text-center space-x-1 whitespace-nowrap">
                              <button onClick={() => handleAddStock(m.id)} className="text-[10px] bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white px-2 py-1 rounded transition">+ Add KG</button>
                              <button onClick={() => handleLogWastage(m.id)} className="text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-600 hover:text-white px-2 py-1 rounded transition">Wastage</button>
                              <button onClick={() => openDelete('material', m.id)} className={dangerBtn}>Delete</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold text-xs">
                        <td colSpan={3} className="p-3 text-right uppercase">Total Stock:</td>
                        <td className="p-3 text-right">{totalMaterialKg.toFixed(2)} KG</td>
                        <td className="p-3 text-right">-</td>
                        <td className="p-3 text-right">{money(totalMaterialValue)} ZMW</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}

            {inventoryView === 'equipment' && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {statCard('Total Units', `${totalEquipmentUnits}`, `${filteredEquipment.length} equipment record(s)`, 'text-emerald-600')}
                  {statCard('Total Value', `${money(totalEquipmentValue)} ZMW`, 'Units x unit value')}
                  {statCard('Needs Attention', `${equipmentNeedingAttention.length}`, 'Needs repair or out of service', 'text-red-600')}
                </div>

                <form onSubmit={handleAddEquipment} className="bg-slate-50 p-4 rounded-xl grid grid-cols-1 md:grid-cols-6 gap-3 items-end border border-slate-200">
                  <div className="md:col-span-2">
                    <label className={labelCls}>Equipment Name</label>
                    <input type="text" required placeholder="e.g. Plastic Shredder" className={inputStyle} value={newEqName} onChange={(e) => setNewEqName(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Category</label>
                    <select className={inputStyle} value={newEqCategory} onChange={(e) => setNewEqCategory(e.target.value)}>
                      {EQUIPMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Quantity</label>
                    <input type="number" min="1" required className={inputStyle} value={newEqQty} onChange={(e) => setNewEqQty(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Condition</label>
                    <select className={inputStyle} value={newEqCondition} onChange={(e) => setNewEqCondition(e.target.value)}>
                      {EQUIPMENT_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Unit Value (ZMW)</label>
                    <input type="number" step="0.01" min="0" placeholder="0.00" className={inputStyle} value={newEqValue} onChange={(e) => setNewEqValue(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Date Acquired</label>
                    <input type="date" className={inputStyle} value={newEqDate} onChange={(e) => setNewEqDate(e.target.value)} />
                  </div>
                  <div className="md:col-span-4">
                    <label className={labelCls}>Notes (optional)</label>
                    <input type="text" placeholder="Serial number, location, supplier..." className={inputStyle} value={newEqNotes} onChange={(e) => setNewEqNotes(e.target.value)} />
                  </div>
                  <button type="submit" className={`font-medium text-xs py-3 px-4 rounded-lg transition md:col-span-2 ${primaryBtn}`}>+ Add Equipment</button>
                </form>

                <div className="flex flex-col md:flex-row gap-3">
                  <input type="text" placeholder="🔍 Search equipment..." className={inputStyle} value={equipmentSearch} onChange={(e) => setEquipmentSearch(e.target.value)} />
                  <button onClick={handleExportEquipmentPDF} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold transition shadow whitespace-nowrap">📄 Export Equipment PDF</button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-xs uppercase text-slate-600">
                        <th className="p-3 text-center w-12">#</th>
                        <th className="p-3">Equipment</th>
                        <th className="p-3">Category</th>
                        <th className="p-3 text-center">Qty</th>
                        <th className="p-3">Condition</th>
                        <th className="p-3 text-right">Unit Value</th>
                        <th className="p-3 text-right">Total Value</th>
                        <th className="p-3">Acquired</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-slate-200">
                      {filteredEquipment.length === 0 && (
                        <tr><td colSpan={9} className="p-4 text-center text-slate-400 italic">No equipment recorded yet.</td></tr>
                      )}
                      {filteredEquipment.map((q, index) => (
                        <tr key={q.id} className="hover:bg-slate-50">
                          <td className="p-3 text-center font-bold">{index + 1}</td>
                          <td className="p-3 font-medium">
                            {q.name}
                            {q.notes && <span className="block text-[10px] text-slate-400 font-normal">{q.notes}</span>}
                          </td>
                          <td className="p-3 text-slate-500">{q.category}</td>
                          <td className="p-3 text-center font-bold">{q.quantity}</td>
                          <td className="p-3">
                            <select
                              className={`text-[11px] font-bold rounded px-2 py-1 border-0 outline-none cursor-pointer ${conditionBadge(q.condition)}`}
                              value={q.condition}
                              onChange={(e) => handleEquipmentCondition(q.id, e.target.value)}
                            >
                              {EQUIPMENT_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className="p-3 text-right">{money(q.unitValue)}</td>
                          <td className="p-3 text-right font-semibold">{money(q.quantity * q.unitValue)}</td>
                          <td className="p-3 text-slate-500">{q.dateAcquired || '-'}</td>
                          <td className="p-3 text-center space-x-1 whitespace-nowrap">
                            <button onClick={() => handleEquipmentQty(q.id)} className="text-[10px] bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white px-2 py-1 rounded transition">Edit Qty</button>
                            <button onClick={() => openDelete('equipment', q.id)} className={dangerBtn}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold text-xs">
                        <td colSpan={3} className="p-3 text-right uppercase">Totals:</td>
                        <td className="p-3 text-center">{totalEquipmentUnits}</td>
                        <td></td>
                        <td className="p-3 text-right">-</td>
                        <td className="p-3 text-right">{money(totalEquipmentValue)} ZMW</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ===================== DAILY RECORD ===================== */}
        {activeTab === 'daily' && (
          <div className={`p-6 md:p-8 rounded-2xl shadow-sm space-y-6 border ${cardBg}`}>
            <div className="border-b pb-4">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight">DAILY RECORD — {todayIso}</h2>
              <p className="text-xs text-slate-500">Record materials brought in by individuals. Every KG recorded is added to your inventory automatically.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {statCard('Collected Today', fmtKg(todayTotals.totalKg), `${todayTotals.rows.length} collection(s)`, 'text-emerald-600')}
              {statCard('Paid to Suppliers', `${money(todayTotals.totalPaid)} ZMW`, `Avg ${money(todayTotals.avgCost)} ZMW per KG`)}
              {statCard('Expenses', `${money(todayTotals.expenseTotal)} ZMW`, 'Transport, logistics, etc.', 'text-red-600')}
              {statCard('Total Spending', `${money(todayTotals.totalSpending)} ZMW`, 'Paid + expenses', 'text-blue-600')}
            </div>

            <form onSubmit={handleAddIntake} className="bg-slate-50 p-4 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-3 items-end border border-slate-200">
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" required max={todayIso} className={inputStyle} value={intakeDate} onChange={(e) => setIntakeDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Supplier Name *</label>
                <input type="text" required placeholder="Person who brought the material" className={inputStyle} value={intakeSupplier} onChange={(e) => setIntakeSupplier(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Supplier Phone</label>
                <input type="tel" placeholder="e.g. 097XXXXXXX" className={inputStyle} value={intakePhone} onChange={(e) => setIntakePhone(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Material *</label>
                <input
                  type="text"
                  list="materials-list"
                  autoComplete="off"
                  required
                  placeholder="Type or pick a material..."
                  className={inputStyle}
                  value={intakeMaterialQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setIntakeMaterialQuery(val);
                    const matched = materials.find((m) => m.name.toLowerCase() === val.trim().toLowerCase());
                    if (matched && matched.ratePerKg > 0) {
                      setIntakeRate(String(matched.ratePerKg));
                      recalcAmount(intakeWeight, String(matched.ratePerKg));
                    }
                  }}
                />
                <datalist id="materials-list">
                  {materials.map((m) => <option key={m.id} value={m.name} />)}
                </datalist>
              </div>

              {intakeMaterialQuery.trim() && !intakeMatch && (
                <div>
                  <label className={labelCls}>Category (new material)</label>
                  <select className={inputStyle} value={intakeNewCategory} onChange={(e) => setIntakeNewCategory(e.target.value)}>
                    {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Weight Brought (KG) *</label>
                <input
                  type="number" step="0.01" min="0" required placeholder="0.00" className={inputStyle}
                  value={intakeWeight}
                  onChange={(e) => { setIntakeWeight(e.target.value); recalcAmount(e.target.value, intakeRate); }}
                />
              </div>
              <div>
                <label className={labelCls}>Rate / KG (optional)</label>
                <input
                  type="number" step="0.01" min="0" placeholder="0.00" className={inputStyle}
                  value={intakeRate}
                  onChange={(e) => { setIntakeRate(e.target.value); recalcAmount(intakeWeight, e.target.value); }}
                />
              </div>
              <div>
                <label className={labelCls}>Amount Paid (ZMW) *</label>
                <input type="number" step="0.01" min="0" required placeholder="0.00" className={inputStyle} value={intakeAmount} onChange={(e) => setIntakeAmount(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Payment Method</label>
                <select className={inputStyle} value={intakePayment} onChange={(e) => setIntakePayment(e.target.value as 'Cash' | 'Mobile Money')}>
                  <option value="Cash">Cash</option>
                  <option value="Mobile Money">Mobile Money</option>
                </select>
              </div>

              <div className="md:col-span-4 text-[11px] text-slate-500">
                {intakeMaterialQuery.trim() && intakeMatch && (
                  <span>
                    Current stock of <strong>{intakeMatch.name}</strong>: {fmtKg(intakeMatch.quantityKg)}
                    {parseFloat(intakeWeight) > 0 && <> → will become <strong className="text-emerald-600">{fmtKg(intakeMatch.quantityKg + parseFloat(intakeWeight))}</strong></>}
                  </span>
                )}
                {intakeMaterialQuery.trim() && !intakeMatch && (
                  <span className="text-amber-600">New material — it will be created in your inventory automatically.</span>
                )}
              </div>

              <button type="submit" className={`font-medium text-xs py-3 px-4 rounded-lg transition md:col-span-4 ${primaryBtn}`}>+ Record Collection</button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase text-slate-600">
                    <th className="p-3 text-center w-12">#</th>
                    <th className="p-3">Supplier</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Material</th>
                    <th className="p-3 text-right">KG</th>
                    <th className="p-3 text-right">Rate / KG</th>
                    <th className="p-3 text-right">Paid (ZMW)</th>
                    <th className="p-3">Method</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-slate-200">
                  {todayIntakes.length === 0 && (
                    <tr><td colSpan={9} className="p-4 text-center text-slate-400 italic">No collections recorded today.</td></tr>
                  )}
                  {todayIntakes.map((r, index) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-3 text-center font-bold">{index + 1}</td>
                      <td className="p-3 font-medium">{r.supplier_name}</td>
                      <td className="p-3 text-slate-500">{r.supplier_phone || '-'}</td>
                      <td className="p-3">{r.material_name}</td>
                      <td className="p-3 text-right font-bold">{r.weight_kg.toFixed(2)}</td>
                      <td className="p-3 text-right">{money(r.rate_per_kg)}</td>
                      <td className="p-3 text-right font-semibold text-blue-600">{money(r.amount_paid)}</td>
                      <td className="p-3 text-slate-500">{r.payment_method}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => handleDeleteIntake(r)} className={dangerBtn}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {todayIntakes.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 font-bold text-xs">
                      <td colSpan={4} className="p-3 text-right uppercase">Totals:</td>
                      <td className="p-3 text-right">{todayTotals.totalKg.toFixed(2)}</td>
                      <td></td>
                      <td className="p-3 text-right">{money(todayTotals.totalPaid)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-600">💸 Daily Expenses (Transport, Logistics)</h3>
                <form onSubmit={handleAddExpense} className="flex gap-2">
                  <input type="text" placeholder="Expense Description" className={`flex-1 ${inputStyle}`} value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} />
                  <input type="number" step="0.01" placeholder="Amount" className={`w-28 ${inputStyle}`} value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
                  <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-white text-xs px-3 py-2 rounded-lg">Add</button>
                </form>
                {todayExpenses.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {todayExpenses.map((exp) => (
                      <li key={exp.id} className="flex justify-between items-center bg-white p-2 rounded border border-slate-200">
                        <span>{exp.description}: {money(exp.amount)} ZMW</span>
                        <button onClick={() => handleDeleteExpense(exp.id)} className={dangerBtn}>Delete</button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="text-xs text-slate-600 space-y-1 pt-2 border-t border-slate-200">
                  <div className="flex justify-between"><span>Paid to Suppliers:</span><span className="font-bold text-blue-600">{money(todayTotals.totalPaid)} ZMW</span></div>
                  <div className="flex justify-between"><span>Expenses:</span><span className="font-bold text-red-600">{money(todayTotals.expenseTotal)} ZMW</span></div>
                  <div className="flex justify-between border-t border-slate-200 pt-1"><span>Total Spending:</span><span className="font-bold">{money(todayTotals.totalSpending)} ZMW</span></div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <h3 className="text-xs font-bold uppercase text-blue-600">🔢 Cashier Calculator</h3>
                <div className="bg-slate-950 text-right p-2 rounded text-lg font-mono text-emerald-400 border border-slate-200">{calcDisplay}</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', 'C', '=', '+'].map((btn) => (
                    <button key={btn} type="button" onClick={() => handleCalcBtn(btn)} className={`bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-bold py-1.5 rounded ${btn === '=' ? primaryBtn : ''}`}>{btn}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase text-slate-600">📚 Daily Record History</h3>
                {todayIntakes.length > 0 || todayExpenses.length > 0 ? (
                  <button onClick={() => handleExportDayPDF(todayIso)} className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded font-bold transition">📄 Export Today PDF</button>
                ) : null}
              </div>
              {historyDates.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No past-day records yet. History builds automatically once a day passes.</p>
              ) : (
                <div className="space-y-2">
                  {historyDates.map((dateStr) => {
                    const t = dayTotals(dateStr);
                    return (
                      <details key={dateStr} className="bg-white rounded border border-slate-200 p-3">
                        <summary className="cursor-pointer text-xs font-bold flex justify-between items-center gap-2">
                          <span>{dateStr} — {fmtKg(t.totalKg)} collected | Paid {money(t.totalPaid)} ZMW</span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleExportDayPDF(dateStr); }}
                              className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white px-2 py-1 rounded transition"
                            >
                              📄 PDF
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteDayRecord(dateStr); }}
                              className={dangerBtn}
                            >
                              🗑 Delete
                            </button>
                          </div>
                        </summary>
                        <div className="text-xs mt-3 space-y-1 text-slate-700">
                          <p>Average cost: {money(t.avgCost)} ZMW per KG</p>
                          <p>Expenses: {money(t.expenseTotal)} ZMW</p>
                          <p className="font-bold">Total Spending: {money(t.totalSpending)} ZMW</p>
                          {t.wastageKg > 0 && <p>Wastage: {fmtKg(t.wastageKg)} (value {money(t.wastageValue)} ZMW)</p>}
                          {t.rows.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {t.rows.map((r) => (
                                <li key={r.id} className="flex justify-between bg-slate-50 p-2 rounded border border-slate-200">
                                  <span>{r.supplier_name}{r.supplier_phone ? ` (${r.supplier_phone})` : ''} — {r.material_name}, {fmtKg(r.weight_kg)}</span>
                                  <span className="font-semibold text-blue-600">{money(r.amount_paid)} ZMW</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== BUSINESS DOCUMENTS ===================== */}
        {activeTab === 'receipts' && (
          <div className={`p-6 md:p-8 rounded-2xl shadow-sm space-y-6 border ${cardBg}`}>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">RECEIPTS, INVOICES & QUOTATIONS</h2>

            <div className="flex gap-2 text-xs">
              {(['Receipt', 'Invoice', 'Quotation'] as const).map((t) => (
                <button key={t} onClick={() => setReceiptType(t)} className={`px-3 py-1.5 rounded font-bold transition ${receiptType === t ? primaryBtn : 'bg-slate-100 hover:bg-slate-200'}`}>{t}</button>
              ))}
            </div>

            <form onSubmit={handleGenerateDocument} className="bg-slate-50 p-4 rounded-xl space-y-4 border border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Customer Name *</label>
                  <input type="text" required placeholder="e.g. John Banda" className={inputStyle} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Customer Phone</label>
                  <input type="text" placeholder="e.g. +26097..." className={inputStyle} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Customer Email</label>
                  <input type="email" className={inputStyle} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                </div>

                {receiptType === 'Receipt' && (
                  <div>
                    <label className={labelCls}>Payment Method</label>
                    <select className={inputStyle} value={receiptPaymentMethod} onChange={(e) => setReceiptPaymentMethod(e.target.value as 'Cash' | 'Mobile Money' | 'Credit')}>
                      <option value="Cash">Cash</option>
                      <option value="Mobile Money">Mobile Money</option>
                    </select>
                  </div>
                )}

                {receiptType === 'Quotation' && (
                  <div>
                    <label className={labelCls}>Valid Until</label>
                    <input type="date" required className={inputStyle} value={quotationValidUntil} onChange={(e) => setQuotationValidUntil(e.target.value)} />
                  </div>
                )}

                {receiptType === 'Invoice' && (
                  <>
                    <div>
                      <label className={labelCls}>Due Date</label>
                      <input type="date" required className={inputStyle} value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Payment Status</label>
                      <select className={inputStyle} value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value as 'PAID' | 'PENDING')}>
                        <option value="PENDING">Unpaid</option>
                        <option value="PAID">Paid</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <label className={labelCls}>Line Items</label>
                {receiptItems.map((rItem, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input type="text" required placeholder="Item Description" className={`flex-1 ${inputStyle}`} value={rItem.name} onChange={(e) => { const updated = [...receiptItems]; updated[idx].name = e.target.value; setReceiptItems(updated); }} />
                    <input type="number" required placeholder="Qty" className={`w-20 ${inputStyle}`} value={rItem.quantity} onChange={(e) => { const updated = [...receiptItems]; updated[idx].quantity = Number(e.target.value); setReceiptItems(updated); }} />
                    <input type="number" step="0.01" required placeholder="Price" className={`w-32 ${inputStyle}`} value={rItem.price} onChange={(e) => { const updated = [...receiptItems]; updated[idx].price = Number(e.target.value); setReceiptItems(updated); }} />
                  </div>
                ))}
                <button type="button" onClick={() => setReceiptItems([...receiptItems, { name: '', quantity: 1, price: 0 }])} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded transition font-medium">+ Add Item Line</button>
              </div>

              <button type="submit" className={`w-full font-bold text-xs py-3 rounded-lg shadow transition ${primaryBtn}`}>Generate & Save {receiptType}</button>
            </form>

            <div className="space-y-3 pt-4">
              <h3 className="text-sm font-bold text-slate-600">📜 Document History</h3>
              {receiptHistory.map((rec) => (
                <div key={rec.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{rec.id}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-slate-800 text-slate-100">{rec.type}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${rec.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{rec.status}</span>
                    </div>
                    <p className="text-xs text-slate-500">Customer: <strong>{rec.customer_name}</strong> | Total: {rec.total_amount.toFixed(2)} ZMW</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleExportReceiptPDF(rec)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded shadow transition">📄 PDF</button>
                    <a href={`https://wa.me/${(rec.customer_phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`${rec.type} ${rec.id} Total: ${rec.total_amount} ZMW`)}`} target="_blank" rel="noopener noreferrer" className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-2 rounded shadow transition">💬 WhatsApp</a>
                    <button onClick={() => handleDeleteReceipt(rec.id)} className="bg-red-100 text-red-700 hover:bg-red-600 hover:text-white text-xs font-bold px-3 py-2 rounded transition">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===================== ANALYTICS ===================== */}
        {activeTab === 'dashboard' && (
          <div className={`p-6 md:p-8 rounded-2xl shadow-sm space-y-6 border ${cardBg}`}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-4 gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight">COLLECTION ANALYTICS</h2>
                <p className="text-xs text-slate-500">Custom date-range summaries of collections, suppliers, costs and wastage</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="text-[11px] text-slate-500">From:</span>
                <input type="date" className="bg-white border border-slate-300 text-xs rounded p-1" value={startDateFilter} onChange={(e) => setStartDateFilter(e.target.value)} />
                <span className="text-[11px] text-slate-500">To:</span>
                <input type="date" className="bg-white border border-slate-300 text-xs rounded p-1" value={endDateFilter} onChange={(e) => setEndDateFilter(e.target.value)} />
                <button onClick={handleGenerateStatement} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold transition shadow">📄 Generate Statement</button>
                <button onClick={handleResetAnalysis} className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg font-bold transition shadow">⚠️ Reset Analysis</button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statCard('Total Collected', fmtKg(dashKg), `${filteredIntakes.length} collection(s)`, 'text-emerald-600')}
              {statCard('Paid to Suppliers', `${money(dashPaid)} ZMW`, 'Cash + mobile money', 'text-blue-600')}
              {statCard('Avg Cost / KG', `${money(dashAvgCost)} ZMW`, 'Paid divided by KG collected')}
              {statCard('Expenses', `${money(dashExpenses)} ZMW`, 'Transport, logistics, etc.', 'text-red-600')}
              {statCard('Total Spending', `${money(dashSpending)} ZMW`, 'Paid + expenses', 'text-slate-900')}
              {statCard('Wastage', fmtKg(dashWastageKg), `Value ${money(dashWastageValue)} ZMW`, 'text-amber-600')}
              {statCard('Suppliers', `${bySupplier.length}`, 'Unique people in this period')}
              {statCard('Equipment Alerts', `${equipmentNeedingAttention.length}`, 'Needs repair or out of service', 'text-red-600')}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-600">♻️ Collections by Material</h3>
                {byMaterial.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No collections for this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead><tr className="text-slate-500 uppercase"><th className="p-2">Material</th><th className="p-2 text-right">KG</th><th className="p-2 text-right">Paid</th><th className="p-2 text-right">Avg / KG</th></tr></thead>
                      <tbody className="divide-y divide-slate-200">
                        {byMaterial.map((m) => (
                          <tr key={m.name}>
                            <td className="p-2 font-medium">{m.name}</td>
                            <td className="p-2 text-right font-bold">{m.kg.toFixed(2)}</td>
                            <td className="p-2 text-right">{money(m.paid)}</td>
                            <td className="p-2 text-right">{money(m.kg > 0 ? m.paid / m.kg : 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-600">🏆 Top Suppliers</h3>
                {bySupplier.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No suppliers for this period.</p>
                ) : (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead><tr className="text-slate-500 uppercase"><th className="p-2">Supplier</th><th className="p-2 text-center">Visits</th><th className="p-2 text-right">KG</th><th className="p-2 text-right">Paid</th></tr></thead>
                      <tbody className="divide-y divide-slate-200">
                        {bySupplier.map((s) => (
                          <tr key={s.name}>
                            <td className="p-2 font-medium">{s.name}</td>
                            <td className="p-2 text-center">{s.visits}</td>
                            <td className="p-2 text-right font-bold">{s.kg.toFixed(2)}</td>
                            <td className="p-2 text-right">{money(s.paid)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
              <h3 className="text-xs font-bold uppercase text-slate-600">📋 Collection Records</h3>
              {filteredIntakes.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No collection records for this period.</p>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="sticky top-0 bg-slate-100">
                      <tr className="text-slate-500 uppercase">
                        <th className="p-2">Date</th><th className="p-2">Supplier</th><th className="p-2">Phone</th><th className="p-2">Material</th>
                        <th className="p-2 text-right">KG</th><th className="p-2 text-right">Rate / KG</th><th className="p-2 text-right">Paid (ZMW)</th><th className="p-2">Method</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {[...filteredIntakes].sort((a, b) => b.date_str.localeCompare(a.date_str)).map((r) => (
                        <tr key={r.id} className="hover:bg-white">
                          <td className="p-2">{r.date_str}</td>
                          <td className="p-2 font-medium">{r.supplier_name}</td>
                          <td className="p-2 text-slate-500">{r.supplier_phone || '-'}</td>
                          <td className="p-2">{r.material_name}</td>
                          <td className="p-2 text-right font-bold">{r.weight_kg.toFixed(2)}</td>
                          <td className="p-2 text-right">{money(r.rate_per_kg)}</td>
                          <td className="p-2 text-right font-semibold text-blue-600">{money(r.amount_paid)}</td>
                          <td className="p-2 text-slate-500">{r.payment_method}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-600">⚠️ Wastage (Rejected / Spoiled Material)</h3>
                {filteredWastage.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No wastage recorded for this period.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {filteredWastage.map((d) => (
                      <li key={d.id} className="flex justify-between items-center bg-white p-2.5 rounded border border-slate-200 gap-2">
                        <span>{d.name} ({fmtKg(d.quantity)}) - {d.date_str}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-600">{money(d.loss_value)} ZMW</span>
                          <button onClick={() => handleDeleteWastage(d.id)} className={dangerBtn}>Delete</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-600">📋 Pending Payment Audit ({pendingCreditReceipts.length})</h3>
                {pendingCreditReceipts.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">All credit orders have been fully cleared.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {pendingCreditReceipts.map((rec) => (
                      <li key={rec.id} className="flex justify-between items-center bg-white p-2.5 rounded border border-slate-200">
                        <div><strong>{rec.customer_name}</strong> ({rec.id})</div>
                        <span className="font-bold text-amber-600">{rec.total_amount.toFixed(2)} ZMW</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================== PROFILE SETTINGS ===================== */}
        {activeTab === 'settings' && (
          <div className={`p-6 md:p-8 rounded-2xl shadow-sm space-y-6 border max-w-xl ${cardBg}`}>
            <h2 className="text-xl font-semibold">Business Profile Settings</h2>
            <p className="text-xs text-slate-400">These details appear automatically on every PDF (inventory, equipment list, daily records, statements, receipts, invoices, quotations).</p>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Business Name</label>
                <input type="text" className={inputStyle} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Location / Address</label>
                <input type="text" className={inputStyle} value={profile.location} onChange={(e) => setProfile({ ...profile, location: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Phone Number</label>
                <input type="text" className={inputStyle} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Email Address</label>
                <input type="email" className={inputStyle} value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Business Logo</label>
                <div className="flex items-center gap-3">
                  {profile.logo_url && <img src={profile.logo_url} alt="Logo preview" className="w-12 h-12 rounded object-cover border border-slate-300" />}
                  <input type="file" accept="image/*" onChange={handleLogoFileChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs" />
                </div>
                {logoUploading && <p className="text-[11px] text-blue-500 mt-1">Uploading logo...</p>}
              </div>
              <button type="submit" className={`w-full font-semibold text-xs py-3 rounded-lg shadow transition ${primaryBtn}`}>Save Profile Changes</button>
            </form>
          </div>
        )}
        </section>
      </div>

      {/* ===================== DELETE WINDOW ===================== */}
      {deleteTarget && (deleteMaterialTarget || deleteEquipmentTarget) && (
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl shadow-2xl border space-y-4 ${cardBg}`}>
            <div>
              <h2 className="text-lg font-bold">
                Delete {deleteTarget.kind === 'material' ? 'Material' : 'Equipment'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                <strong>{deleteMaterialTarget?.name || deleteEquipmentTarget?.name}</strong>
                {' — '}
                {deleteMaterialTarget
                  ? `${fmtKg(deleteMaterialTarget.quantityKg)} in stock`
                  : `${deleteEquipmentTarget?.quantity} unit(s)`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setDeleteMode('partial')}
                className={`px-3 py-2.5 rounded-lg font-bold border transition ${deleteMode === 'partial' ? 'bg-slate-950 text-white border-slate-950' : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'}`}
              >
                {deleteTarget.kind === 'material' ? 'Delete some KG' : 'Delete some units'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteMode('whole')}
                className={`px-3 py-2.5 rounded-lg font-bold border transition ${deleteMode === 'whole' ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'}`}
              >
                {deleteTarget.kind === 'material' ? 'Delete whole material' : 'Delete whole record'}
              </button>
            </div>

            {deleteMode === 'partial' ? (
              <div className="space-y-2">
                <label className={labelCls}>
                  {deleteTarget.kind === 'material' ? 'KGs to delete' : 'Units to delete'}
                </label>
                <input
                  type="number"
                  min="0"
                  step={deleteTarget.kind === 'material' ? '0.01' : '1'}
                  autoFocus
                  placeholder={deleteTarget.kind === 'material' ? 'e.g. 12.5' : 'e.g. 1'}
                  className={inputStyle}
                  value={deleteAmount}
                  onChange={(e) => setDeleteAmount(e.target.value)}
                />
                <p className="text-[11px] text-slate-500">
                  {deleteTarget.kind === 'material'
                    ? 'This only reduces the stock. To record spoiled or rejected material as a loss in Analytics, use the Wastage button instead.'
                    : 'If you enter all the units, the whole record is deleted.'}
                </p>
              </div>
            ) : (
              <p className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg p-3">
                {deleteTarget.kind === 'material'
                  ? 'The material and its remaining stock will be permanently deleted. Past collection records stay on file.'
                  : 'The equipment record will be permanently deleted.'}
                {' '}This cannot be undone.
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={closeDelete} className="flex-1 text-xs font-bold py-3 rounded-lg bg-slate-100 hover:bg-slate-200 transition">Cancel</button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 text-xs font-bold py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white shadow transition"
              >
                {deleteMode === 'whole' ? 'Delete Permanently' : 'Delete Amount'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}