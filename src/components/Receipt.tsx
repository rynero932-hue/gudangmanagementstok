import React from 'react';

export interface StoreInfo {
  name: string;
  address: string;
  phone: string;
  footer: string;
}

export interface ReceiptInvoice {
  invoiceNumber?: string;
  customerName: string;
  cashierName?: string;
  createdAt: any;
  paymentMethod: string;
  totalAmount: number;
  discountAmount: number;
  grandTotal: number;
  amountPaid: number;
  change: number;
  items: any[];
  storeInfo?: StoreInfo;
}

interface ReceiptProps {
  invoice: ReceiptInvoice;
}

export default function Receipt({ invoice }: ReceiptProps) {
  const fmt = (val: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  const date = invoice.createdAt?.toDate ? invoice.createdAt.toDate() : new Date();
  const store = invoice.storeInfo || {
    name: 'GudangPOS',
    address: 'Jl. Contoh No. 123',
    phone: '0812-3456-7890',
    footer: 'Terima kasih atas kunjungan Anda'
  };

  const s: Record<string, React.CSSProperties> = {
    wrap: { fontFamily: "'Courier New', Courier, monospace", fontSize: '12px', color: '#000', width: '100%', lineHeight: '1.5', padding: '4mm 2mm' },
    center: { textAlign: 'center' },
    row: { display: 'flex', justifyContent: 'space-between', width: '100%' },
    dash: { borderTop: '1px dashed #000', margin: '6px 0' },
    solid: { borderTop: '1px solid #000', margin: '6px 0' },
    bold: { fontWeight: 'bold' },
    small: { fontSize: '10px' },
  };

  return (
    <div id="printable-receipt" className="hidden" style={s.wrap}>
      {/* Header */}
      <div style={{ ...s.center, marginBottom: '8px' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>{store.name}</div>
        {store.address && <div style={s.small}>{store.address}</div>}
        {store.phone && <div style={s.small}>Telp: {store.phone}</div>}
      </div>

      <div style={s.dash} />

      {/* Invoice info */}
      <div style={{ fontSize: '11px', marginBottom: '6px' }}>
        <div style={s.row}><span>Invoice</span><span style={s.bold}>{invoice.invoiceNumber || '-'}</span></div>
        <div style={s.row}><span>Tanggal</span><span>{date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span></div>
        <div style={s.row}><span>Jam</span><span>{date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div style={s.row}><span>Kasir</span><span>{invoice.cashierName || 'Admin'}</span></div>
        <div style={s.row}><span>Pelanggan</span><span>{invoice.customerName || 'Umum'}</span></div>
      </div>

      <div style={s.dash} />

      {/* Items */}
      <div style={{ fontSize: '11px', marginBottom: '4px' }}>
        <div style={{ ...s.row, ...s.bold, marginBottom: '4px' }}>
          <span style={{ flex: 1 }}>Nama Produk</span>
          <span style={{ width: '28px', textAlign: 'center' }}>Qty</span>
          <span style={{ width: '72px', textAlign: 'right' }}>Total</span>
        </div>
        {invoice.items.map((item: any, idx: number) => {
          const name = item.productName || item.name || 'Produk';
          const qty = item.quantity || 0;
          const price = item.unitPrice || item.price || 0;
          const sub = item.subtotal || price * qty;
          return (
            <div key={idx} style={{ marginBottom: '4px' }}>
              <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '200px' }}>{name}</div>
              <div style={s.row}>
                <span style={{ color: '#444', fontSize: '10px' }}>{qty} x {fmt(price)}</span>
                <span style={{ width: '72px', textAlign: 'right' }}>{fmt(sub)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={s.dash} />

      {/* Totals */}
      <div style={{ fontSize: '11px', marginBottom: '8px' }}>
        <div style={s.row}><span>Subtotal</span><span>{fmt(invoice.totalAmount)}</span></div>
        {invoice.discountAmount > 0 && (
          <div style={s.row}><span>Diskon</span><span>-{fmt(invoice.discountAmount)}</span></div>
        )}
        <div style={s.solid} />
        <div style={{ ...s.row, ...s.bold, fontSize: '13px' }}><span>TOTAL</span><span>{fmt(invoice.grandTotal)}</span></div>
        <div style={{ ...s.row, marginTop: '4px' }}><span>Bayar ({invoice.paymentMethod})</span><span>{fmt(invoice.amountPaid)}</span></div>
        {invoice.paymentMethod === 'CASH' && (
          <div style={{ ...s.row, ...s.bold }}><span>Kembali</span><span>{fmt(Math.max(0, invoice.change))}</span></div>
        )}
      </div>

      <div style={s.dash} />

      {/* Footer */}
      <div style={{ ...s.center, fontSize: '11px', marginTop: '4px' }}>
        <div style={s.bold}>*** TERIMA KASIH ***</div>
        <div style={{ marginTop: '2px' }}>{store.footer}</div>
        <div style={{ ...s.small, marginTop: '6px', color: '#555' }}>{invoice.invoiceNumber}</div>
      </div>
    </div>
  );
}
