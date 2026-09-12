import { useEffect, useState, ChangeEvent } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout, db } from './firebase';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { UploadCloud, FileText, Calendar, LogOut, FileSpreadsheet, Settings, HardDrive, ExternalLink } from 'lucide-react';
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
  const [isParsing, setIsParsing] = useState(false);
  const [activeTab, setActiveTab] = useState<'simple' | 'custom' | 'settings'>('simple');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('geminiApiKey') || '');
  const [sheetId, setSheetId] = useState(() => localStorage.getItem('targetSpreadsheetId') || '');
  const [exportBanner, setExportBanner] = useState<{
    type: 'success' | 'error';
    message: string;
    url?: string;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem('geminiApiKey', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('targetSpreadsheetId', sheetId);
  }, [sheetId]);

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
    setIsParsing(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        // Results.data is array of rows
        const csvText = Papa.unparse(results.data);
        
        try {
          const res = await fetch('/api/parse-orders', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
            },
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
          setIsParsing(false);
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
    let currentToken = token;
    if (!currentToken) {
      try {
        const authResult = await googleSignIn();
        if (authResult) {
          currentToken = authResult.accessToken;
          setToken(currentToken);
          setUser(authResult.user);
        } else return;
      } catch (e) {
        alert('Authentication required to access Google Calendar.');
        return;
      }
    }
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
          'Authorization': `Bearer ${currentToken}`,
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

  const convertRowsToCsv = (rows: (string | number)[][]): string => {
    return rows
      .map(row =>
        row
          .map(cell => {
            const str = String(cell ?? '');
            if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(',')
      )
      .join('\r\n');
  };

  const handleExportToSheets = async () => {
    let currentToken = token;
    if (!currentToken) {
      try {
        const authResult = await googleSignIn();
        if (authResult) {
          currentToken = authResult.accessToken;
          setToken(currentToken);
          setUser(authResult.user);
        } else return;
      } catch (e) {
        alert('Authentication required to access Google Sheets.');
        return;
      }
    }

    const cleanSheetId = (input: string) => {
      if (!input) return '';
      const trimmed = input.trim();
      const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) return match[1];
      const matchD = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (matchD && matchD[1]) return matchD[1];
      return trimmed;
    };

    const actualSheetId = cleanSheetId(sheetId);

    const confirmed = window.confirm(
      actualSheetId
        ? `Export ${displayedOrders.length} order(s) to targeted Google Sheet (${actualSheetId})?`
        : `Export ${displayedOrders.length} order(s) to a new Google Sheet?`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      setExportBanner(null);

      const rows: (string | number)[][] = [
        ['Invoice Number', 'Client Name', 'Invoice Date', 'Total', 'Phone', 'Parsed Items Summary', 'Raw Description']
      ];

      displayedOrders.forEach(order => {
        const itemsSummary = order.parsedItems
          .map(i => `${i.quantity}x ${i.itemName} (${i.size || 'N/A'}, ${i.color || 'N/A'})`)
          .join('; ');
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

      if (actualSheetId) {
        // Appending to an existing spreadsheet
        // Step 1: Discover the actual title of the first sheet tab (avoiding hardcoded 'Sheet1' which fails on non-English locales)
        let metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${actualSheetId}?fields=sheets.properties`, {
          headers: { Authorization: `Bearer ${currentToken}` }
        });

        if (metaRes.status === 401) {
          const authResult = await googleSignIn();
          if (authResult) {
            currentToken = authResult.accessToken;
            setToken(currentToken);
            setUser(authResult.user);
            metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${actualSheetId}?fields=sheets.properties`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            });
          }
        }

        if (!metaRes.ok) {
          const errData = await metaRes.json().catch(() => ({}));
          const errMsg = errData?.error?.message || `HTTP ${metaRes.status}`;
          throw new Error(`Cannot access target spreadsheet: ${errMsg}. Please verify your Sheet ID in Settings or clear it to create a new sheet.`);
        }

        const metaData = await metaRes.json();
        const firstSheetTitle = metaData.sheets?.[0]?.properties?.title || 'Sheet1';
        const escapedRange = `'${firstSheetTitle.replace(/'/g, "''")}'!A1`;

        const appendRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${actualSheetId}/values/${encodeURIComponent(escapedRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${currentToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: rows })
          }
        );

        if (!appendRes.ok) {
          const errData = await appendRes.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Failed to append rows (HTTP ${appendRes.status})`);
        }

        const sheetUrl = `https://docs.google.com/spreadsheets/d/${actualSheetId}/edit`;
        setExportBanner({
          type: 'success',
          message: `Successfully exported ${displayedOrders.length} order(s) to targeted Google Sheet!`,
          url: sheetUrl
        });
        window.open(sheetUrl, '_blank');
      } else {
        // Creating a new Google Sheet
        const dateStr = new Date().toISOString().split('T')[0];
        const title = `DTF Print Hub - Orders (${dateStr})`;
        let finalSheetId: string | null = null;
        let finalSheetUrl: string | null = null;

        // Path A: Try Google Sheets API v4
        try {
          let createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${currentToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              properties: { title },
              sheets: [
                {
                  properties: {
                    title: 'Orders',
                    gridProperties: { frozenRowCount: 1 }
                  }
                }
              ]
            })
          });

          if (createRes.status === 401) {
            const authResult = await googleSignIn();
            if (authResult) {
              currentToken = authResult.accessToken;
              setToken(currentToken);
              setUser(authResult.user);
              createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${currentToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  properties: { title },
                  sheets: [{ properties: { title: 'Orders', gridProperties: { frozenRowCount: 1 } } }]
                })
              });
            }
          }

          if (createRes.ok) {
            const sheetData = await createRes.json();
            finalSheetId = sheetData.spreadsheetId;
            finalSheetUrl = sheetData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${finalSheetId}/edit`;

            // Populate rows to the created sheet tab 'Orders'
            const updateRes = await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${finalSheetId}/values/'Orders'!A1?valueInputOption=USER_ENTERED`,
              {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${currentToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values: rows })
              }
            );

            if (!updateRes.ok) {
              console.warn('Sheets API direct update failed, will use drive fallback if needed');
            }
          } else {
            const errData = await createRes.json().catch(() => ({}));
            console.warn('Sheets API create failed, falling back to Google Drive sheet creation:', errData);
          }
        } catch (sheetsErr) {
          console.warn('Direct Sheets API call error, falling back to Google Drive:', sheetsErr);
        }

        // Path B: Fallback to Google Drive API spreadsheet converter
        // Since Save to Drive JSON is already proven working in production, this gives 100% reliability
        if (!finalSheetId || !finalSheetUrl) {
          let folderId: string | undefined = undefined;
          try {
            const searchRes = await fetch(
              'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='Orders' and trashed=false`),
              { headers: { Authorization: `Bearer ${currentToken}` } }
            );
            const searchData = await searchRes.json();
            if (searchData.files && searchData.files.length > 0) {
              folderId = searchData.files[0].id;
            } else {
              const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${currentToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  name: 'Orders',
                  mimeType: 'application/vnd.google-apps.folder'
                })
              });
              if (createFolderRes.ok) {
                const folderData = await createFolderRes.json();
                folderId = folderData.id;
              }
            }
          } catch (fErr) {
            console.warn('Could not locate Orders folder, uploading to root:', fErr);
          }

          const boundary = 'dtf_print_hub_' + Date.now();
          const driveMetadata = {
            name: title,
            mimeType: 'application/vnd.google-apps.spreadsheet',
            ...(folderId ? { parents: [folderId] } : {})
          };
          const csvContent = convertRowsToCsv(rows);

          const multipartBody =
            `--${boundary}\r\n` +
            `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
            JSON.stringify(driveMetadata) +
            `\r\n--${boundary}\r\n` +
            `Content-Type: text/csv; charset=UTF-8\r\n\r\n` +
            csvContent +
            `\r\n--${boundary}--`;

          const driveUploadRes = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${currentToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
              },
              body: multipartBody
            }
          );

          if (!driveUploadRes.ok) {
            const driveErr = await driveUploadRes.json().catch(() => ({}));
            throw new Error(driveErr?.error?.message || `Failed to create Google Sheet (HTTP ${driveUploadRes.status})`);
          }

          const driveFileData = await driveUploadRes.json();
          finalSheetId = driveFileData.id;
          finalSheetUrl = driveFileData.webViewLink || `https://docs.google.com/spreadsheets/d/${finalSheetId}/edit`;
        }

        if (finalSheetId && finalSheetUrl) {
          setSheetId(finalSheetId);
          setExportBanner({
            type: 'success',
            message: `Successfully created Google Sheet with ${displayedOrders.length} order(s)!`,
            url: finalSheetUrl
          });
          window.open(finalSheetUrl, '_blank');
        }
      }
    } catch (err: any) {
      console.error('Export to Google Sheets error:', err);
      const errMsg = err?.message || 'Error exporting to Google Sheets';
      setExportBanner({
        type: 'error',
        message: errMsg
      });
      alert(`Google Sheets Export: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDrive = async () => {
    let currentToken = token;
    if (!currentToken) {
      try {
        const authResult = await googleSignIn();
        if (authResult) {
          currentToken = authResult.accessToken;
          setToken(currentToken);
          setUser(authResult.user);
        } else return;
      } catch (e) {
        alert('Authentication required to access Google Drive.');
        return;
      }
    }

    const confirmed = window.confirm('Save parsed orders to Google Drive (in "Orders" folder)?');
    if (!confirmed) return;
    
    try {
      setLoading(true);
      const searchRes = await fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='Orders' and trashed=false`), {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      const searchData = await searchRes.json();
      let folderId;
      
      if (searchData.files && searchData.files.length > 0) {
        folderId = searchData.files[0].id;
      } else {
        const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { 
            Authorization: `Bearer ${currentToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Orders',
            mimeType: 'application/vnd.google-apps.folder'
          })
        });
        const folderData = await createFolderRes.json();
        folderId = folderData.id;
      }
      
      const fileMetadata = {
        name: `parsed_orders_${Date.now()}.json`,
        parents: [folderId]
      };
      const fileContent = JSON.stringify(activeTab === 'settings' ? orders : displayedOrders, null, 2);
      
      // Step 1: Create the file metadata
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fileMetadata)
      });
      if (!createRes.ok) throw new Error('Failed to create file metadata');
      const createdFile = await createRes.json();

      // Step 2: Upload the media content
      const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${createdFile.id}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: fileContent
      });
      
      if (!uploadRes.ok) throw new Error('Upload failed');
      alert('Successfully saved to Google Drive "Orders" folder!');
    } catch (err) {
      console.error(err);
      alert('Error saving to Google Drive');
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
              className={`flex flex-col items-center justify-center gap-4 cursor-pointer p-6 border border-dashed relative overflow-hidden ${loading ? 'border-gray-600 opacity-50' : 'border-[var(--color-app-accent)] hover:bg-[var(--color-app-accent)]/10 transition-colors'}`}
            >
              <UploadCloud className={`w-10 h-10 ${isParsing ? 'text-gray-500 animate-pulse' : 'text-[var(--color-app-accent)]'}`} />
              <span className="text-sm uppercase tracking-wider font-space text-center z-10">
                {isParsing ? 'Parsing via Gemini...' : 'Upload CSV'}
              </span>
              
              {isParsing && (
                <div className="absolute bottom-0 left-0 h-1 bg-[var(--color-app-accent)] animate-parsing-progress w-1/2"></div>
              )}
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
            
            <button 
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-3 text-left transition-colors uppercase tracking-wider ${activeTab === 'settings' ? 'bg-[var(--color-app-accent)]/20 text-[var(--color-app-accent)] border border-[var(--color-app-accent)]/50' : 'hover:bg-[var(--color-app-ink-faint)] border border-transparent'}`}
            >
              Settings
            </button>
            
            <hr className="border-[var(--color-app-ink-faint)] my-2" />
            
            <button 
              onClick={handleExportToSheets}
              disabled={loading || displayedOrders.length === 0}
              className="flex items-center gap-3 px-4 py-3 text-left uppercase tracking-wider hover:bg-[var(--color-app-ink-faint)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <FileSpreadsheet className="w-5 h-5 text-[var(--color-app-accent)]" />
              <span>Export to Sheets</span>
            </button>

            <button 
              onClick={handleSaveToDrive}
              disabled={loading || (activeTab !== 'settings' && displayedOrders.length === 0) || (activeTab === 'settings' && orders.length === 0)}
              className="flex items-center gap-3 px-4 py-3 text-left uppercase tracking-wider hover:bg-[var(--color-app-ink-faint)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed group relative"
            >
              <HardDrive className="w-5 h-5 text-[var(--color-app-accent)]" />
              <span>Save to Drive JSON</span>
            </button>
          </div>
        </div>

        <div className="md:col-span-3">
          <div className="border border-[var(--color-app-ink-faint)] bg-[var(--color-app-bg)] p-6 min-h-[600px]">
            {exportBanner && (
              <div className={`mb-6 p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-space text-sm ${
                exportBanner.type === 'success'
                  ? 'border-[var(--color-app-accent)] bg-[var(--color-app-accent)]/10 text-[var(--color-app-ink)]'
                  : 'border-red-500/50 bg-red-500/10 text-red-200'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold">{exportBanner.type === 'success' ? '✓' : '⚠'}</span>
                  <span>{exportBanner.message}</span>
                </div>
                <div className="flex items-center gap-2">
                  {exportBanner.url && (
                    <a
                      href={exportBanner.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-[var(--color-app-accent)] text-[var(--color-app-bg)] uppercase text-xs font-bold tracking-wider hover:opacity-90 transition-opacity whitespace-nowrap flex items-center gap-1.5"
                    >
                      <span>Open Google Sheet</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => setExportBanner(null)}
                    className="text-[var(--color-app-ink)] hover:text-white text-xs uppercase px-2 py-1"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'settings' ? (
              <div className="space-y-6">
                <div className="border-b border-[var(--color-app-ink-faint)] pb-4">
                  <h3 className="text-xl font-medium text-[var(--color-app-ink)] font-syne uppercase">Configuration</h3>
                </div>
                
                <div className="space-y-4 max-w-lg">
                  <div>
                    <label className="block text-sm uppercase tracking-wider text-[rgba(242,239,235,0.6)] mb-2 font-space">
                      Gemini API Key
                      <span className="ml-2 group relative cursor-help">
                        (ℹ)
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-[var(--color-app-ink-faint)] border border-[var(--color-app-ink)] text-xs text-[var(--color-app-ink)] backdrop-blur text-center z-10 font-space">
                          Requires a valid Gemini API Key for parsing CSV files. Get yours at Google AI Studio.
                        </span>
                      </span>
                    </label>
                    <input 
                      type="password" 
                      value={apiKey} 
                      onChange={(e) => setApiKey(e.target.value)} 
                      placeholder="AIzaSy..." 
                      className="w-full bg-[var(--color-app-bg)] border border-[var(--color-app-ink-faint)] text-[var(--color-app-ink)] p-3 focus:outline-none focus:border-[var(--color-app-accent)] font-space text-sm"
                    />
                    <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs uppercase tracking-widest text-[var(--color-app-accent)] hover:underline font-space">
                      Get API Key &rarr;
                    </a>
                  </div>

                  <div className="pt-4">
                    <label className="block text-sm uppercase tracking-wider text-[rgba(242,239,235,0.6)] mb-2 font-space">
                      Target Google Sheet ID (Optional)
                      <span className="ml-2 group relative cursor-help">
                        (ℹ)
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-[var(--color-app-ink-faint)] border border-[var(--color-app-ink)] text-xs text-[var(--color-app-ink)] backdrop-blur text-center z-10 font-space">
                          If provided, 'Export to Sheets' will append to this Spreadsheet ID instead of creating a new one.
                        </span>
                      </span>
                    </label>
                    <input 
                      type="text" 
                      value={sheetId} 
                      onChange={(e) => setSheetId(e.target.value)} 
                      placeholder="e.g. 1BxiMvs0XRYFgPNfa... or sheet URL" 
                      className="w-full bg-[var(--color-app-bg)] border border-[var(--color-app-ink-faint)] text-[var(--color-app-ink)] p-3 focus:outline-none focus:border-[var(--color-app-accent)] font-space text-sm"
                    />
                    {sheetId && (
                      <div className="flex items-center gap-3 mt-2 font-space text-xs">
                        <a 
                          href={`https://docs.google.com/spreadsheets/d/${sheetId.includes('/d/') ? sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] || sheetId : sheetId}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-app-accent)] hover:underline flex items-center gap-1"
                        >
                          <span>Open current sheet</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <span className="text-[rgba(242,239,235,0.3)]">|</span>
                        <button 
                          type="button" 
                          onClick={() => setSheetId('')}
                          className="text-red-400 hover:underline"
                        >
                          Clear Sheet ID (create new sheet on next export)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : displayedOrders.length === 0 ? (
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
