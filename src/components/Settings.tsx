import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Tag, Ruler, Truck, Users, Edit,
  Store, Save, Bell
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc,
  serverTimestamp, getDoc, updateDoc, setDoc
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const categorySchema = z.object({ name: z.string().min(1, 'Nama kategori wajib diisi'), description: z.string().optional() });
const unitSchema = z.object({ name: z.string().min(1, 'Nama satuan wajib diisi'), abbreviation: z.string().min(1, 'Singkatan wajib diisi') });
const supplierSchema = z.object({ name: z.string().min(1, 'Nama supplier wajib diisi'), contact: z.string().optional(), phone: z.string().optional() });

export default function Settings() {
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [editingItem, setEditingItem] = useState<{ type: 'category' | 'unit' | 'supplier', id: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ col: string, id: string } | null>(null);

  // Store info state
  const [storeInfo, setStoreInfo] = useState({ name: 'GudangPOS', address: '', phone: '', footer: 'Terima kasih atas kunjungan Anda' });
  const [savingStore, setSavingStore] = useState(false);

  const catForm = useForm({ resolver: zodResolver(categorySchema), defaultValues: { name: '', description: '' } });
  const unitForm = useForm({ resolver: zodResolver(unitSchema), defaultValues: { name: '', abbreviation: '' } });
  const supForm = useForm({ resolver: zodResolver(supplierSchema), defaultValues: { name: '', contact: '', phone: '' } });

  useEffect(() => {
    const fetchInit = async () => {
      if (auth.currentUser) {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        setCurrentUserRole(snap.data()?.role || '');
      }
      // Load store info
      const storeSnap = await getDoc(doc(db, 'settings', 'store'));
      if (storeSnap.exists()) setStoreInfo(prev => ({ ...prev, ...storeSnap.data() }));
    };
    fetchInit();

    const unsubCat = onSnapshot(collection(db, 'categories'), s => setCategories(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubUnit = onSnapshot(collection(db, 'units'), s => setUnits(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubSup = onSnapshot(collection(db, 'suppliers'), s => setSuppliers(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubUsers = onSnapshot(collection(db, 'users'), s => setUsers(s.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => { unsubCat(); unsubUnit(); unsubSup(); unsubUsers(); };
  }, []);

  const saveStoreInfo = async () => {
    setSavingStore(true);
    try {
      await setDoc(doc(db, 'settings', 'store'), { ...storeInfo, updatedAt: serverTimestamp() });
      toast.success('Informasi toko disimpan');
    } catch { toast.error('Gagal menyimpan'); }
    finally { setSavingStore(false); }
  };

  const addCategory = async (data: any) => {
    try {
      if (editingItem?.type === 'category') {
        await updateDoc(doc(db, 'categories', editingItem.id), data);
        setEditingItem(null); toast.success('Kategori diperbarui');
      } else {
        await addDoc(collection(db, 'categories'), { ...data, createdAt: serverTimestamp() });
        toast.success('Kategori ditambahkan');
      }
      catForm.reset();
    } catch { toast.error('Gagal menyimpan kategori'); }
  };

  const addUnit = async (data: any) => {
    try {
      if (editingItem?.type === 'unit') {
        await updateDoc(doc(db, 'units', editingItem.id), data);
        setEditingItem(null); toast.success('Satuan diperbarui');
      } else {
        await addDoc(collection(db, 'units'), data);
        toast.success('Satuan ditambahkan');
      }
      unitForm.reset();
    } catch { toast.error('Gagal menyimpan satuan'); }
  };

  const addSupplier = async (data: any) => {
    try {
      if (editingItem?.type === 'supplier') {
        await updateDoc(doc(db, 'suppliers', editingItem.id), data);
        setEditingItem(null); toast.success('Supplier diperbarui');
      } else {
        await addDoc(collection(db, 'suppliers'), { ...data, createdAt: serverTimestamp() });
        toast.success('Supplier ditambahkan');
      }
      supForm.reset();
    } catch { toast.error('Gagal menyimpan supplier'); }
  };

  const toggleUserStatus = async (userId: string, cur: boolean) => {
    await updateDoc(doc(db, 'users', userId), { isActive: !cur });
    toast.success('Status user diperbarui');
  };

  const changeUserRole = async (userId: string, role: string) => {
    await updateDoc(doc(db, 'users', userId), { role });
    toast.success('Role user diperbarui');
  };

  const deleteItem = async () => {
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, confirmDelete.col, confirmDelete.id));
      toast.success('Item dihapus'); setConfirmDelete(null);
    } catch { toast.error('Gagal menghapus item'); }
  };

  // Reusable form card
  const FormCard = ({ title, form, onSubmit, editType, children }: any) => (
    <Card className="border-neutral-200 shadow-sm h-fit">
      <CardHeader className="pb-3"><CardTitle className="text-base">{editingItem?.type === editType ? `Edit ${title}` : `Tambah ${title}`}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          {children}
          <div className="flex gap-2 pt-1">
            {editingItem?.type === editType && (
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setEditingItem(null); form.reset(); }}>Batal</Button>
            )}
            <Button type="submit" className="flex-1">{editingItem?.type === editType ? 'Update' : 'Simpan'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );

  const ActionBtns = ({ type, item, col, onEdit }: any) => (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-400 hover:text-primary" onClick={onEdit}><Edit size={14} /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-400 hover:text-red-500" onClick={() => setConfirmDelete({ col, id: item.id })}><Trash2 size={14} /></Button>
    </div>
  );

  return (
    <div className="space-y-4 pb-10">
      <Tabs defaultValue="store" className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="bg-white border border-neutral-200 p-1 rounded-xl mb-4 h-auto min-w-max">
            <TabsTrigger value="store" className="rounded-lg px-3 sm:px-5 gap-1.5 text-sm">
              <Store size={15} /> <span>Toko</span>
            </TabsTrigger>
            <TabsTrigger value="categories" className="rounded-lg px-3 sm:px-5 gap-1.5 text-sm">
              <Tag size={15} /> <span className="hidden sm:inline">Kategori</span><span className="sm:hidden">Kat.</span>
            </TabsTrigger>
            <TabsTrigger value="units" className="rounded-lg px-3 sm:px-5 gap-1.5 text-sm">
              <Ruler size={15} /> <span className="hidden sm:inline">Satuan</span><span className="sm:hidden">Sat.</span>
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="rounded-lg px-3 sm:px-5 gap-1.5 text-sm">
              <Truck size={15} /> <span className="hidden sm:inline">Supplier</span><span className="sm:hidden">Sup.</span>
            </TabsTrigger>
            {currentUserRole === 'admin' && (
              <TabsTrigger value="users" className="rounded-lg px-3 sm:px-5 gap-1.5 text-sm">
                <Users size={15} /> <span className="hidden sm:inline">User</span><span className="sm:hidden">User</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* ===== STORE INFO TAB ===== */}
        <TabsContent value="store">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-neutral-200 shadow-sm">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store size={18} /> Informasi Toko</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nama Toko</Label>
                  <Input value={storeInfo.name} onChange={e => setStoreInfo(p => ({ ...p, name: e.target.value }))} placeholder="GudangPOS" />
                </div>
                <div className="space-y-1.5">
                  <Label>Alamat</Label>
                  <Input value={storeInfo.address} onChange={e => setStoreInfo(p => ({ ...p, address: e.target.value }))} placeholder="Jl. Contoh No. 123, Kota" />
                </div>
                <div className="space-y-1.5">
                  <Label>No. Telepon</Label>
                  <Input value={storeInfo.phone} onChange={e => setStoreInfo(p => ({ ...p, phone: e.target.value }))} placeholder="0812-3456-7890" />
                </div>
                <div className="space-y-1.5">
                  <Label>Pesan Footer Struk</Label>
                  <Input value={storeInfo.footer} onChange={e => setStoreInfo(p => ({ ...p, footer: e.target.value }))} placeholder="Terima kasih..." />
                </div>
                <Button onClick={saveStoreInfo} disabled={savingStore} className="w-full gap-2">
                  <Save size={16} />{savingStore ? 'Menyimpan...' : 'Simpan Informasi Toko'}
                </Button>
              </CardContent>
            </Card>
            {/* Preview struk */}
            <Card className="border-neutral-200 shadow-sm">
              <CardHeader><CardTitle className="text-base">Preview Struk</CardTitle></CardHeader>
              <CardContent>
                <div className="bg-white border-2 border-dashed border-neutral-200 rounded-xl p-4 font-mono text-xs max-w-[260px] mx-auto">
                  <div className="text-center font-bold text-sm border-b border-dashed pb-2 mb-2">{storeInfo.name || 'Nama Toko'}</div>
                  {storeInfo.address && <div className="text-center text-[10px] text-neutral-500">{storeInfo.address}</div>}
                  {storeInfo.phone && <div className="text-center text-[10px] text-neutral-500">Telp: {storeInfo.phone}</div>}
                  <div className="border-t border-dashed my-2"></div>
                  <div className="flex justify-between text-[10px]"><span>Invoice</span><span>INV-001</span></div>
                  <div className="flex justify-between text-[10px]"><span>Tanggal</span><span>{new Date().toLocaleDateString('id-ID')}</span></div>
                  <div className="border-t border-dashed my-2"></div>
                  <div className="text-[10px]">
                    <div className="flex justify-between font-bold mb-1"><span>Produk</span><span>Total</span></div>
                    <div><div>Contoh Produk A</div><div className="flex justify-between text-neutral-400"><span>2 x Rp 10.000</span><span>Rp 20.000</span></div></div>
                  </div>
                  <div className="border-t border-dashed my-2"></div>
                  <div className="flex justify-between font-bold text-[11px]"><span>TOTAL</span><span>Rp 20.000</span></div>
                  <div className="border-t border-dashed my-2 text-center text-[10px] text-neutral-500">{storeInfo.footer || '---'}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== CATEGORIES TAB ===== */}
        <TabsContent value="categories">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <FormCard title="Kategori" form={catForm} onSubmit={addCategory} editType="category">
              <div className="space-y-1.5">
                <Label>Nama Kategori</Label>
                <Input {...catForm.register('name')} />
                {catForm.formState.errors.name && <p className="text-xs text-red-500">{catForm.formState.errors.name.message as string}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Deskripsi</Label>
                <Input {...catForm.register('description')} />
              </div>
            </FormCard>
            <Card className="lg:col-span-2 border-neutral-200 shadow-sm overflow-hidden">
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader className="bg-neutral-50"><TableRow>
                    <TableHead>Nama</TableHead><TableHead>Deskripsi</TableHead><TableHead className="text-right">Aksi</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {categories.map(cat => (
                      <TableRow key={cat.id}>
                        <TableCell className="font-medium">{cat.name}</TableCell>
                        <TableCell className="text-neutral-500 text-sm">{cat.description}</TableCell>
                        <TableCell><ActionBtns type="category" item={cat} col="categories" onEdit={() => { setEditingItem({ type: 'category', id: cat.id }); catForm.reset({ name: cat.name, description: cat.description || '' }); }} /></TableCell>
                      </TableRow>
                    ))}
                    {categories.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-neutral-400 h-20">Belum ada kategori</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile list */}
              <div className="md:hidden divide-y divide-neutral-100">
                {categories.map(cat => (
                  <div key={cat.id} className="p-3 flex items-center justify-between">
                    <div><p className="font-semibold text-sm text-neutral-900">{cat.name}</p><p className="text-xs text-neutral-500">{cat.description}</p></div>
                    <ActionBtns type="category" item={cat} col="categories" onEdit={() => { setEditingItem({ type: 'category', id: cat.id }); catForm.reset({ name: cat.name, description: cat.description || '' }); }} />
                  </div>
                ))}
                {categories.length === 0 && <div className="p-6 text-center text-neutral-400 text-sm">Belum ada kategori</div>}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ===== UNITS TAB ===== */}
        <TabsContent value="units">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <FormCard title="Satuan" form={unitForm} onSubmit={addUnit} editType="unit">
              <div className="space-y-1.5">
                <Label>Nama Satuan</Label>
                <Input placeholder="Kilogram" {...unitForm.register('name')} />
                {unitForm.formState.errors.name && <p className="text-xs text-red-500">{unitForm.formState.errors.name.message as string}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Singkatan</Label>
                <Input placeholder="kg" {...unitForm.register('abbreviation')} />
                {unitForm.formState.errors.abbreviation && <p className="text-xs text-red-500">{unitForm.formState.errors.abbreviation.message as string}</p>}
              </div>
            </FormCard>
            <Card className="lg:col-span-2 border-neutral-200 shadow-sm overflow-hidden">
              <div className="hidden md:block">
                <Table>
                  <TableHeader className="bg-neutral-50"><TableRow>
                    <TableHead>Nama</TableHead><TableHead>Singkatan</TableHead><TableHead className="text-right">Aksi</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {units.map(unit => (
                      <TableRow key={unit.id}>
                        <TableCell className="font-medium">{unit.name}</TableCell>
                        <TableCell><Badge variant="outline">{unit.abbreviation}</Badge></TableCell>
                        <TableCell><ActionBtns type="unit" item={unit} col="units" onEdit={() => { setEditingItem({ type: 'unit', id: unit.id }); unitForm.reset({ name: unit.name, abbreviation: unit.abbreviation }); }} /></TableCell>
                      </TableRow>
                    ))}
                    {units.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-neutral-400 h-20">Belum ada satuan</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden divide-y divide-neutral-100">
                {units.map(unit => (
                  <div key={unit.id} className="p-3 flex items-center justify-between">
                    <div><p className="font-semibold text-sm">{unit.name}</p><Badge variant="outline" className="text-[10px]">{unit.abbreviation}</Badge></div>
                    <ActionBtns type="unit" item={unit} col="units" onEdit={() => { setEditingItem({ type: 'unit', id: unit.id }); unitForm.reset({ name: unit.name, abbreviation: unit.abbreviation }); }} />
                  </div>
                ))}
                {units.length === 0 && <div className="p-6 text-center text-neutral-400 text-sm">Belum ada satuan</div>}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ===== SUPPLIERS TAB ===== */}
        <TabsContent value="suppliers">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <FormCard title="Supplier" form={supForm} onSubmit={addSupplier} editType="supplier">
              <div className="space-y-1.5">
                <Label>Nama Supplier</Label>
                <Input {...supForm.register('name')} />
                {supForm.formState.errors.name && <p className="text-xs text-red-500">{supForm.formState.errors.name.message as string}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Kontak Person</Label>
                <Input {...supForm.register('contact')} />
              </div>
              <div className="space-y-1.5">
                <Label>No. Telepon</Label>
                <Input {...supForm.register('phone')} />
              </div>
            </FormCard>
            <Card className="lg:col-span-2 border-neutral-200 shadow-sm overflow-hidden">
              <div className="hidden md:block">
                <Table>
                  <TableHeader className="bg-neutral-50"><TableRow>
                    <TableHead>Nama</TableHead><TableHead>Kontak</TableHead><TableHead>Telepon</TableHead><TableHead className="text-right">Aksi</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {suppliers.map(sup => (
                      <TableRow key={sup.id}>
                        <TableCell className="font-medium">{sup.name}</TableCell>
                        <TableCell className="text-sm text-neutral-500">{sup.contact}</TableCell>
                        <TableCell className="text-sm text-neutral-500">{sup.phone}</TableCell>
                        <TableCell><ActionBtns type="supplier" item={sup} col="suppliers" onEdit={() => { setEditingItem({ type: 'supplier', id: sup.id }); supForm.reset({ name: sup.name, contact: sup.contact || '', phone: sup.phone || '' }); }} /></TableCell>
                      </TableRow>
                    ))}
                    {suppliers.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-neutral-400 h-20">Belum ada supplier</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden divide-y divide-neutral-100">
                {suppliers.map(sup => (
                  <div key={sup.id} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{sup.name}</p>
                      <p className="text-xs text-neutral-500">{[sup.contact, sup.phone].filter(Boolean).join(' • ')}</p>
                    </div>
                    <ActionBtns type="supplier" item={sup} col="suppliers" onEdit={() => { setEditingItem({ type: 'supplier', id: sup.id }); supForm.reset({ name: sup.name, contact: sup.contact || '', phone: sup.phone || '' }); }} />
                  </div>
                ))}
                {suppliers.length === 0 && <div className="p-6 text-center text-neutral-400 text-sm">Belum ada supplier</div>}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ===== USERS TAB ===== */}
        {currentUserRole === 'admin' && (
          <TabsContent value="users">
            <Card className="border-neutral-200 shadow-sm overflow-hidden">
              <CardHeader className="pb-3 border-b border-neutral-100">
                <CardTitle className="text-base flex items-center gap-2"><Users size={18} /> Manajemen User</CardTitle>
                <p className="text-xs text-neutral-500 mt-1">User baru bisa login via Google. Role dan status dapat dikelola di sini.</p>
              </CardHeader>
              {/* Desktop */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader className="bg-neutral-50">
                    <TableRow>
                      <TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.fullName}</TableCell>
                        <TableCell className="text-sm text-neutral-500">{u.email}</TableCell>
                        <TableCell>
                          <Select value={u.role} onValueChange={val => changeUserRole(u.id, val)}>
                            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="kasir">Kasir</SelectItem>
                              <SelectItem value="gudang">Gudang</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge className={u.isActive ? 'bg-emerald-100 text-emerald-700 border-none' : 'bg-red-100 text-red-700 border-none'}>
                            {u.isActive ? 'Aktif' : 'Non-aktif'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className={`text-xs h-7 ${u.isActive ? 'text-red-500 hover:text-red-600 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                            onClick={() => toggleUserStatus(u.id, u.isActive)}>
                            {u.isActive ? 'Non-aktifkan' : 'Aktifkan'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-neutral-400 h-20">Belum ada user</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile */}
              <div className="md:hidden divide-y divide-neutral-100">
                {users.map(u => (
                  <div key={u.id} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm">{u.fullName}</p>
                        <p className="text-xs text-neutral-500">{u.email}</p>
                      </div>
                      <Badge className={u.isActive ? 'bg-emerald-100 text-emerald-700 border-none text-[10px]' : 'bg-red-100 text-red-700 border-none text-[10px]'}>
                        {u.isActive ? 'Aktif' : 'Non-aktif'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={u.role} onValueChange={val => changeUserRole(u.id, val)}>
                        <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="kasir">Kasir</SelectItem>
                          <SelectItem value="gudang">Gudang</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" className={`text-xs h-8 ${u.isActive ? 'text-red-500 border-red-200' : 'text-emerald-500 border-emerald-200'}`}
                        onClick={() => toggleUserStatus(u.id, u.isActive)}>
                        {u.isActive ? 'Non-aktifkan' : 'Aktifkan'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Delete Confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={open => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-[360px] rounded-2xl">
          <DialogHeader><DialogTitle>Konfirmasi Hapus</DialogTitle></DialogHeader>
          <p className="text-sm text-neutral-500 py-3">Item ini akan dihapus permanen. Lanjutkan?</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="destructive" onClick={deleteItem}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
