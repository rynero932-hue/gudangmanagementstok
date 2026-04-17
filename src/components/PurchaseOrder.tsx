import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  FileText, 
  Truck, 
  Calendar, 
  Eye, 
  CheckCircle, 
  XCircle,
  Clock
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  setDoc, 
  serverTimestamp, 
  getDocs,
  runTransaction
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const poSchema = z.object({
  poNumber: z.string().min(3, 'Nomor PO minimal 3 karakter'),
  supplierId: z.string().min(1, 'Pilih supplier'),
  orderDate: z.string().min(1, 'Pilih tanggal order'),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1, 'Pilih produk'),
    productName: z.string(),
    quantity: z.number().positive('Jumlah harus positif'),
    buyPrice: z.number().nonnegative('Harga harus positif'),
  })).min(1, 'Minimal 1 item')
});

type POFormValues = z.infer<typeof poSchema>;

export default function PurchaseOrder() {
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [poItems, setPOItems] = useState<any[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<POFormValues>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      poNumber: `PO-${Date.now()}`,
      orderDate: new Date().toISOString().split('T')[0],
      items: [{ productId: '', productName: '', quantity: 0, buyPrice: 0 }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  useEffect(() => {
    const unsubPO = onSnapshot(query(collection(db, 'purchase_orders'), orderBy('createdAt', 'desc')), (snapshot) => {
      setPurchaseOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubPO();
      unsubSuppliers();
      unsubProducts();
    };
  }, []);

  const onSubmit = async (data: POFormValues) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const totalAmount = data.items.reduce((sum, item) => sum + (item.quantity * item.buyPrice), 0);
      const poRef = doc(collection(db, 'purchase_orders'));
      
      await runTransaction(db, async (transaction) => {
        transaction.set(poRef, {
          poNumber: data.poNumber,
          supplierId: data.supplierId,
          orderDate: data.orderDate,
          expectedDate: data.expectedDate || null,
          totalAmount,
          status: 'PENDING',
          notes: data.notes || '',
          createdBy: userId,
          createdAt: serverTimestamp()
        });

        for (const item of data.items) {
          const itemRef = doc(collection(db, `purchase_orders/${poRef.id}/items`));
          transaction.set(itemRef, {
            ...item,
            subtotal: item.quantity * item.buyPrice
          });
        }
      });

      toast.success('Purchase Order berhasil dibuat');
      setIsModalOpen(false);
      reset();
    } catch (error) {
      console.error(error);
      toast.error('Gagal membuat Purchase Order');
    }
  };

  const viewDetail = async (po: any) => {
    setSelectedPO(po);
    const itemsSnap = await getDocs(collection(db, `purchase_orders/${po.id}/items`));
    setPOItems(itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setIsDetailOpen(true);
  };

  const receivePO = async (po: any) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const itemsSnap = await getDocs(collection(db, `purchase_orders/${po.id}/items`));
      const items = itemsSnap.docs.map(doc => doc.data());

      await runTransaction(db, async (transaction) => {
        // 1. Update PO Status
        transaction.update(doc(db, 'purchase_orders', po.id), {
          status: 'RECEIVED',
          receivedAt: serverTimestamp()
        });

        // 2. Update Inventory for each item
        for (const item of items) {
          const invRef = doc(db, 'inventory', item.productId);
          const invDoc = await transaction.get(invRef);
          
          let stockBefore = 0;
          if (invDoc.exists()) {
            stockBefore = invDoc.data().stockQuantity;
          }

          const stockAfter = stockBefore + item.quantity;

          transaction.set(invRef, {
            productId: item.productId,
            stockQuantity: stockAfter,
            lastBuyPrice: item.buyPrice,
            updatedAt: serverTimestamp()
          }, { merge: true });

          // Log Transaction
          const transRef = doc(collection(db, 'stock_transactions'));
          transaction.set(transRef, {
            productId: item.productId,
            transactionType: 'IN',
            quantity: item.quantity,
            pricePerUnit: item.buyPrice,
            referenceId: po.id,
            referenceType: 'PURCHASE',
            notes: `Received from PO: ${po.poNumber}`,
            createdBy: userId,
            createdAt: serverTimestamp(),
            stockBefore,
            stockAfter
          });
        }
      });

      toast.success('Stok berhasil diterima dan diperbarui');
      setIsDetailOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Gagal menerima stok');
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  const filteredPO = purchaseOrders.filter(po => 
    po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    suppliers.find(s => s.id === po.supplierId)?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
          <Input 
            placeholder="Cari nomor PO atau supplier..." 
            className="pl-10 h-11 rounded-xl border-neutral-200 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger>
            <Button className="h-11 rounded-xl gap-2 px-6 flex-1 lg:flex-none">
              <Plus size={18} />
              <span>Buat PO Baru</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] w-[95vw] rounded-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Buat Purchase Order</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nomor PO</Label>
                  <Input {...register('poNumber')} />
                  {errors.poNumber && <p className="text-xs text-red-500">{errors.poNumber.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select onValueChange={(val: string) => setValue('supplierId', val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.supplierId && <p className="text-xs text-red-500">{errors.supplierId.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tanggal Order</Label>
                  <Input type="date" {...register('orderDate')} />
                  {errors.orderDate && <p className="text-xs text-red-500">{errors.orderDate.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Estimasi Kedatangan</Label>
                  <Input type="date" {...register('expectedDate')} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-bold">Item Pesanan</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: '', productName: '', quantity: 0, buyPrice: 0 })}>
                    Tambah Item
                  </Button>
                </div>
                
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end border-b border-neutral-100 pb-4">
                    <div className="col-span-1 sm:col-span-5 space-y-1">
                      <Label className="text-[10px] uppercase text-neutral-400">Produk</Label>
                      <Select onValueChange={(val: string) => {
                        const p = products.find(prod => prod.id === val);
                        setValue(`items.${index}.productId`, val);
                        setValue(`items.${index}.productName`, p?.name || '');
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Produk" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 sm:col-span-2 space-y-1">
                      <Label className="text-[10px] uppercase text-neutral-400">Qty</Label>
                      <Input type="number" {...register(`items.${index}.quantity`, { valueAsNumber: true })} />
                    </div>
                    <div className="col-span-1 sm:col-span-4 space-y-1">
                      <Label className="text-[10px] uppercase text-neutral-400">Harga Beli</Label>
                      <Input type="number" {...register(`items.${index}.buyPrice`, { valueAsNumber: true })} />
                    </div>
                    <div className="col-span-1 sm:pb-1 flex justify-end">
                      <Button type="button" variant="ghost" size="icon" className="text-red-500" onClick={() => remove(index)}>
                        <XCircle size={18} />
                      </Button>
                    </div>
                  </div>
                ))}
                {errors.items && <p className="text-xs text-red-500">{errors.items.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Catatan</Label>
                <Input {...register('notes')} placeholder="Tambahkan catatan jika ada..." />
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setIsModalOpen(false)}>Batal</Button>
                <Button type="submit" className="w-full sm:w-auto">Simpan Purchase Order</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-neutral-200 shadow-sm overflow-hidden rounded-2xl hidden md:block">
        <Table>
          <TableHeader className="bg-neutral-50">
            <TableRow>
              <TableHead>No. PO</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPO.map((po) => (
              <TableRow key={po.id} className="hover:bg-neutral-50/50 transition-colors">
                <TableCell className="font-bold text-neutral-900">{po.poNumber}</TableCell>
                <TableCell className="text-sm text-neutral-500">
                  {new Date(po.orderDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </TableCell>
                <TableCell>{(suppliers.find(s => s.id === po.supplierId)?.name as string) || 'Unknown'}</TableCell>
                <TableCell className="font-bold text-primary">{formatCurrency(po.totalAmount)}</TableCell>
                <TableCell>
                  {po.status === 'RECEIVED' ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 rounded-full border-none gap-1">
                      <CheckCircle size={12} />
                      <span>Diterima</span>
                    </Badge>
                  ) : po.status === 'PENDING' ? (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 rounded-full border-none gap-1">
                      <Clock size={12} />
                      <span>Pending</span>
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="rounded-full gap-1">
                      <XCircle size={12} />
                      <span>Dibatalkan</span>
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-8 rounded-lg gap-1" onClick={() => viewDetail(po)}>
                    <Eye size={14} />
                    <span>Detail</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filteredPO.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-neutral-400">
                  Tidak ada data Purchase Order
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {filteredPO.map((po) => (
          <Card key={po.id} className="border-neutral-200 shadow-sm overflow-hidden rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-neutral-900">{po.poNumber}</span>
                {po.status === 'RECEIVED' ? (
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 rounded-full border-none text-[10px]">Diterima</Badge>
                ) : po.status === 'PENDING' ? (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 rounded-full border-none text-[10px]">Pending</Badge>
                ) : (
                  <Badge variant="destructive" className="rounded-full text-[10px]">Dibatalkan</Badge>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[10px] text-neutral-400 uppercase font-bold">Supplier</p>
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {(suppliers.find(s => s.id === po.supplierId)?.name as string) || 'Unknown'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-neutral-400 uppercase font-bold">Tanggal</p>
                  <p className="text-sm text-neutral-900">
                    {new Date(po.orderDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-neutral-50">
                <div>
                  <p className="text-[10px] text-neutral-400 uppercase font-bold">Total</p>
                  <p className="font-bold text-primary">{formatCurrency(po.totalAmount)}</p>
                </div>
                <Button variant="outline" size="sm" className="h-9 rounded-xl gap-2" onClick={() => viewDetail(po)}>
                  <Eye size={16} />
                  <span>Detail</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredPO.length === 0 && (
          <div className="h-32 flex items-center justify-center text-neutral-400 bg-white rounded-2xl border border-neutral-200">
            Tidak ada data Purchase Order
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Detail Purchase Order</DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-1">
                  <p className="text-xs text-neutral-400 uppercase font-bold tracking-wider">Nomor PO</p>
                  <p className="font-bold text-neutral-900">{selectedPO.poNumber as string}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-xs text-neutral-400 uppercase font-bold tracking-wider">Status</p>
                  <p className="font-medium text-neutral-900">{selectedPO.status}</p>
                </div>
              </div>

              <div className="border border-neutral-100 rounded-2xl overflow-hidden">
                <Table>
                  <TableHeader className="bg-neutral-50">
                    <TableRow>
                      <TableHead>Produk</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Harga Beli</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {poItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.buyPrice)}</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(item.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between text-lg font-bold text-neutral-900 pt-4 border-t border-neutral-100">
                <span>Total Pesanan</span>
                <span className="text-primary">{formatCurrency(selectedPO.totalAmount)}</span>
              </div>

              {selectedPO.status === 'PENDING' && (
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-start gap-3">
                  <Truck className="text-amber-600 shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm font-bold text-amber-900">Konfirmasi Penerimaan Barang</p>
                    <p className="text-xs text-amber-700">Pastikan jumlah dan kondisi barang sudah sesuai sebelum memproses masuk ke stok.</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setIsDetailOpen(false)}>Tutup</Button>
            {selectedPO?.status === 'PENDING' && (
              <Button className="rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => receivePO(selectedPO)}>
                <CheckCircle size={18} />
                Terima Barang & Update Stok
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
