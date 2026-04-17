import { 
  collection, 
  doc, 
  runTransaction, 
  serverTimestamp, 
  increment,
  setDoc,
  addDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface RestockPayload {
  productId: string;
  quantity: number;
  buyPrice: number;
  batchNumber?: string;
  expiryDate?: string;
  warehouseLocation?: string;
  notes?: string;
  referenceId?: string;
  referenceType?: 'PURCHASE' | 'ADJUSTMENT' | 'RETURN';
}

export async function processRestock(payload: RestockPayload) {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('User not authenticated');

  try {
    await runTransaction(db, async (transaction) => {
      const inventoryRef = doc(db, 'inventory', payload.productId);
      const inventoryDoc = await transaction.get(inventoryRef);

      let stockBefore = 0;
      if (inventoryDoc.exists()) {
        stockBefore = inventoryDoc.data().stockQuantity;
      }

      const stockAfter = stockBefore + payload.quantity;

      // Update Inventory
      transaction.set(inventoryRef, {
        productId: payload.productId,
        stockQuantity: stockAfter,
        lastBuyPrice: payload.buyPrice,
        warehouseLocation: payload.warehouseLocation || (inventoryDoc.exists() ? inventoryDoc.data().warehouseLocation : ''),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Add Batch if provided
      if (payload.batchNumber) {
        const batchRef = doc(collection(db, 'inventory_batches'));
        transaction.set(batchRef, {
          productId: payload.productId,
          batchNumber: payload.batchNumber,
          expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : null,
          quantityRemaining: payload.quantity,
          buyPrice: payload.buyPrice,
          receivedDate: serverTimestamp()
        });
      }

      // Log Transaction
      const transRef = doc(collection(db, 'stock_transactions'));
      transaction.set(transRef, {
        productId: payload.productId,
        transactionType: 'IN',
        quantity: payload.quantity,
        pricePerUnit: payload.buyPrice,
        referenceId: payload.referenceId || null,
        referenceType: payload.referenceType || 'PURCHASE',
        notes: payload.notes || '',
        createdBy: userId,
        createdAt: serverTimestamp(),
        stockBefore,
        stockAfter
      });
    });

    return { success: true };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'inventory/stock_transactions');
    return { success: false };
  }
}

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface CheckoutPayload {
  items: CartItem[];
  paymentMethod: 'CASH' | 'QRIS' | 'DEBIT' | 'KREDIT';
  amountPaid: number;
  customerName?: string;
  discount?: number;
}

export async function processCheckout(payload: CheckoutPayload) {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('User not authenticated');

  try {
    const saleId = await runTransaction(db, async (transaction) => {
      const itemResults = [];
      let totalAmount = 0;

      // 1. Validate and Lock Stocks
      for (const item of payload.items) {
        const inventoryRef = doc(db, 'inventory', item.productId);
        const inventoryDoc = await transaction.get(inventoryRef);

        if (!inventoryDoc.exists() || inventoryDoc.data().stockQuantity < item.quantity) {
          throw new Error(`Stok tidak mencukupi untuk produk ID: ${item.productId}`);
        }

        const invData = inventoryDoc.data();
        const stockBefore = invData.stockQuantity;
        const stockAfter = stockBefore - item.quantity;

        itemResults.push({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          buyPrice: invData.lastBuyPrice || 0,
          stockBefore,
          stockAfter,
          inventoryRef
        });

        totalAmount += item.unitPrice * item.quantity;
      }

      const discount = payload.discount || 0;
      const grandTotal = totalAmount - discount;
      const changeAmount = payload.amountPaid - grandTotal;
      const invoiceNumber = `INV-${Date.now()}`;

      // 2. Create Sale Header
      const saleRef = doc(collection(db, 'sales'));
      transaction.set(saleRef, {
        invoiceNumber,
        cashierId: userId,
        customerName: payload.customerName || 'Umum',
        totalAmount,
        discountAmount: discount,
        grandTotal,
        paymentMethod: payload.paymentMethod,
        amountPaid: payload.amountPaid,
        changeAmount: Math.max(0, changeAmount),
        status: 'COMPLETED',
        createdAt: serverTimestamp()
      });

      // 3. Process Items and Update Stocks
      for (const res of itemResults) {
        // Create Sale Item
        const itemRef = doc(collection(db, `sales/${saleRef.id}/items`));
        transaction.set(itemRef, {
          productId: res.productId,
          productName: res.productName,
          quantity: res.quantity,
          unitPrice: res.unitPrice,
          buyPrice: res.buyPrice,
          subtotal: res.unitPrice * res.quantity
        });

        // Update Inventory
        transaction.update(res.inventoryRef, {
          stockQuantity: res.stockAfter,
          updatedAt: serverTimestamp()
        });

        // Log Transaction
        const transRef = doc(collection(db, 'stock_transactions'));
        transaction.set(transRef, {
          productId: res.productId,
          transactionType: 'OUT',
          quantity: res.quantity,
          pricePerUnit: res.unitPrice,
          referenceId: saleRef.id,
          referenceType: 'SALE',
          createdBy: userId,
          createdAt: serverTimestamp(),
          stockBefore: res.stockBefore,
          stockAfter: res.stockAfter
        });
      }

      return { saleId: saleRef.id, invoiceNumber };
    });

    return { success: true, ...saleId };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'sales/inventory');
    return { success: false, invoiceNumber: '', saleId: '' };
  }
}
