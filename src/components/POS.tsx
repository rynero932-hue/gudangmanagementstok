import React, { useState, useEffect, useRef } from 'react';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, CreditCard,
  Banknote, QrCode, X, CheckCircle2, Printer, Tag, ScanLine
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { processCheckout } from '../services/stockService';
import { motion, AnimatePresence } from 'motion/react';
import Receipt from './Receipt';
import type { StoreInfo, ReceiptInvoice } from './Receipt';

interface CartItem { id: string; name: string; price: number; quantity: number; stock: number; }

export default function POS() {
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<Record<string, any>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('Umum');
  const [discount, setDiscount] = useState(0);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'QRIS' | 'DEBIT' | 'KREDIT'>('CASH');
  const [amountPaid, setAmountPaid] = useState(0);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<ReceiptInvoice | null>(null);
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [tempDiscount, setTempDiscount] = useState('0');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<any[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'products'), s => setProducts(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, 'inventory'), s => {
      const m: Record<string, any> = {};
      s.docs.forEach(d => { m[d.id] = d.data(); });
      setInventory(m);
    });
    const u3 = onSnapshot(collection(db, 'categories'), s => setCategories(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    getDoc(doc(db, 'settings', 'store')).then(s => { if (s.exists()) setStoreInfo(s.data() as StoreInfo); });
    return () => { u1(); u2(); u3(); };
  }, []);

  const addToCart = (product: any) => {
    const inv = inventory[product.id] || { stockQuantity: 0 };
    if (inv.stockQuantity <= 0) { toast.error('Stok habis'); return; }
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (ex) {
        if (ex.quantity >= inv.stockQuantity) { toast.error('Stok tidak mencukupi'); return prev; }
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { id: product.id, name: product.name, price: product.sellingPrice, quantity: 1, stock: inv.stockQuantity }];
    });
  };

  const removeFromCart = (id: string) => setCart(p => p.filter(i => i.id !== id));

  const updateQty = (id: string, delta: number) => {
    setCart(p => p.map(i => {
      if (i.id !== id) return i;
      const nq = Math.max(1, i.quantity + delta);
      if (nq > i.stock) { toast.error('Stok tidak mencukupi'); return i; }
      return { ...i, quantity: nq };
    }));
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const grandTotal = Math.max(0, subtotal - discount);
  const change = paymentMethod === 'CASH' ? Math.max(0, amountPaid - grandTotal) : 0;

  const handleCheckout = async () => {
    if (!cart.length || isProcessing) return;
    if (paymentMethod === 'CASH' && amountPaid < grandTotal) { toast.error('Pembayaran kurang'); return; }
    setIsProcessing(true);

    // Snapshot state before async
    const snapCart = [...cart];
    const snapCustomer = customerName;
    const snapPayment = paymentMethod;
    const snapPaid = paymentMethod === 'CASH' ? amountPaid : grandTotal;
    const snapDiscount = discount;
    const snapSubtotal = subtotal;
    const snapGrand = grandTotal;
    const snapChange = paymentMethod === 'CASH' ? Math.max(0, amountPaid - grandTotal) : 0;
    const cashier = auth.currentUser?.displayName || 'Admin';

    try {
      const result = await processCheckout({
        items: snapCart.map(i => ({ productId: i.id, productName: i.name, quantity: i.quantity, unitPrice: i.price })),
        paymentMethod: snapPayment,
        amountPaid: snapPaid,
        customerName: snapCustomer,
        discount: snapDiscount,
      });

      if (result?.success) {
        setLastInvoice({
          invoiceNumber: result.invoiceNumber,
          customerName: snapCustomer,
          cashierName: cashier,
          paymentMethod: snapPayment,
          totalAmount: snapSubtotal,
          discountAmount: snapDiscount,
          grandTotal: snapGrand,
          amountPaid: snapPaid,
          change: snapChange,
          createdAt: { toDate: () => new Date() },
          storeInfo,
          items: snapCart.map(i => ({ productName: i.name, quantity: i.quantity, unitPrice: i.price, price: i.price, subtotal: i.price * i.quantity })),
        });
        setCart([]); setAmountPaid(0); setDiscount(0); setCustomerName('Umum');
        setIsCheckoutOpen(false);
        setIsSuccessOpen(true);
      }
    } catch { toast.error('Gagal memproses transaksi'); }
    finally { setIsProcessing(false); }
  };

  const handlePrint = () => {
    setIsSuccessOpen(false);
    setTimeout(() => window.print(), 450);
  };

  const filtered = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const matchSearch = !searchTerm || p.name?.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term) || p.barcode?.includes(searchTerm);
    const matchCat = !categoryFilter || p.categoryId === categoryFilter;
    return matchSearch && matchCat;
  });

  const fmt = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

  const PAYMENT_METHODS = [
    { key: 'CASH', label: 'Tunai', icon: Banknote },
    { key: 'QRIS', label: 'QRIS', icon: QrCode },
    { key: 'DEBIT', label: 'Debit', icon: CreditCard },
    { key: 'KREDIT', label: 'Kredit', icon: CreditCard },
  ] as const;

  const CartItemList = () => (
    <AnimatePresence initial={false}>
      {cart.map(item => (
        <motion.div key={item.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className="flex items-center gap-2.5 p-2.5 bg-neutral-50 rounded-xl">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-neutral-900 truncate">{item.name}</p>
            <p className="text-xs text-primary font-bold">{fmt(item.price)}</p>
          </div>
          <div className="flex items-center gap-1 bg-white rounded-lg border border-neutral-200 p-0.5">
            <button onClick={() => updateQty(item.id, -1)} className="p-1 hover:bg-neutral-100 rounded text-neutral-500"><Minus size={13} /></button>
            <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
            <button onClick={() => updateQty(item.id, 1)} className="p-1 hover:bg-neutral-100 rounded text-neutral-500"><Plus size={13} /></button>
          </div>
          <div className="text-xs font-bold text-neutral-700 w-16 text-right">{fmt(item.price * item.quantity)}</div>
          <button onClick={() => removeFromCart(item.id)} className="p-1 text-neutral-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
        </motion.div>
      ))}
    </AnimatePresence>
  );

  const CartSummary = ({ onCheckout }: { onCheckout: () => void }) => (
    <div className="space-y-3">
      <div className="flex justify-between text-sm text-neutral-500"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
      <div className="flex justify-between text-sm">
        <span className="text-neutral-500">Diskon</span>
        <button onClick={() => { setTempDiscount(discount.toString()); setIsDiscountOpen(true); }}
          className="text-primary hover:underline flex items-center gap-1 text-sm">
          <Tag size={11} />{discount > 0 ? `-${fmt(discount)}` : 'Tambah Diskon'}
        </button>
      </div>
      <div className="flex justify-between font-bold text-lg border-t border-neutral-200 pt-2">
        <span>Total</span><span className="text-primary">{fmt(grandTotal)}</span>
      </div>
      <Button disabled={!cart.length} onClick={onCheckout} className="w-full h-12 rounded-2xl text-base shadow-lg shadow-primary/20">
        Bayar Sekarang
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 relative" style={{ minHeight: "calc(100dvh - 7rem)" }}>
      {/* Left: Product area */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Search + category filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={17} />
            <Input ref={searchRef} placeholder="Cari produk / scan barcode..." className="pl-10 h-11 rounded-xl border-neutral-200"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && filtered.length === 1) { addToCart(filtered[0]); setSearchTerm(''); } }} />
          </div>
          {categories.length > 0 && (
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="h-11 px-3 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary/20 shrink-0 max-w-[130px]">
              <option value="">Semua</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {/* Product grid */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(100dvh - 12rem)" }}>
          {filtered.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-neutral-400">
              <Search size={28} className="mb-2 opacity-20" />
              <p className="text-sm">Produk tidak ditemukan</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 pb-24 lg:pb-4">
              {filtered.map(product => {
                const inv = inventory[product.id] || { stockQuantity: 0 };
                const isOut = inv.stockQuantity <= 0;
                const inCart = cart.find(i => i.id === product.id);
                return (
                  <motion.div key={product.id} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
                    <Card className={`h-full cursor-pointer transition-all border-2 ${inCart ? 'border-primary/40 shadow-md' : 'border-neutral-200 hover:border-primary/20 hover:shadow-sm'} ${isOut ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                      onClick={() => !isOut && addToCart(product)}>
                      <CardContent className="p-2.5 flex flex-col h-full">
                        <div className="w-full aspect-square bg-neutral-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden relative">
                          {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="object-cover w-full h-full" referrerPolicy="no-referrer" />
                            : <ShoppingCart size={24} className="text-neutral-300" />}
                          {inCart && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow">
                              {inCart.quantity}
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-neutral-900 line-clamp-2 text-xs leading-tight mb-0.5">{product.name}</p>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-bold text-primary text-xs">{fmt(product.sellingPrice)}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isOut ? 'bg-red-100 text-red-600' : 'bg-neutral-100 text-neutral-500'}`}>
                            {isOut ? 'Habis' : inv.stockQuantity}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart - Desktop */}
      <Card className="hidden lg:flex w-[340px] xl:w-[380px] shrink-0 flex-col border-neutral-200 shadow-xl rounded-3xl overflow-hidden bg-white" style={{ maxHeight: "calc(100dvh - 7rem)", position: "sticky", top: 0 }}>
        <CardHeader className="bg-neutral-50 border-b border-neutral-100 py-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ShoppingCart size={18} className="text-primary" />Keranjang
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full text-xs">{cart.length} item</Badge>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-[10px] text-red-400 hover:text-red-500 hover:underline">Kosongkan</button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-3 space-y-2">
          <CartItemList />
          {!cart.length && (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-neutral-400">
              <ShoppingCart size={36} className="mb-2 opacity-15" />
              <p className="text-sm">Keranjang kosong</p>
              <p className="text-xs text-neutral-300 mt-0.5">Klik produk untuk menambahkan</p>
            </div>
          )}
        </CardContent>
        <div className="p-4 bg-neutral-50 border-t border-neutral-100">
          <CartSummary onCheckout={() => setIsCheckoutOpen(true)} />
        </div>
      </Card>

      {/* Mobile: Floating cart button */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 inset-x-4 z-40 lg:hidden">
          <Button onClick={() => setIsCartOpen(true)} className="w-full h-14 rounded-2xl shadow-2xl shadow-primary/40 flex items-center justify-between px-5">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <ShoppingCart size={20} />
                <span className="absolute -top-2 -right-2 h-4 w-4 bg-white text-primary rounded-full text-[9px] font-black flex items-center justify-center">{cart.length}</span>
              </div>
              <span className="font-bold">Keranjang</span>
            </div>
            <span className="font-bold text-lg">{fmt(grandTotal)}</span>
          </Button>
        </div>
      )}

      {/* Mobile Cart Drawer */}
      <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
        <DialogContent className="w-full max-w-full sm:max-w-md h-[88dvh] flex flex-col p-0 overflow-hidden rounded-t-3xl sm:rounded-3xl fixed bottom-0 top-auto translate-y-0">
          <DialogHeader className="px-5 py-4 bg-neutral-50 border-b border-neutral-100 shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <ShoppingCart size={18} className="text-primary" />Keranjang ({cart.length})
              </DialogTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsCartOpen(false)}><X size={18} /></Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <CartItemList />
            {!cart.length && <div className="h-28 flex items-center justify-center text-neutral-400 text-sm">Keranjang kosong</div>}
          </div>
          <div className="p-4 bg-neutral-50 border-t border-neutral-100 shrink-0">
            <CartSummary onCheckout={() => { setIsCartOpen(false); setTimeout(() => setIsCheckoutOpen(true), 200); }} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Checkout Modal */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-[420px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Pembayaran</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="bg-primary/5 rounded-2xl p-5 text-center">
              <p className="text-sm text-primary font-medium">Total Tagihan</p>
              <h2 className="text-4xl font-black text-primary mt-1">{fmt(grandTotal)}</h2>
              {discount > 0 && <p className="text-xs text-neutral-400 mt-1">Diskon: {fmt(discount)}</p>}
            </div>

            <div>
              <Label className="mb-2 block">Metode Pembayaran</Label>
              <div className="grid grid-cols-4 gap-2">
                {PAYMENT_METHODS.map(({ key, label, icon: Icon }) => (
                  <button key={key} onClick={() => { setPaymentMethod(key); setAmountPaid(0); }}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${paymentMethod === key ? 'border-primary bg-primary/5 text-primary' : 'border-neutral-100 text-neutral-500 hover:border-neutral-200'}`}>
                    <Icon size={18} /><span className="text-[10px] font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'CASH' && (
              <div>
                <Label className="mb-1.5 block">Jumlah Bayar</Label>
                <Input type="number" className="h-12 text-xl font-bold text-center" value={amountPaid || ''} placeholder="0"
                  onChange={e => setAmountPaid(Number(e.target.value))} autoFocus />
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[grandTotal % 1000 > 0 ? Math.ceil(grandTotal / 1000) * 1000 : grandTotal, 50000, 100000, 200000]
                    .filter((v, i, a) => a.indexOf(v) === i).slice(0, 4).map(v => (
                      <button key={v} onClick={() => setAmountPaid(v)}
                        className="py-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-xs font-bold transition-colors">
                        {v >= 1000 ? `${v / 1000}k` : v}
                      </button>
                    ))}
                </div>
                {amountPaid > 0 && (
                  <div className={`mt-3 flex justify-between items-center p-3 rounded-xl ${change < 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <span className="text-sm font-medium text-neutral-600">Kembalian</span>
                    <span className={`text-xl font-black ${change < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(change)}</span>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="mb-1.5 block">Nama Pelanggan</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Umum" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setIsCheckoutOpen(false)}>Batal</Button>
            <Button className="flex-1 rounded-xl" onClick={handleCheckout}
              disabled={isProcessing || (paymentMethod === 'CASH' && amountPaid < grandTotal)}>
              {isProcessing ? 'Memproses...' : 'Konfirmasi Bayar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <Dialog open={isSuccessOpen} onOpenChange={setIsSuccessOpen}>
        <DialogContent className="w-full max-w-[90vw] sm:max-w-[360px] rounded-3xl text-center p-7">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={38} />
          </div>
          <h2 className="text-xl font-bold mb-1">Transaksi Berhasil!</h2>
          <p className="text-sm text-neutral-500 mb-5">Pembayaran diterima & stok diperbarui.</p>
          {lastInvoice && (
            <div className="bg-neutral-50 rounded-2xl p-4 text-left space-y-1.5 mb-5 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">Invoice</span><span className="font-mono font-bold text-xs">{lastInvoice.invoiceNumber}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Total</span><span className="font-bold">{fmt(lastInvoice.grandTotal)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Dibayar</span><span className="font-bold">{fmt(lastInvoice.amountPaid)}</span></div>
              {lastInvoice.paymentMethod === 'CASH' && (
                <div className="flex justify-between pt-1.5 border-t border-neutral-200">
                  <span className="text-neutral-500">Kembalian</span><span className="font-bold text-emerald-600">{fmt(lastInvoice.change)}</span>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="rounded-xl" onClick={() => setIsSuccessOpen(false)}>Tutup</Button>
            <Button className="rounded-xl gap-2" onClick={handlePrint}><Printer size={15} />Cetak Struk</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Discount Modal */}
      <Dialog open={isDiscountOpen} onOpenChange={setIsDiscountOpen}>
        <DialogContent className="w-full max-w-[320px] rounded-2xl">
          <DialogHeader><DialogTitle>Masukkan Diskon</DialogTitle></DialogHeader>
          <div className="py-3">
            <Label className="mb-1.5 block">Jumlah Diskon (Rp)</Label>
            <Input type="number" value={tempDiscount} min="0" max={subtotal}
              onChange={e => setTempDiscount(e.target.value)} className="text-lg" autoFocus />
            <p className="text-xs text-neutral-400 mt-1">Maks: {fmt(subtotal)}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDiscountOpen(false)}>Batal</Button>
            <Button onClick={() => { setDiscount(Math.min(Number(tempDiscount), subtotal)); setIsDiscountOpen(false); }}>Terapkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lastInvoice && <Receipt invoice={lastInvoice} />}
    </div>
  );
}
