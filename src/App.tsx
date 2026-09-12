import { useEffect, useState, ChangeEvent } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout, db } from './firebase';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { UploadCloud, FileText, Calendar, LogOut, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';

interface OrderItem {
  category: 'Tekstil' | 'Promo';
  itemName: string;
  quantity: number;
  size: string | null;
  color: string | null;
}

interface ParsedOrder {
  invoiceNumber: string;
  clientName: string;
  oib: string;
  total: string;
  invoiceDate: string;
  paymentDate: string;
  rawDescription: string;
  isCustom: boolean;
  contactPhone: string;
  parsedItems: OrderItem[];
}

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [orders, setOrders] = useState<ParsedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'simple' | 'custom'>('simple');

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setToken(token);
        setUser(user);
        setNeedsAuth(false);
        loadOrders(user.uid);
      },
      () => setNeedsAuth(true)
    );
    return () => unsubscribe();
  }, []);

  const loadOrders = async (userId: string) => {
    try {
      const querySnapshot = await getDocs(collection(db, 'users', userId, 'orders'));
      const loadedOrders: ParsedOrder[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        loadedOrders.push({
          ...data,
          parsedItems: data.parsedItemsJson ? JSON.parse(data.parsedItemsJson) : []
        } as ParsedOrder);
      });
      setOrders(loadedOrders);
    } catch (err) {
      console.error('Error loading orders:', err);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
        loadOrders(result.user.uid);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setLoading(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        // Results.data is array of rows
        const csvText = Papa.unparse(results.data);
        
        try {
          const res = await fetch('/api/parse-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csvData: csvText })
          });
          
          if (!res.ok) throw new Error('API Error');
          const data = await res.json();
          const parsedOrders: ParsedOrder[] = data.orders;
          
          if (user) {
            // Save to Firestore
            for (const order of parsedOrders) {
              const orderId = order.invoiceNumber || Date.now().toString();
              await setDoc(doc(db, 'users', user.uid, 'orders', orderId), {
                userId: user.uid,
                invoiceNumber: order.invoiceNumber,
                clientName: order.clientName,
                oib: order.oib || '',
                total: order.total || '',
                invoiceDate: order.invoiceDate || '',
                paymentDate: order.paymentDate || '',
                rawDescription: order.rawDescription || '',
                isCustom: !!order.isCustom,
                contactPhone: order.contactPhone || '',
                parsedItemsJson: JSON.stringify(order.parsedItems || []),
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
            }
            loadOrders(user.uid);
          }
        } catch (error) {
          console.error('Error parsing:', error);
          alert('Failed to parse orders');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  if (needsAuth) {
    return (
      <main className="login-layout">
        <section className="visual-pane">
          <div>
            <div className="app-label">[ Terminal / 001 ]</div>
            <h1 className="hero-h1">DTF<br/>PRINT<br/>HUB</h1>
          </div>
          <div className="meta-footer">
            <div>SYS_VER: 4.3.3</div>
            <div>NODE: PRODUCTION_A</div>
            <div><span className="status-dot"></span>ACTIVE_READY</div>
          </div>
          <div className="decor-line"></div>
        </section>

        <section className="form-pane">
          <div className="app-label">Access Protocol</div>
          <p className="login-desc">Sign in to manage your local client folders, unstructured CSV orders, and production schedules.</p>
          
          <button className="login-btn" onClick={handleLogin} disabled={isLoggingIn}>
            <svg viewBox="0 0 48 48">
              <path fill="currentColor" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="currentColor" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="currentColor" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="currentColor" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
            </svg>
            Sign in with Google
          </button>
        </section>
      </main>
    );
  }

  const handleSchedule = async (order: ParsedOrder) => {
    if (!token) return;
    const confirmed = window.confirm(`Schedule production for ${order.clientName}?`);
    if (!confirmed) return;

    try {
      const event = {
        summary: `Production: ${order.clientName}`,
        description: `Invoice: ${order.invoiceNumber}\nTotal: ${order.total}\nPhone: ${order.contactPhone}`,
        start: {
          dateTime: new Date(Date.now() + 86400000).toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: new Date(Date.now() + 86400000 + 3600000).toISOString(),
          timeZone: 'UTC',
        },
      };

      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      });

      if (!res.ok) throw new Error('Failed to create event');
      alert('Event scheduled successfully on Google Calendar!');
    } catch (err) {
      console.error(err);
      alert('Error scheduling event');
    }
  };

  const handleExportToSheets = async () => {
    if (!token) return;
    const confirmed = window.confirm('Export current orders to a new Google Sheet?');
    if (!confirmed) return;
    
    try {
      setLoading(true);
      const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: `DTF Print Hub Export - ${new Date().toLocaleDateString()}`
          }
        })
      });
      if (!createRes.ok) throw new Error('Failed to create spreadsheet');
      const sheetData = await createRes.json();
      const spreadsheetId = sheetData.spreadsheetId;
      const spreadsheetUrl = sheetData.spreadsheetUrl;
      
      const rows = [
        ['Invoice Number', 'Client Name', 'Invoice Date', 'Total', 'Phone', 'Parsed Items Summary', 'Raw Description']
      ];
      
      displayedOrders.forEach(order => {
        const itemsSummary = order.parsedItems.map(i => `${i.quantity}x ${i.itemName} (${i.size || 'N/A'}, ${i.color || 'N/A'})`).join('\n');
        rows.push([
          order.invoiceNumber,
          order.clientName,
          order.invoiceDate,
          order.total,
          order.contactPhone,
          itemsSummary,
          order.rawDescription
        ]);
      });
      
      const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:G${rows.length}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: rows
        })
      });
      if (!updateRes.ok) throw new Error('Failed to update spreadsheet');
      
      alert(`Successfully exported to Google Sheets!\nOpening in new tab...`);
      window.open(spreadsheetUrl, '_blank');
    } catch (err) {
      console.error(err);
      alert('Error exporting to Google Sheets');
    } finally {
      setLoading(false);
    }
  };

  const simpleOrders = orders.filter(o => !o.isCustom);
  const customOrders = orders.filter(o => o.isCustom);
  const displayedOrders = activeTab === 'simple' ? simpleOrders : customOrders;

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-12 font-inter">
      <header className="flex justify-between items-center mb-12 border-b border-[var(--color-app-ink-faint)] pb-6">
        <h1 className="text-2xl font-bold tracking-widest text-[var(--color-app-ink)] flex items-center gap-3 font-syne">
          <FileText className="w-6 h-6 text-[var(--color-app-accent)]" /> DTF PRINT HUB
        </h1>
        <div className="flex gap-4 items-center">
          <span className="text-sm text-[rgba(242,239,235,0.6)] font-space uppercase tracking-widest">{user?.email}</span>
          <button onClick={logout} className="p-2 hover:bg-[var(--color-app-ink-faint)] rounded transition-colors text-[var(--color-app-ink)]">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="grid md:grid-cols-4 gap-8">
        <div className="md:col-span-1 space-y-4">
          <div className="border border-[var(--color-app-ink-faint)] bg-[var(--color-app-bg)] p-6 text-center">
            <input 
              type="file" 
              id="csv-upload" 
              accept=".csv" 
              className="hidden" 
              onChange={handleFileUpload} 
              disabled={loading}
            />
            <label 
              htmlFor="csv-upload" 
              className={`flex flex-col items-center justify-center gap-4 cursor-pointer p-6 border border-dashed ${loading ? 'border-gray-600 opacity-50' : 'border-[var(--color-app-accent)] hover:bg-[var(--color-app-accent)]/10 transition-colors'}`}
            >
              <UploadCloud className="w-10 h-10 text-[var(--color-app-accent)]" />
              <span className="text-sm uppercase tracking-wider font-space">{loading ? 'Parsing...' : 'Upload CSV'}</span>
            </label>
          </div>
          
          <div className="border border-[var(--color-app-ink-faint)] bg-[var(--color-app-bg)] p-4 flex flex-col gap-2 font-space text-sm">
            <button 
              onClick={() => setActiveTab('simple')}
              className={`px-4 py-3 text-left transition-colors uppercase tracking-wider ${activeTab === 'simple' ? 'bg-[var(--color-app-accent)]/20 text-[var(--color-app-accent)] border border-[var(--color-app-accent)]/50' : 'hover:bg-[var(--color-app-ink-faint)] border border-transparent'}`}
            >
              Logo Palčića ({simpleOrders.length})
            </button>
            <button 
              onClick={() => setActiveTab('custom')}
              className={`px-4 py-3 text-left transition-colors uppercase tracking-wider ${activeTab === 'custom' ? 'bg-[var(--color-app-accent)]/20 text-[var(--color-app-accent)] border border-[var(--color-app-accent)]/50' : 'hover:bg-[var(--color-app-ink-faint)] border border-transparent'}`}
            >
              Custom Orders ({customOrders.length})
            </button>
            
            <hr className="border-[var(--color-app-ink-faint)] my-2" />
            
            <button 
              onClick={handleExportToSheets}
              disabled={loading || displayedOrders.length === 0}
              className="flex items-center gap-3 px-4 py-3 text-left uppercase tracking-wider hover:bg-[var(--color-app-ink-faint)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="w-5 h-5 text-[var(--color-app-accent)]" />
              <span>Export to Sheets</span>
            </button>
          </div>
        </div>

        <div className="md:col-span-3">
          <div className="border border-[var(--color-app-ink-faint)] bg-[var(--color-app-bg)] p-6 min-h-[600px]">
            {displayedOrders.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[rgba(242,239,235,0.4)] font-space uppercase">
                No orders found in this category.
              </div>
            ) : (
              <div className="space-y-6">
                {displayedOrders.map((order) => (
                  <div key={order.invoiceNumber} className="bg-[var(--color-app-bg)] p-5 border border-[var(--color-app-ink-faint)]">
                    <div className="flex justify-between items-start mb-4 border-b border-[var(--color-app-ink-faint)] pb-4">
                      <div>
                        <h3 className="text-lg font-medium text-[var(--color-app-ink)]">{order.clientName}</h3>
                        <p className="text-sm text-[rgba(242,239,235,0.6)] font-space uppercase">Invoice: {order.invoiceNumber} • Date: {order.invoiceDate}</p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        <p className="text-[var(--color-app-accent)] font-space font-bold">{order.total}</p>
                        <p className="text-sm text-[rgba(242,239,235,0.6)] font-space">{order.contactPhone}</p>
                        <button 
                          onClick={() => handleSchedule(order)}
                          className="mt-2 flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--color-app-ink)] hover:text-[var(--color-app-bg)] bg-[var(--color-app-ink-faint)] hover:bg-[var(--color-app-accent)] px-3 py-1.5 transition-colors font-space"
                        >
                          <Calendar className="w-3 h-3" /> Schedule
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm uppercase tracking-wider text-[rgba(242,239,235,0.6)] mb-2 font-space">Parsed Items</h4>
                        <ul className="space-y-2">
                          {order.parsedItems.map((item, idx) => (
                            <li key={idx} className="flex justify-between text-sm bg-[var(--color-app-ink-faint)] p-2">
                              <span>
                                <span className="text-[var(--color-app-accent)] font-bold">{item.quantity}x</span> {item.itemName}
                              </span>
                              <span className="text-[rgba(242,239,235,0.6)] font-space text-xs">
                                {item.size && <span className="mr-2">Size: {item.size}</span>}
                                {item.color && <span>{item.color}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-sm uppercase tracking-wider text-[rgba(242,239,235,0.6)] mb-2 font-space">Original Instructions</h4>
                        <p className="text-sm text-[rgba(242,239,235,0.8)] bg-[var(--color-app-ink-faint)] p-3 font-space whitespace-pre-wrap">
                          {order.rawDescription}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
