import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  History,
  Settings,
  Menu,
  X,
  LogOut,
  User as UserIcon,
  FileText,
  ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Toaster, toast } from 'sonner';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'kasir', 'gudang'] },
  { id: 'inventory', label: 'Inventory', icon: Package, roles: ['admin', 'gudang', 'kasir'] },
  { id: 'pos', label: 'Kasir (POS)', icon: ShoppingCart, roles: ['admin', 'kasir'] },
  { id: 'sales', label: 'Riwayat Penjualan', icon: History, roles: ['admin', 'kasir'] },
  { id: 'purchase_orders', label: 'Purchase Order', icon: FileText, roles: ['admin', 'gudang'] },
  { id: 'settings', label: 'Pengaturan', icon: Settings, roles: ['admin', 'gudang', 'kasir'] },
];

export default function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('kasir');
  const [loading, setLoading] = useState(true);

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1280) {
        setIsSidebarCollapsed(true);
      } else {
        setIsSidebarCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const newUser = {
            fullName: currentUser.displayName || 'User',
            username: currentUser.email?.split('@')[0] || 'user',
            email: currentUser.email || '',
            role: 'admin',
            isActive: true,
            createdAt: serverTimestamp()
          };
          await setDoc(userRef, newUser);
          setUserRole('admin');
        } else {
          setUserRole(userSnap.data().role || 'kasir');
        }
        setUser(currentUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
      toast.success('Berhasil masuk');
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        toast.error('Login dibatalkan.');
      } else if (error.code !== 'auth/cancelled-popup-request') {
        toast.error('Gagal masuk: ' + (error.message || 'Terjadi kesalahan'));
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-neutral-500 text-sm">Memuat aplikasi...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full bg-white p-8 rounded-3xl shadow-xl border border-neutral-200 text-center"
        >
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Package className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-1">GudangPOS</h1>
          <p className="text-neutral-500 text-sm mb-8">Sistem Manajemen Gudang & Kasir</p>
          <Button onClick={handleLogin} className="w-full py-5 text-base rounded-2xl mb-4">
            Masuk dengan Google
          </Button>
          <p className="text-[10px] text-neutral-400">
            Jika popup tidak muncul, pastikan browser tidak memblokir popup.
          </p>
        </motion.div>
      </div>
    );
  }

  const filteredNavItems = navItems.filter(item => item.roles.includes(userRole));

  return (
    <div className="flex h-screen bg-neutral-50 overflow-hidden font-sans">
      <Toaster position="top-right" richColors />

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`
          bg-white border-r border-neutral-200 flex flex-col z-50 no-print transition-all duration-300 ease-in-out
          fixed lg:relative h-full
          ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
          ${!isMobileMenuOpen && !isSidebarCollapsed ? 'lg:w-64' : ''}
          ${!isMobileMenuOpen && isSidebarCollapsed ? 'lg:w-[72px]' : ''}
        `}
      >
        {/* Logo area */}
        <div className={`h-16 flex items-center border-b border-neutral-100 shrink-0 ${isSidebarCollapsed && !isMobileMenuOpen ? 'justify-center px-3' : 'px-4 justify-between'}`}>
          {(!isSidebarCollapsed || isMobileMenuOpen) ? (
            <>
              <div className="flex items-center gap-2 font-bold text-lg text-primary">
                <Package className="w-6 h-6 shrink-0" />
                <span>GudangPOS</span>
              </div>
              <button
                onClick={() => isMobileMenuOpen ? setIsMobileMenuOpen(false) : setIsSidebarCollapsed(true)}
                className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-400 lg:flex hidden"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-400 lg:hidden"
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsSidebarCollapsed(false)}
              className="p-1.5 hover:bg-neutral-100 rounded-lg text-primary"
            >
              <Package size={22} />
            </button>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const isActive = activeTab === item.id;
            const showLabel = !isSidebarCollapsed || isMobileMenuOpen;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                title={!showLabel ? item.label : undefined}
                className={`w-full flex items-center rounded-xl transition-all duration-150 ${
                  showLabel ? 'gap-3 px-3 py-2.5' : 'justify-center p-2.5'
                } ${
                  isActive
                    ? 'bg-primary text-white shadow-md shadow-primary/25'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'
                }`}
              >
                <item.icon size={20} className="shrink-0" />
                {showLabel && <span className="font-medium text-sm">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-2 border-t border-neutral-100 shrink-0">
          {(!isSidebarCollapsed || isMobileMenuOpen) ? (
            <div className="flex items-center gap-3 px-2 py-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center overflow-hidden shrink-0">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={16} className="text-neutral-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">{user.displayName}</p>
                <p className="text-[10px] text-neutral-400 truncate capitalize">{userRole}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-1 mb-1">
              <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center overflow-hidden">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={16} className="text-neutral-500" />
                )}
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={isSidebarCollapsed && !isMobileMenuOpen ? 'Keluar' : undefined}
            className={`w-full flex items-center rounded-xl text-red-500 hover:bg-red-50 transition-all py-2 ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'gap-3 px-3' : 'justify-center'}`}
          >
            <LogOut size={18} className="shrink-0" />
            {(!isSidebarCollapsed || isMobileMenuOpen) && <span className="font-medium text-sm">Keluar</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-4 sm:px-6 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 hover:bg-neutral-100 rounded-lg lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div>
              <h2 className="text-base font-bold text-neutral-900 leading-tight">
                {navItems.find(i => i.id === activeTab)?.label}
              </h2>
            </div>
          </div>
          <div className="text-xs text-neutral-400 hidden sm:block">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </header>

        {/* Page content */}
        <div className={`flex-1 overflow-y-auto p-4 sm:p-6 ${activeTab === 'pos' ? 'overflow-hidden flex flex-col' : ''}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className={activeTab === 'pos' ? 'h-full flex flex-col' : ''}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
