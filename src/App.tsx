import React, { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import POS from './components/POS';
import SalesHistory from './components/SalesHistory';
import Settings from './components/Settings';
import PurchaseOrder from './components/PurchaseOrder';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard setActiveTab={setActiveTab} />;
      case 'inventory': return <Inventory />;
      case 'pos': return <POS />;
      case 'sales': return <SalesHistory />;
      case 'purchase_orders': return <PurchaseOrder />;
      case 'settings': return <Settings />;
      default: return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </Layout>
  );
}
