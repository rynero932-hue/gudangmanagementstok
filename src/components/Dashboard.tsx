import React, { useState, useEffect } from 'react';
import { TrendingUp, Package, AlertTriangle, ShoppingCart, ArrowRight } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface DashboardProps {
  setActiveTab?: (tab: string) => void;
}

export default function Dashboard({ setActiveTab }: DashboardProps) {
  const [stats, setStats] = useState({ totalSales: 0, totalOrders: 0, lowStockCount: 0, totalProducts: 0 });
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [products, setProducts] = useState<Record<string, any>>({});

  useEffect(() => {
    const unsubSales = onSnapshot(collection(db, 'sales'), snap => {
      let total = 0;
      snap.docs.forEach(d => { total += d.data().grandTotal || 0; });
      setStats(p => ({ ...p, totalSales: total, totalOrders: snap.size }));

      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        return { date: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }), amount: 0, ts: new Date(d.setHours(0, 0, 0, 0)).getTime() };
      });
      snap.docs.forEach(d => {
        const sd = d.data().createdAt?.toDate();
        if (sd) {
          const dayTs = new Date(sd).setHours(0, 0, 0, 0);
          const day = days.find(x => x.ts === dayTs);
          if (day) day.amount += d.data().grandTotal || 0;
        }
      });
      setChartData(days);
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), snap => {
      setStats(p => ({ ...p, totalProducts: snap.size }));
      const pm: Record<string, any> = {};
      snap.docs.forEach(d => { pm[d.id] = { id: d.id, ...d.data() }; });
      setProducts(pm);
    });

    const unsubInv = onSnapshot(collection(db, 'inventory'), snap => {
      const low: any[] = [];
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.stockQuantity <= (data.minimumStock || 10)) low.push({ id: d.id, ...data });
      });
      setStats(p => ({ ...p, lowStockCount: low.length }));
      setLowStockItems(low.slice(0, 6));
    });

    const q = query(collection(db, 'sales'), orderBy('createdAt', 'desc'), limit(6));
    const unsubRecent = onSnapshot(q, snap => setRecentSales(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => { unsubSales(); unsubProducts(); unsubInv(); unsubRecent(); };
  }, []);

  const fmt = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
  const fmtShort = (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);

  const statCards = [
    { title: 'Total Penjualan', value: fmt(stats.totalSales), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', sub: 'Semua waktu' },
    { title: 'Total Transaksi', value: stats.totalOrders.toString(), icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50', sub: 'Semua waktu' },
    { title: 'Stok Menipis', value: stats.lowStockCount.toString(), icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', sub: 'Perlu perhatian', urgent: stats.lowStockCount > 0 },
    { title: 'Total Produk', value: stats.totalProducts.toString(), icon: Package, color: 'text-purple-600', bg: 'bg-purple-50', sub: 'Aktif' },
  ];

  const hasChartData = chartData.some(d => d.amount > 0);

  return (
    <div className="space-y-5 pb-10">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {statCards.map(({ title, value, icon: Icon, color, bg, sub, urgent }) => (
          <Card key={title} className={`border-neutral-200 shadow-sm ${urgent ? 'ring-1 ring-amber-200' : ''}`}>
            <CardContent className="p-4 lg:p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${bg} ${color} flex items-center justify-center shrink-0`}>
                  <Icon size={20} />
                </div>
                {urgent && <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse mt-1 shrink-0"></span>}
              </div>
              <p className="text-xs text-neutral-500 font-medium">{title}</p>
              <p className="text-xl lg:text-2xl font-bold text-neutral-900 mt-0.5 truncate">{value}</p>
              <p className="text-[10px] text-neutral-400 mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart + Recent Sales */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Sales Chart — fixed pixel height agar ResponsiveContainer bekerja */}
        <Card className="xl:col-span-2 border-neutral-200 shadow-sm">
          <CardHeader className="pb-0 pt-5 px-5">
            <CardTitle className="text-base font-semibold">Tren Penjualan (7 Hari)</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4 pt-3">
            {hasChartData ? (
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={24} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#aaa' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#aaa' }} tickFormatter={fmtShort} width={44} />
                    <Tooltip
                      contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: '12px' }}
                      formatter={(v: number) => [fmt(v), 'Penjualan']}
                      cursor={{ fill: 'rgba(59,130,246,0.05)' }}
                    />
                    <Bar dataKey="amount" fill="#3b82f6" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-neutral-400 py-16 space-y-2">
                <TrendingUp size={36} className="opacity-15" />
                <p className="text-sm font-medium text-neutral-500">Belum ada data grafik</p>
                <p className="text-xs text-neutral-400 text-center">Data akan muncul setelah ada transaksi penjualan</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card className="border-neutral-200 shadow-sm">
          <CardHeader className="pb-2 pt-5 px-5 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Transaksi Terbaru</CardTitle>
            {setActiveTab && (
              <Button variant="ghost" size="sm" className="text-xs text-primary h-7 gap-1 px-2 shrink-0"
                onClick={() => setActiveTab('sales')}>
                Lihat semua <ArrowRight size={12} />
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {recentSales.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center text-neutral-400 space-y-2">
                <ShoppingCart size={28} className="opacity-15" />
                <p className="text-sm text-neutral-500 font-medium">Belum ada transaksi</p>
                <p className="text-xs text-neutral-400 text-center">Mulai berjualan di menu Kasir</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentSales.map(sale => (
                  <div key={sale.id} className="flex items-center gap-3 p-2 hover:bg-neutral-50 rounded-xl transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <ShoppingCart size={14} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-neutral-900 truncate">{sale.invoiceNumber}</p>
                      <p className="text-[10px] text-neutral-500 truncate">{sale.customerName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-primary">{fmt(sale.grandTotal)}</p>
                      <p className="text-[10px] text-neutral-400">
                        {sale.createdAt?.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              Peringatan Stok ({stats.lowStockCount} produk)
            </CardTitle>
            {setActiveTab && (
              <Button variant="ghost" size="sm" className="text-xs text-amber-700 h-7 gap-1 px-2 hover:bg-amber-100 shrink-0"
                onClick={() => setActiveTab('inventory')}>
                Kelola <ArrowRight size={12} />
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {lowStockItems.map(item => {
                const prod = products[item.id];
                const isOut = item.stockQuantity === 0;
                return (
                  <div key={item.id} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-amber-100">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isOut ? 'bg-red-100' : 'bg-amber-100'}`}>
                      <Package size={14} className={isOut ? 'text-red-500' : 'text-amber-500'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{prod?.name || 'Produk'}</p>
                      <p className="text-xs text-neutral-500">
                        Stok: <span className={`font-bold ${isOut ? 'text-red-600' : 'text-amber-600'}`}>{item.stockQuantity}</span>
                        {' '}/ Min: {item.minimumStock}
                      </p>
                    </div>
                    <Badge className={`text-[10px] border-none shrink-0 ${isOut ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {isOut ? 'Habis' : 'Menipis'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
