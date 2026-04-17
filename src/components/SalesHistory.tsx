import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, CalendarIcon, Eye, FileText, Download,
  TrendingUp, ShoppingBag, Users as UsersIcon, X, Printer
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import Receipt from './Receipt';
import type { StoreInfo } from './Receipt';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 20;

export default function SalesHistory() {
  const [sales, setSales] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | undefined>(undefined);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'sales'), orderBy('createdAt', 'desc')), snap => {
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    // Load store info for receipt
    getDoc(doc(db, 'settings', 'store')).then(snap => {
      if (snap.exists()) setStoreInfo(snap.data() as StoreInfo);
    });
    return () => unsub();
  }, []);

  const viewDetail = async (sale: any) => {
    setLoadingDetail(true);
    setSelectedSale(sale);
    setIsDetailOpen(true);
    try {
      const itemsSnap = await getDocs(collection(db, `sales/${sale.id}/items`));
      setSaleItems(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { toast.error('Gagal memuat detail'); }
    finally { setLoadingDetail(false); }
  };

  const handlePrint = async (sale: any) => {
    // Ensure items are loaded
    if (!selectedSale || selectedSale.id !== sale.id || saleItems.length === 0) {
      setSelectedSale(sale);
      try {
        const itemsSnap = await getDocs(collection(db, `sales/${sale.id}/items`));
        setSaleItems(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch { toast.error('Gagal memuat data struk'); return; }
    }
    setIsDetailOpen(false);
    setTimeout(() => window.print(), 450);
  };

  const exportCSV = () => {
    if (filteredSales.length === 0) { toast.error('Tidak ada data untuk diekspor'); return; }
    const headers = ['Invoice', 'Tanggal', 'Pelanggan', 'Metode', 'Subtotal', 'Diskon', 'Total', 'Status'];
    const rows = filteredSales.map(s => [
      s.invoiceNumber,
      s.createdAt?.toDate().toLocaleString('id-ID') || '',
      s.customerName,
      s.paymentMethod,
      s.totalAmount,
      s.discountAmount || 0,
      s.grandTotal,
      s.status
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `penjualan_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('File CSV berhasil diunduh');
  };

  const filteredSales = sales.filter(s => {
    const search = searchTerm.toLowerCase();
    const matchSearch = !searchTerm ||
      s.invoiceNumber?.toLowerCase().includes(search) ||
      s.customerName?.toLowerCase().includes(search);
    if (!matchSearch) return false;
    if (dateRange.start || dateRange.end) {
      const d = s.createdAt?.toDate();
      if (!d) return false;
      if (dateRange.start) {
        const start = new Date(dateRange.start); start.setHours(0, 0, 0, 0);
        if (d < start) return false;
      }
      if (dateRange.end) {
        const end = new Date(dateRange.end); end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
    }
    return true;
  });

  const paginatedSales = filteredSales.slice(0, page * ITEMS_PER_PAGE);
  const hasMore = paginatedSales.length < filteredSales.length;

  const fmt = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
  const summary = filteredSales.reduce((acc, s) => ({ total: acc.total + s.grandTotal, count: acc.count + 1 }), { total: 0, count: 0 });
  const avgOrder = summary.count > 0 ? summary.total / summary.count : 0;

  const filterActive = !!(dateRange.start || dateRange.end);

  return (
    <div className="space-y-4 pb-10">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 lg:gap-4 no-print">
        {[
          { label: 'Total Penjualan', value: fmt(summary.total), icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Jumlah Transaksi', value: summary.count.toString(), icon: ShoppingBag, color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { label: 'Rata-rata', value: fmt(avgOrder), icon: UsersIcon, color: 'text-amber-600', bg: 'bg-amber-100' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-neutral-200 shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-3 sm:p-5 flex items-center gap-3">
              <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl ${bg} ${color} flex items-center justify-center shrink-0`}>
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-neutral-500 font-medium truncate">{label}</p>
                <p className="text-sm sm:text-xl font-bold text-neutral-900 truncate">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 no-print">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
          <Input
            placeholder="Cari invoice atau pelanggan..."
            className="pl-9 h-10 rounded-xl border-neutral-200"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-2">
          <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <DialogTrigger>
              <Button variant={filterActive ? 'default' : 'outline'} className={`h-10 rounded-xl gap-2 ${filterActive ? '' : ''}`}>
                <CalendarIcon size={15} />
                <span className="hidden sm:inline">{filterActive ? 'Filter Aktif' : 'Filter Tanggal'}</span>
                <span className="sm:hidden">Filter</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[380px] rounded-2xl">
              <DialogHeader><DialogTitle>Filter Tanggal</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-3">
                <div className="space-y-1.5">
                  <Label>Tanggal Mulai</Label>
                  <Input type="date" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tanggal Akhir</Label>
                  <Input type="date" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1 rounded-xl" onClick={() => { setDateRange({ start: '', end: '' }); setIsFilterOpen(false); }}>Reset</Button>
                <Button className="flex-1 rounded-xl" onClick={() => { setIsFilterOpen(false); setPage(1); }}>Terapkan</Button>
              </div>
            </DialogContent>
          </Dialog>
          {filterActive && (
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-red-400 hover:text-red-500 hover:bg-red-50"
              onClick={() => setDateRange({ start: '', end: '' })}>
              <X size={16} />
            </Button>
          )}
          <Button variant="outline" className="h-10 rounded-xl gap-2" onClick={exportCSV}>
            <Download size={15} />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </div>

      {/* Desktop Table */}
      <Card className="border-neutral-200 shadow-sm overflow-hidden rounded-2xl hidden md:block no-print">
        <Table>
          <TableHeader className="bg-neutral-50">
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Pelanggan</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSales.map(sale => (
              <TableRow key={sale.id} className="hover:bg-neutral-50/60 transition-colors">
                <TableCell className="font-bold text-neutral-900 font-mono text-sm">{sale.invoiceNumber}</TableCell>
                <TableCell className="text-sm text-neutral-500">
                  <div>{sale.createdAt?.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  <div className="text-[10px]">{sale.createdAt?.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
                </TableCell>
                <TableCell className="text-sm">{sale.customerName}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full text-xs font-medium">{sale.paymentMethod}</Badge>
                </TableCell>
                <TableCell className="font-bold text-primary">{fmt(sale.grandTotal)}</TableCell>
                <TableCell>
                  <Badge className="bg-emerald-100 text-emerald-700 border-none rounded-full text-xs">{sale.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" title="Cetak Struk"
                      onClick={() => handlePrint(sale)}>
                      <Printer size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 rounded-lg gap-1 text-xs" onClick={() => viewDetail(sale)}>
                      <Eye size={13} />Detail
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredSales.length === 0 && (
              <TableRow><TableCell colSpan={7} className="h-32 text-center text-neutral-400">Tidak ada data penjualan</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden no-print">
        {paginatedSales.map(sale => (
          <Card key={sale.id} className="border-neutral-200 shadow-sm overflow-hidden rounded-2xl">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-bold text-sm font-mono">{sale.invoiceNumber}</span>
                <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px]">{sale.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase">Pelanggan</p>
                  <p className="text-sm font-medium text-neutral-900 truncate">{sale.customerName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-neutral-400 font-bold uppercase">Tanggal</p>
                  <p className="text-sm">{sale.createdAt?.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2.5 border-t border-neutral-100">
                <div>
                  <Badge variant="outline" className="text-[10px]">{sale.paymentMethod}</Badge>
                  <p className="font-bold text-primary mt-1">{fmt(sale.grandTotal)}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => handlePrint(sale)}>
                    <Printer size={15} />
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1" onClick={() => viewDetail(sale)}>
                    <Eye size={14} />Detail
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredSales.length === 0 && (
          <div className="h-28 flex items-center justify-center text-neutral-400 bg-white rounded-2xl border border-neutral-200 text-sm">
            Tidak ada data penjualan
          </div>
        )}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center no-print">
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => setPage(p => p + 1)}>
            Tampilkan Lebih Banyak ({filteredSales.length - paginatedSales.length} lagi)
          </Button>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-[580px] rounded-3xl max-h-[90dvh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-5 pb-0">
            <DialogTitle className="text-lg font-bold">Detail Transaksi</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-neutral-400 uppercase font-bold">Invoice</p>
                  <p className="font-bold text-sm font-mono">{selectedSale.invoiceNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-neutral-400 uppercase font-bold">Tanggal</p>
                  <p className="text-sm">{selectedSale.createdAt?.toDate().toLocaleString('id-ID')}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-400 uppercase font-bold">Pelanggan</p>
                  <p className="font-medium text-sm">{selectedSale.customerName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-neutral-400 uppercase font-bold">Metode</p>
                  <Badge variant="outline" className="text-xs">{selectedSale.paymentMethod}</Badge>
                </div>
              </div>

              <div className="border border-neutral-100 rounded-2xl overflow-hidden">
                {loadingDetail ? (
                  <div className="h-24 flex items-center justify-center text-neutral-400 text-sm">Memuat...</div>
                ) : (
                  <Table>
                    <TableHeader className="bg-neutral-50">
                      <TableRow>
                        <TableHead>Produk</TableHead>
                        <TableHead className="text-center w-16">Qty</TableHead>
                        <TableHead className="text-right">Harga</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {saleItems.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                          <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(item.unitPrice)}</TableCell>
                          <TableCell className="text-right font-bold text-sm">{fmt(item.subtotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                <div className="flex justify-between text-sm text-neutral-500"><span>Subtotal</span><span>{fmt(selectedSale.totalAmount)}</span></div>
                {selectedSale.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-neutral-500"><span>Diskon</span><span>-{fmt(selectedSale.discountAmount)}</span></div>
                )}
                <div className="flex justify-between text-base font-bold text-neutral-900 pt-1 border-t border-neutral-200">
                  <span>Total Bayar</span><span className="text-primary">{fmt(selectedSale.grandTotal)}</span>
                </div>
              </div>
            </div>
          )}
          <div className="p-4 border-t border-neutral-100 flex gap-3 shrink-0">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setIsDetailOpen(false)}>Tutup</Button>
            <Button className="flex-1 rounded-xl gap-2" onClick={() => selectedSale && handlePrint(selectedSale)}>
              <Printer size={16} />Cetak Struk
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Printable Receipt */}
      {selectedSale && (
        <Receipt
          invoice={{
            ...selectedSale,
            amountPaid: selectedSale.amountPaid || selectedSale.grandTotal,
            change: selectedSale.changeAmount || selectedSale.change || 0,
            storeInfo,
            items: saleItems.map(item => ({
              ...item,
              productName: item.productName || 'Produk',
              unitPrice: item.unitPrice || 0,
              subtotal: item.subtotal || 0,
            }))
          }}
        />
      )}
    </div>
  );
}
