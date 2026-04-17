import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Package, 
  ArrowDownCircle, 
  ArrowUpCircle,
  Edit,
  Trash2,
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, setDoc, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { processRestock } from '../services/stockService';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Fuse from 'fuse.js';

const productSchema = z.object({
  name: z.string().min(1, 'Nama produk wajib diisi'),
  sku: z.string().min(1, 'SKU wajib diisi'),
  barcode: z.string().optional(),
  sellingPrice: z.number().positive('Harga jual harus lebih dari 0'),
  minimumStock: z.number().nonnegative('Stok minimum tidak boleh negatif'),
  imageUrl: z.string().optional(),
  categoryId: z.string().min(1, 'Pilih kategori produk'),
  unitId: z.string().min(1, 'Pilih satuan produk'),
  supplierId: z.string().optional()
});

const restockSchema = z.object({
  quantity: z.number().positive('Jumlah harus positif'),
  buyPrice: z.number().positive('Harga beli harus positif'),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  warehouseLocation: z.string().optional(),
  notes: z.string().optional()
});

type ProductFormValues = z.infer<typeof productSchema>;
type RestockFormValues = z.infer<typeof restockSchema>;

export default function Inventory() {
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<Record<string, any>>({});
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [notifiedLowStock, setNotifiedLowStock] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' | null }>({ key: 'name', direction: 'asc' });

  const productForm = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { 
      name: '', 
      sku: '', 
      barcode: '', 
      sellingPrice: 0, 
      minimumStock: 10, 
      imageUrl: '',
      categoryId: '',
      unitId: '',
      supplierId: ''
    }
  });

  const restockForm = useForm<RestockFormValues>({
    resolver: zodResolver(restockSchema),
    defaultValues: { quantity: 0, buyPrice: 0, batchNumber: '', expiryDate: '', warehouseLocation: '', notes: '' }
  });

  useEffect(() => {
    const unsubProducts = onSnapshot(query(collection(db, 'products'), orderBy('createdAt', 'desc')), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      const invMap: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        invMap[doc.id] = doc.data();
      });
      setInventory(invMap);
    });

    const unsubCat = onSnapshot(collection(db, 'categories'), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubUnit = onSnapshot(collection(db, 'units'), (snapshot) => {
      setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubSup = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubProducts();
      unsubInventory();
      unsubCat();
      unsubUnit();
      unsubSup();
    };
  }, []);

  // Low stock notification logic
  useEffect(() => {
    products.forEach(product => {
      const inv = inventory[product.id];
      if (!inv) return;

      const isOut = inv.stockQuantity === 0;
      const isLow = inv.stockQuantity <= inv.minimumStock;

      if (isOut) {
        if (!notifiedLowStock.has(`${product.id}_out`)) {
          toast.error(`KRITIS: Stok Habis!`, {
            description: `${product.name} sudah tidak memiliki stok. Segera restock!`,
            duration: 10000,
          });
          setNotifiedLowStock(prev => new Set(prev).add(`${product.id}_out`));
        }
      } else if (isLow) {
        if (!notifiedLowStock.has(product.id)) {
          toast.warning(`Stok Menipis: ${product.name}`, {
            description: `Sisa stok tinggal ${inv.stockQuantity} ${product.unitId || 'pcs'}`,
            duration: 5000,
          });
          setNotifiedLowStock(prev => new Set(prev).add(product.id));
        }
      }
    });
  }, [inventory, products]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) { // 500KB limit for base64 in firestore
        toast.error('File terlalu besar', { description: 'Maksimal ukuran file adalah 500KB' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        productForm.setValue('imageUrl', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProduct = async (data: ProductFormValues) => {
    try {
      // Check SKU uniqueness
      if (!selectedProduct || selectedProduct.sku !== data.sku) {
        const q = query(collection(db, 'products'), where('sku', '==', data.sku));
        const snap = await getDocs(q);
        if (!snap.empty) {
          toast.error('SKU sudah digunakan', { description: 'Gunakan SKU lain untuk produk ini.' });
          return;
        }
      }

      const productRef = selectedProduct ? doc(db, 'products', selectedProduct.id) : doc(collection(db, 'products'));
      const productData = {
        ...data,
        isActive: true,
        updatedAt: serverTimestamp(),
        createdAt: selectedProduct ? selectedProduct.createdAt : serverTimestamp()
      };
      
      await setDoc(productRef, productData);
      
      // Initialize inventory if new
      if (!selectedProduct) {
        await setDoc(doc(db, 'inventory', productRef.id), {
          productId: productRef.id,
          stockQuantity: 0,
          minimumStock: Number(data.minimumStock),
          lastBuyPrice: 0,
          updatedAt: serverTimestamp()
        });
      }

      toast.success(selectedProduct ? 'Produk diperbarui' : 'Produk ditambahkan');
      setIsProductModalOpen(false);
      resetProductForm();
    } catch (error) {
      toast.error('Gagal menyimpan produk');
    }
  };

  const handleRestock = async (data: RestockFormValues) => {
    if (!selectedProduct) return;
    try {
      await processRestock({
        productId: selectedProduct.id,
        ...data
      });
      toast.success('Stok berhasil ditambahkan');
      setIsRestockModalOpen(false);
      restockForm.reset();
    } catch (error) {
      toast.error('Gagal memproses restock');
    }
  };

  const resetProductForm = () => {
    productForm.reset({ 
      name: '', 
      sku: '', 
      barcode: '', 
      sellingPrice: 0, 
      minimumStock: 10, 
      imageUrl: '',
      categoryId: '',
      unitId: '',
      supplierId: ''
    });
    setSelectedProduct(null);
  };

  const handleDeleteProduct = async () => {
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, 'products', confirmDelete));
      await deleteDoc(doc(db, 'inventory', confirmDelete));
      toast.success('Produk dihapus');
      setConfirmDelete(null);
    } catch (error) {
      toast.error('Gagal menghapus produk');
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={14} className="ml-1 opacity-50" />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={14} className="ml-1 text-primary" /> : <ArrowDown size={14} className="ml-1 text-primary" />;
  };

  const filteredProducts = React.useMemo(() => {
    let result = [...products];

    // 1. Fuzzy Search
    if (searchTerm) {
      const fuse = new Fuse(products, {
        keys: ['name', 'sku', 'barcode'],
        threshold: 0.3,
        distance: 100
      });
      result = fuse.search(searchTerm).map(r => r.item);
    }

    // 2. Tab Filter
    result = result.filter(p => {
      const inv = inventory[p.id] || { stockQuantity: 0, minimumStock: 10 };
      if (activeTab === 'low') return inv.stockQuantity <= inv.minimumStock && inv.stockQuantity > 0;
      if (activeTab === 'out') return inv.stockQuantity === 0;
      return true;
    });

    // 3. Sorting
    if (sortConfig.key && sortConfig.direction) {
      result.sort((a, b) => {
        let aVal: any, bVal: any;
        
        if (sortConfig.key === 'stock') {
          aVal = inventory[a.id]?.stockQuantity || 0;
          bVal = inventory[b.id]?.stockQuantity || 0;
        } else {
          aVal = a[sortConfig.key];
          bVal = b[sortConfig.key];
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [products, searchTerm, inventory, activeTab, sortConfig]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
          <Input 
            placeholder="Cari produk, SKU, atau barcode..." 
            className="pl-10 h-11 rounded-xl border-neutral-200 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <Dialog open={isProductModalOpen} onOpenChange={(open) => {
            setIsProductModalOpen(open);
            if (!open) resetProductForm();
          }}>
            <DialogTrigger>
              <Button className="h-11 rounded-xl gap-2 px-6 flex-1 lg:flex-none">
                <Plus size={18} />
                <span>Tambah Produk</span>
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] rounded-2xl">
            <DialogHeader>
              <DialogTitle>{selectedProduct ? 'Edit Produk' : 'Tambah Produk Baru'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={productForm.handleSubmit(handleSaveProduct)} className="grid gap-4 py-4">
              <div className="flex flex-col items-center gap-4 mb-2">
                <div className="w-32 h-32 rounded-2xl bg-neutral-100 border-2 border-dashed border-neutral-200 flex items-center justify-center overflow-hidden relative group">
                  {productForm.watch('imageUrl') ? (
                    <>
                      <img src={productForm.watch('imageUrl')} alt="Preview" className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => productForm.setValue('imageUrl', '')}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                      >
                        <Trash2 size={20} />
                      </button>
                    </>
                  ) : (
                    <div className="text-center p-4">
                      <Package size={24} className="mx-auto text-neutral-300 mb-1" />
                      <p className="text-[10px] text-neutral-400 font-medium">Upload Foto</p>
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    onChange={handleImageUpload}
                  />
                </div>
                <p className="text-[10px] text-neutral-400 text-center">Format: JPG, PNG. Maks 500KB.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Nama Produk</Label>
                <Input id="name" {...productForm.register('name')} />
                {productForm.formState.errors.name && <p className="text-xs text-red-500">{productForm.formState.errors.name.message}</p>}
              </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input id="sku" {...productForm.register('sku')} />
                    {productForm.formState.errors.sku && <p className="text-xs text-red-500">{productForm.formState.errors.sku.message}</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="barcode">Barcode</Label>
                    <Input id="barcode" {...productForm.register('barcode')} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="price">Harga Jual</Label>
                    <Input id="price" type="number" {...productForm.register('sellingPrice', { valueAsNumber: true })} />
                    {productForm.formState.errors.sellingPrice && <p className="text-xs text-red-500">{productForm.formState.errors.sellingPrice.message}</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="minStock">Stok Minimum</Label>
                    <Input id="minStock" type="number" {...productForm.register('minimumStock', { valueAsNumber: true })} />
                    {productForm.formState.errors.minimumStock && <p className="text-xs text-red-500">{productForm.formState.errors.minimumStock.message}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label>Kategori</Label>
                    <Select 
                      value={productForm.watch('categoryId')} 
                      onValueChange={(val) => productForm.setValue('categoryId', val)}
                    >
                      <SelectTrigger className={productForm.formState.errors.categoryId ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Pilih Kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {productForm.formState.errors.categoryId && <p className="text-xs text-red-500">{productForm.formState.errors.categoryId.message}</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label>Satuan</Label>
                    <Select 
                      value={productForm.watch('unitId')} 
                      onValueChange={(val) => productForm.setValue('unitId', val)}
                    >
                      <SelectTrigger className={productForm.formState.errors.unitId ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Pilih Satuan" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map(unit => (
                          <SelectItem key={unit.id} value={unit.id}>{unit.abbreviation}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {productForm.formState.errors.unitId && <p className="text-xs text-red-500">{productForm.formState.errors.unitId.message}</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label>Supplier</Label>
                    <Select 
                      value={productForm.watch('supplierId')} 
                      onValueChange={(val) => productForm.setValue('supplierId', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map(sup => (
                          <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsProductModalOpen(false)}>Batal</Button>
                <Button type="submit">Simpan Produk</Button>
              </DialogFooter>
            </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white border border-neutral-200 p-1 rounded-xl mb-6 flex-wrap h-auto">
          <TabsTrigger value="all" className="rounded-lg px-4 sm:px-6 flex-1 sm:flex-none">Semua Produk</TabsTrigger>
          <TabsTrigger value="low" className="rounded-lg px-4 sm:px-6 flex-1 sm:flex-none">Stok Menipis</TabsTrigger>
          <TabsTrigger value="out" className="rounded-lg px-4 sm:px-6 flex-1 sm:flex-none">Habis</TabsTrigger>
        </TabsList>

        <Card className="border-neutral-200 shadow-sm overflow-hidden rounded-2xl hidden md:block">
          <Table>
            <TableHeader className="bg-neutral-50">
              <TableRow>
                <TableHead className="w-[300px] cursor-pointer hover:bg-neutral-100 transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center">Produk {getSortIcon('name')}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-neutral-100 transition-colors" onClick={() => handleSort('sku')}>
                  <div className="flex items-center">SKU / Barcode {getSortIcon('sku')}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-neutral-100 transition-colors" onClick={() => handleSort('sellingPrice')}>
                  <div className="flex items-center">Harga Jual {getSortIcon('sellingPrice')}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-neutral-100 transition-colors" onClick={() => handleSort('stock')}>
                  <div className="flex items-center">Stok {getSortIcon('stock')}</div>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => {
                const inv = inventory[product.id] || { stockQuantity: 0, minimumStock: 10 };
                const isLow = inv.stockQuantity <= inv.minimumStock && inv.stockQuantity > 0;
                const isOut = inv.stockQuantity === 0;

                return (
                  <TableRow key={product.id} className="hover:bg-neutral-50/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0 overflow-hidden border border-neutral-100">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package size={20} className="text-neutral-400" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-neutral-900">{product.name}</span>
                          <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold">{product.sku}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-1">
                        <p className="text-neutral-500">SKU: <span className="text-neutral-900 font-mono">{product.sku}</span></p>
                        {product.barcode && <p className="text-neutral-500">BC: <span className="text-neutral-900 font-mono">{product.barcode}</span></p>}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(product.sellingPrice)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-bold ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-neutral-900'}`}>
                            {inv.stockQuantity}
                          </span>
                          {isOut && <AlertCircle size={14} className="text-red-600 animate-pulse" />}
                          {isLow && !isOut && <AlertTriangle size={14} className="text-amber-600" />}
                        </div>
                        <span className="text-[10px] text-neutral-400">Min: {inv.minimumStock}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isOut ? (
                        <Badge variant="destructive" className="rounded-full px-3 py-1 gap-1.5 shadow-sm shadow-red-100">
                          <AlertCircle size={12} />
                          <span>Stok Habis</span>
                        </Badge>
                      ) : isLow ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 rounded-full px-3 py-1 gap-1.5 border-none shadow-sm shadow-amber-50">
                          <AlertTriangle size={12} />
                          <span>Stok Menipis</span>
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 rounded-full px-3 py-1 gap-1.5 border-none shadow-sm shadow-emerald-50">
                          <Package size={12} />
                          <span>Tersedia</span>
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg text-neutral-400 hover:text-primary"
                          onClick={() => {
                            setSelectedProduct(product);
                            setIsDetailModalOpen(true);
                          }}
                        >
                          <Eye size={14} />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 rounded-lg gap-1"
                          onClick={() => {
                            setSelectedProduct(product);
                            setIsRestockModalOpen(true);
                          }}
                        >
                          <ArrowDownCircle size={14} />
                          <span>Restock</span>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg"
                          onClick={() => {
                            setSelectedProduct(product);
                            productForm.reset({
                              name: product.name,
                              sku: product.sku,
                              barcode: product.barcode || '',
                              sellingPrice: product.sellingPrice,
                              minimumStock: inv.minimumStock,
                              imageUrl: product.imageUrl || '',
                              categoryId: product.categoryId || '',
                              unitId: product.unitId || '',
                              supplierId: product.supplierId || ''
                            });
                            setIsProductModalOpen(true);
                          }}
                        >
                          <Edit size={14} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg text-red-500"
                          onClick={() => setConfirmDelete(product.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-neutral-400">
                    Tidak ada produk ditemukan
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Mobile Card View */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {filteredProducts.map((product) => {
            const inv = inventory[product.id] || { stockQuantity: 0, minimumStock: 10 };
            const isLow = inv.stockQuantity <= inv.minimumStock && inv.stockQuantity > 0;
            const isOut = inv.stockQuantity === 0;

            return (
              <Card key={product.id} className="border-neutral-200 shadow-sm overflow-hidden rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0 overflow-hidden border border-neutral-100">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package size={24} className="text-neutral-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-neutral-900 truncate">{product.name}</h3>
                      <p className="text-xs text-neutral-500 font-mono">{product.sku}</p>
                      <div className="mt-1">
                        {isOut ? (
                          <Badge variant="destructive" className="text-[10px] px-2 py-0 h-5">Habis</Badge>
                        ) : isLow ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0 h-5">Menipis</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0 h-5">Tersedia</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 py-3 border-y border-neutral-50 mb-4">
                    <div>
                      <p className="text-[10px] text-neutral-400 uppercase font-bold">Harga Jual</p>
                      <p className="font-bold text-neutral-900">{formatCurrency(product.sellingPrice)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-400 uppercase font-bold">Stok</p>
                      <div className="flex items-center gap-1">
                        <span className={`font-bold ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-neutral-900'}`}>
                          {inv.stockQuantity}
                        </span>
                        <span className="text-[10px] text-neutral-400">/ Min: {inv.minimumStock}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setSelectedProduct(product); setIsDetailModalOpen(true); }}>
                        <Eye size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => {
                        setSelectedProduct(product);
                        productForm.reset({
                          name: product.name,
                          sku: product.sku,
                          barcode: product.barcode || '',
                          sellingPrice: product.sellingPrice,
                          minimumStock: inv.minimumStock,
                          imageUrl: product.imageUrl || '',
                          categoryId: product.categoryId || '',
                          unitId: product.unitId || '',
                          supplierId: product.supplierId || ''
                        });
                        setIsProductModalOpen(true);
                      }}>
                        <Edit size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-red-500" onClick={() => setConfirmDelete(product.id)}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => { setSelectedProduct(product); setIsRestockModalOpen(true); }}>
                      <ArrowDownCircle size={16} />
                      <span>Restock</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filteredProducts.length === 0 && (
            <div className="h-32 flex items-center justify-center text-neutral-400 bg-white rounded-2xl border border-neutral-200">
              Tidak ada produk ditemukan
            </div>
          )}
        </div>
      </Tabs>

      {/* Restock Modal */}
      <Dialog open={isRestockModalOpen} onOpenChange={setIsRestockModalOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Restock Produk</DialogTitle>
            <p className="text-sm text-neutral-500">{selectedProduct?.name}</p>
          </DialogHeader>
          <form onSubmit={restockForm.handleSubmit(handleRestock)} className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="qty">Jumlah Masuk</Label>
                <Input id="qty" type="number" {...restockForm.register('quantity', { valueAsNumber: true })} />
                {restockForm.formState.errors.quantity && <p className="text-xs text-red-500">{restockForm.formState.errors.quantity.message}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="buyPrice">Harga Beli (Satuan)</Label>
                <Input id="buyPrice" type="number" {...restockForm.register('buyPrice', { valueAsNumber: true })} />
                {restockForm.formState.errors.buyPrice && <p className="text-xs text-red-500">{restockForm.formState.errors.buyPrice.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="batch">Nomor Batch</Label>
                <Input id="batch" {...restockForm.register('batchNumber')} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expiry">Tanggal Kadaluarsa</Label>
                <Input id="expiry" type="date" {...restockForm.register('expiryDate')} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location">Lokasi Gudang</Label>
              <Input id="location" placeholder="Contoh: Rak A-01" {...restockForm.register('warehouseLocation')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRestockModalOpen(false)}>Batal</Button>
              <Button type="submit">Proses Masuk</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Detail Produk</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-6 py-4">
              <div className="flex gap-6">
                <div className="w-32 h-32 rounded-2xl bg-neutral-100 flex items-center justify-center overflow-hidden border border-neutral-200 shrink-0">
                  {selectedProduct.imageUrl ? (
                    <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package size={40} className="text-neutral-300" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="text-xl font-bold text-neutral-900">{selectedProduct.name}</h3>
                  <p className="text-sm text-neutral-500">SKU: <span className="font-mono font-medium text-neutral-900">{selectedProduct.sku}</span></p>
                  {selectedProduct.barcode && (
                    <p className="text-sm text-neutral-500">Barcode: <span className="font-mono font-medium text-neutral-900">{selectedProduct.barcode}</span></p>
                  )}
                  <div className="pt-2">
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none">
                      {inventory[selectedProduct.id]?.stockQuantity || 0} Tersedia
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-4 border-t border-neutral-100">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">Harga Jual</p>
                  <p className="font-bold text-neutral-900">{formatCurrency(selectedProduct.sellingPrice)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">Stok Minimum</p>
                  <p className="font-bold text-neutral-900">{inventory[selectedProduct.id]?.minimumStock || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">Kategori</p>
                  <p className="font-medium text-neutral-700">
                    {categories.find(c => c.id === selectedProduct.categoryId)?.name || '-'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">Satuan</p>
                  <p className="font-medium text-neutral-700">
                    {units.find(u => u.id === selectedProduct.unitId)?.name || '-'} 
                    ({units.find(u => u.id === selectedProduct.unitId)?.abbreviation || '-'})
                  </p>
                </div>
                <div className="space-y-1 col-span-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">Supplier</p>
                  <p className="font-medium text-neutral-700">
                    {suppliers.find(s => s.id === selectedProduct.supplierId)?.name || '-'}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsDetailModalOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Konfirmasi Hapus Produk</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-neutral-500">Apakah Anda yakin ingin menghapus produk ini? Semua data stok terkait juga akan dihapus.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleDeleteProduct}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
